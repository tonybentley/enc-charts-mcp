import { z } from 'zod';
import { ChartMetadata } from '../types/enc.js';
import { chartQueryService } from '../services/chartQuery.js';
import { cacheManager } from '../utils/cache.js';
import { s57Parser } from '../services/s57Parser.js';
import { chartDownloadService } from '../services/chartDownload.js';
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

export async function getChartMetadataHandler(args: unknown): Promise<{
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
    // Initialize cache manager
    await cacheManager.initialize();
    
    let metadata: ChartMetadata | null = null;
    let chartId: string | undefined;
    let fromCache = false;
    let s57Metadata: any = null;

    if ('coordinates' in params) {
      // Query by coordinates
      const { lat, lon } = params.coordinates;
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
    } else {
      // Query by chart ID
      chartId = params.chartId;
      
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
        console.debug('Could not extract S-57 metadata:', error);
      }
    }

    // Merge metadata from different sources
    const fullMetadata = {
      ...metadata,
      cached: fromCache || (chartId ? await cacheManager.isChartCached(chartId) : false),
      downloadUrl: `https://www.charts.noaa.gov/ENCs/${chartId}/${chartId}.zip`,
      s57Metadata: s57Metadata,
      source: 'NOAA ENC Catalog',
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