import { z } from 'zod';
import { ChartFeature, S57Properties } from '../types/enc.js';
import { getCacheManager, getChartDownloadService, getChartQueryService } from '../services/serviceInitializer.js';
import { s57Parser } from '../services/s57Parser.js';
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
  }),
]);

export async function getChartHandler(args: unknown): Promise<{
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

    let chartId: string;
    let chartFiles;

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

      // Check if chart is cached
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
    } else {
      // Handle chartId-based request
      chartId = params.chartId;
      
      // Check cache first
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

    if (!chartFiles) {
      throw new Error('Failed to retrieve chart files');
    }

    // Parse S-57 files and extract features
    let features: Feature[] = [];
    
    try {
      // Parse the primary S-57 file
      if (chartFiles.s57Files.length > 0) {
        const s57FilePath = path.join(chartFiles.basePath, chartFiles.s57Files[0]);
        
        // Build parse options from parameters
        const parseOptions: any = {};
        if (params.boundingBox) {
          parseOptions.boundingBox = params.boundingBox;
        }
        if (params.featureTypes) {
          parseOptions.featureTypes = params.featureTypes;
        }
        if (params.depthRange) {
          parseOptions.depthRange = params.depthRange;
        }
        
        // Parse the chart
        const featureCollection = await s57Parser.parseChart(s57FilePath, parseOptions);
        features = featureCollection.features;
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

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              chartId,
              features: chartFeatures,
              featureCount: chartFeatures.length,
              s57Files: chartFiles.s57Files,
              source: 'NOAA ENC',
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