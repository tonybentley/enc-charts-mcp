import { z } from 'zod';
import { ChartFeature, S57Properties } from '../types/enc.js';
import { getCacheManager, getChartDownloadService, getChartQueryService, getChartFetcher, getS57DatabaseParser } from '../services/serviceInitializer.js';
import { s57Parser } from '../services/s57Parser.js';
import { S57DatabaseParseOptions } from '../services/S57DatabaseParser.js';
import path from 'path';
import { Feature } from 'geojson';

const GetChartSchema = z.union([
  z.object({
    chartId: z.string(),
    boundingBox: z
      .object({
        minLat: z.number(),
        maxLat: z.number(),
        minLon: z.number(),
        maxLon: z.number(),
      })
      .optional(),
    featureTypes: z.array(z.string()).optional(),
    depthRange: z
      .object({
        min: z.number(),
        max: z.number(),
      })
      .optional(),
    limit: z.number().min(1).max(1000).default(100).optional(),
    offset: z.number().min(0).default(0).optional(),
  }),
  z.object({
    coordinates: z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    }),
    boundingBox: z
      .object({
        minLat: z.number(),
        maxLat: z.number(),
        minLon: z.number(),
        maxLon: z.number(),
      })
      .optional(),
    featureTypes: z.array(z.string()).optional(),
    depthRange: z
      .object({
        min: z.number(),
        max: z.number(),
      })
      .optional(),
    includeNearby: z.boolean().optional(),
    limit: z.number().min(1).max(1000).default(100).optional(),
    offset: z.number().min(0).default(0).optional(),
  }),
]);

export async function getChartHandler(
  args: unknown,
  _dbManager?: unknown,
  _chartRepository?: unknown,
  featureRepository?: unknown
): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  let params: z.infer<typeof GetChartSchema>;
  
  try {
    params = GetChartSchema.parse(args);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : 'Unknown error',
              args,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  try {
    // Get properly initialized services
    const cacheManager = await getCacheManager();
    const chartQueryService = await getChartQueryService();
    const chartDownloadService = await getChartDownloadService();
    const chartFetcher = await getChartFetcher();
    const s57DatabaseParser = await getS57DatabaseParser();

    let chartId: string;
    let chartFiles;
    let fromDatabase = false;

    // Handle coordinate-based request
    if ('coordinates' in params) {
      const { lat, lon } = params.coordinates;

      // Query NOAA for charts at this location
      const availableCharts = await chartQueryService.queryByCoordinates(lat, lon);
      
      if (availableCharts.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'No charts found for the specified coordinates',
                  coordinates: params.coordinates,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Select best chart
      const selectedChart = chartQueryService.selectBestChart(availableCharts, lat, lon);
      if (!selectedChart) {
        throw new Error('Failed to select appropriate chart');
      }

      chartId = selectedChart.id;

      // Use database-aware fetcher if available
      if (chartFetcher) {
        const fetchResult = await chartFetcher.fetchChart(chartId);
        chartFiles = fetchResult;
        fromDatabase = fetchResult.fromDatabase;
      } else {
        // Legacy file-based approach
        const cached = await cacheManager.isChartCached(chartId);
        const edition = typeof selectedChart.edition === 'string' 
          ? parseInt(selectedChart.edition, 10) 
          : selectedChart.edition;
        if (!cached || await cacheManager.needsUpdate(chartId, edition)) {
          // Download chart
          chartFiles = await chartDownloadService.downloadChart(chartId);
          await cacheManager.addChart(chartId, selectedChart);
        } else {
          chartFiles = await chartDownloadService.getCachedChart(chartId);
        }
      }
    } else {
      // Handle chartId-based request
      chartId = params.chartId;
      
      // Use database-aware fetcher if available
      if (chartFetcher) {
        const fetchResult = await chartFetcher.fetchChart(chartId);
        chartFiles = fetchResult;
        fromDatabase = fetchResult.fromDatabase;
      } else {
        // Legacy file-based approach
        const cached = await cacheManager.isChartCached(chartId);
        if (!cached) {
          // Download chart
          chartFiles = await chartDownloadService.downloadChart(chartId);
          
          // Query metadata for the chart
          const metadata = await chartQueryService.queryByChartId(chartId);
          if (metadata) {
            await cacheManager.addChart(chartId, metadata);
          }
        } else {
          chartFiles = await chartDownloadService.getCachedChart(chartId);
        }
      }
    }

    if (!chartFiles) {
      throw new Error('Failed to retrieve chart files');
    }

    // Log chart files info for debugging
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
      console.error(`[GetChart] Chart files retrieved for ${chartId}:`);
      console.error(`[GetChart] - Base path: ${chartFiles.basePath}`);
      console.error(`[GetChart] - S57 files: ${chartFiles.s57Files.join(', ')}`);
      console.error(`[GetChart] - Total files: ${chartFiles.allFiles.length}`);
      console.error(`[GetChart] - From database: ${fromDatabase}`);
    }

    // Parse S-57 files and extract features
    let features: Feature[] = [];
    let paginationInfo = {
      totalCount: 0,
      hasMore: false
    };
    
    // Store actual pagination parameters used
    let actualLimit = 'limit' in params && params.limit ? params.limit : 20;
    let actualOffset = 'offset' in params && params.offset ? params.offset : 0;
    
    try {
      // Build parse options from parameters
      const parseOptions: S57DatabaseParseOptions = {};
      if ('boundingBox' in params && params.boundingBox) {
        parseOptions.boundingBox = params.boundingBox;
      }
      if ('featureTypes' in params && params.featureTypes) {
        parseOptions.featureTypes = params.featureTypes;
        if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
          console.error(`[GetChart] Filtering for feature types: ${params.featureTypes.join(', ')}`);
        }
      }
      if ('depthRange' in params && params.depthRange) {
        parseOptions.depthRange = params.depthRange;
      }

      // Database-first approach: Check if features exist in database
      if (s57DatabaseParser && featureRepository) {
        const hasFeatures = await s57DatabaseParser.hasChartFeatures(chartId);
        
        if (hasFeatures) {
          // Features exist in database - retrieve them
          if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
            console.error(`[GetChart] Features found in database for ${chartId}`);
          }
          
          // Add pagination limits to parseOptions
          const dbOptions = {
            ...parseOptions,
            limit: 'limit' in params && params.limit ? params.limit : 20, // Default 20 features
            offset: 'offset' in params && params.offset ? params.offset : 0
          };
          
          const featureCollection = await s57DatabaseParser.getChartFeaturesFromDatabase(chartId, dbOptions);
          features = featureCollection.features;
          
          if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
            console.error(`[GetChart] Retrieved ${features.length} features from database (total: ${featureCollection.totalCount}, hasMore: ${featureCollection.hasMore})`);
          }
          
          // Add pagination info to response metadata
          paginationInfo.totalCount = featureCollection.totalCount;
          paginationInfo.hasMore = featureCollection.hasMore;
        } else {
          // No features in database - parse and store them
          if (chartFiles.s57Files.length > 0) {
            const s57FilePath = path.join(chartFiles.basePath, chartFiles.s57Files[0]);
            if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
              console.error(`[GetChart] No features in database, parsing S-57 file: ${s57FilePath}`);
            }
            
            // Parse to database (returns stats, not features)
            const parseResult = await s57DatabaseParser.parseChartToDatabase(
              s57FilePath,
              chartId,
              { ...parseOptions, clearExisting: true }
            );
            
            if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
              console.error(`[GetChart] Stored ${parseResult.featuresStored} features in database (parse: ${parseResult.parseDuration}ms, store: ${parseResult.storeDuration}ms)`);
            }
            
            // Now retrieve from database with pagination
            const dbOptions = {
              ...parseOptions,
              limit: 'limit' in params && params.limit ? params.limit : 20,
              offset: 'offset' in params && params.offset ? params.offset : 0
            };
            
            const featureCollection = await s57DatabaseParser.getChartFeaturesFromDatabase(chartId, dbOptions);
            features = featureCollection.features;
            paginationInfo.totalCount = featureCollection.totalCount;
            paginationInfo.hasMore = featureCollection.hasMore;
          }
        }
      } else {
        // No database support - fallback to file-based parsing
        if (chartFiles.s57Files.length > 0) {
          const s57FilePath = path.join(chartFiles.basePath, chartFiles.s57Files[0]);
          if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
            console.error(`[GetChart] No database support, parsing S-57 file directly: ${s57FilePath}`);
          }
          
          const featureCollection = await s57Parser.parseChart(s57FilePath, parseOptions);
          features = featureCollection.features;
          
          // Apply manual pagination for file-based approach
          actualLimit = 'limit' in params && params.limit ? params.limit : 100; // Higher default for file-based
          actualOffset = 'offset' in params && params.offset ? params.offset : 0;
          paginationInfo.totalCount = features.length;
          features = features.slice(actualOffset, actualOffset + actualLimit);
          paginationInfo.hasMore = actualOffset + actualLimit < paginationInfo.totalCount;
        }
      }
      
      if (features.length === 0 && chartFiles.s57Files.length === 0) {
        if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
          console.error(`[GetChart] ERROR: No S-57 files available to parse`);
        }
      }
    } catch (parseError) {
      // Return error response for S-57 parsing failure
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: 'Failed to parse S-57 chart data',
                details: parseError instanceof Error ? parseError.message : 'Unknown parsing error',
                chartId,
                s57Files: chartFiles.s57Files,
                hint: 'The chart was downloaded successfully but could not be parsed. This may indicate an issue with the S-57 parser or an unsupported chart format.',
              },
              null,
              2
            ),
          },
        ],
      };
    }
    
    // Convert GeoJSON features to ChartFeature format for response
    const chartFeatures: ChartFeature[] = features.map(f => ({
      id: String(f.id || `${chartId}-${Math.random()}`),
      type: (f.properties as S57Properties)?._featureType || 'UNKNOWN',
      geometry: f.geometry,
      properties: f.properties as S57Properties
    }));

    // Get pagination info (set by database queries or manual pagination)
    const totalFeatures = paginationInfo.totalCount || chartFeatures.length;
    const hasMore = paginationInfo.hasMore || false;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              chartId,
              features: chartFeatures,
              featureCount: chartFeatures.length,
              totalFeatures,
              hasMore,
              limit: actualLimit,
              offset: actualOffset,
              s57Files: chartFiles.s57Files,
              source: fromDatabase ? 'Database' : 'File Cache',
              databaseEnabled: !!s57DatabaseParser && !!featureRepository,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : 'Unknown error',
              params,
            },
            null,
            2
          ),
        },
      ],
    };
  }
}