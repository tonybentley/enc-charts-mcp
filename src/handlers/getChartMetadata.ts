import { z } from 'zod';
import { ChartMetadata } from '../types/enc.js';
import { getCacheManager, getChartQueryService, getChartDownloadService } from '../services/serviceInitializer.js';
import { s57Parser } from '../services/s57Parser.js';
import { ChartRepository } from '../database/repositories/ChartRepository.js';
import path from 'path';

const GetChartMetadataSchema = z.union([
  z.object({
    chartId: z.string(),
  }),
  z.object({
    coordinates: z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    }),
  }),
]);

export async function getChartMetadataHandler(
  args: unknown,
  _dbManager?: unknown,
  chartRepository?: ChartRepository
): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  let params: z.infer<typeof GetChartMetadataSchema>;
  
  try {
    params = GetChartMetadataSchema.parse(args);
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
    
    let metadata: ChartMetadata | null = null;
    let chartId: string | undefined;
    let fromCache = false;
    let fromDatabase = false;
    let s57Metadata: Record<string, unknown> | null = null;

    if ('coordinates' in params) {
      // Query by coordinates - try database first
      const { lat, lon } = params.coordinates;
      
      if (chartRepository) {
        const dbCharts = await chartRepository.findByCoordinates(lat, lon);
        if (dbCharts.length > 0) {
          // Convert first database record to ChartMetadata
          const record = dbCharts[0]; // Most detailed chart (lowest scale)
          metadata = {
            id: record.chart_id,
            name: record.chart_name,
            scale: record.scale,
            producer: 'NOAA',
            format: 'S-57' as const,
            edition: record.edition || 0,
            updateDate: record.update_date ? new Date(record.update_date) : undefined,
            lastUpdate: record.update_date || '',
            boundingBox: record.bbox_minlon !== null && record.bbox_minlat !== null && 
                         record.bbox_maxlon !== null && record.bbox_maxlat !== null ? {
              minLon: record.bbox_minlon as number,
              maxLon: record.bbox_maxlon as number,
              minLat: record.bbox_minlat as number,
              maxLat: record.bbox_maxlat as number
            } : undefined
          };
          chartId = record.chart_id;
          fromDatabase = true;
        }
      }
      
      // Fallback to catalog search if not in database
      if (!metadata) {
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

        // Select best chart for the coordinates
        const selectedChart = chartQueryService.selectBestChart(availableCharts, lat, lon);
        if (selectedChart) {
          metadata = selectedChart;
          chartId = selectedChart.id;
        }
      }
    } else {
      // Query by chart ID - try database first
      chartId = params.chartId;
      
      if (chartRepository) {
        const dbChart = await chartRepository.getById(chartId);
        if (dbChart) {
          metadata = {
            id: dbChart.chart_id,
            name: dbChart.chart_name,
            scale: dbChart.scale,
            producer: 'NOAA',
            format: 'S-57' as const,
            edition: dbChart.edition || 0,
            updateDate: dbChart.update_date ? new Date(dbChart.update_date) : undefined,
            lastUpdate: dbChart.update_date || '',
            boundingBox: dbChart.bbox_minlon !== null && dbChart.bbox_minlat !== null && 
                         dbChart.bbox_maxlon !== null && dbChart.bbox_maxlat !== null ? {
              minLon: dbChart.bbox_minlon as number,
              maxLon: dbChart.bbox_maxlon as number,
              minLat: dbChart.bbox_minlat as number,
              maxLat: dbChart.bbox_maxlat as number
            } : undefined
          };
          fromDatabase = true;
        }
      }
      
      // Fallback to cache and catalog if not in database
      if (!metadata) {
        // Check cache first
        const cachedMetadata = await cacheManager.getChartMetadata(chartId);
        if (cachedMetadata) {
          metadata = cachedMetadata;
          fromCache = true;
        } else {
          // Query from catalog
          metadata = await chartQueryService.queryByChartId(chartId);
          if (metadata) {
            await cacheManager.addChart(chartId, metadata);
          }
        }
      }
    }

    if (!metadata) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
            {
              error: 'Chart not found',
              chartId: chartId || 'unknown',
            },
            null,
            2
          ),
          },
        ],
      };
    }

    // Try to get additional metadata from S-57 file if chart is cached
    if (chartId && await cacheManager.isChartCached(chartId)) {
      try {
        const chartFiles = await chartDownloadService.getCachedChart(chartId);
        if (chartFiles && chartFiles.s57Files.length > 0) {
          const s57FilePath = path.join(chartFiles.basePath, chartFiles.s57Files[0]);
          s57Metadata = await s57Parser.getChartMetadata(s57FilePath);
        }
      } catch (error) {
        // Ignore S-57 parsing errors for metadata
        // Could not extract S-57 metadata - this is expected for uncached charts
      }
    }

    // Merge metadata from different sources
    const fullMetadata = {
      ...metadata,
      cached: fromCache || (chartId ? await cacheManager.isChartCached(chartId) : false),
      inDatabase: fromDatabase,
      downloadUrl: `https://www.charts.noaa.gov/ENCs/${chartId}.zip`,
      s57Metadata: s57Metadata,
      source: fromDatabase ? 'Database' : (fromCache ? 'Cache' : 'NOAA ENC Catalog'),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(fullMetadata, null, 2),
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