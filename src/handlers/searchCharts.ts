import { z } from 'zod';
import { ChartMetadata } from '../types/enc.js';
import { chartQueryService } from '../services/chartQuery.js';
import { cacheManager } from '../utils/cache.js';

const SearchChartsSchema = z.object({
  query: z.string().optional(),
  scale: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  boundingBox: z
    .object({
      minLat: z.number(),
      maxLat: z.number(),
      minLon: z.number(),
      maxLon: z.number(),
    })
    .optional(),
  format: z.enum(['S-57', 'S-101']).optional(),
});

export async function searchChartsHandler(args: unknown): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  try {
    const params = SearchChartsSchema.parse(args);

    // Initialize cache manager if needed
    await cacheManager.initialize();

    let results: ChartMetadata[] = [];

    // First, search cached charts if we have a bounding box
    if (params.boundingBox) {
      const cachedCharts = await cacheManager.searchCachedCharts(params.boundingBox);
      results.push(...cachedCharts);
    }

    // Then query the XML catalog for additional charts
    if (params.boundingBox) {
      const catalogCharts = await chartQueryService.queryByBoundingBox(
        params.boundingBox.minLat,
        params.boundingBox.maxLat,
        params.boundingBox.minLon,
        params.boundingBox.maxLon
      );
      
      // Merge results, avoiding duplicates
      const existingIds = new Set(results.map(c => c.id));
      for (const chart of catalogCharts) {
        if (!existingIds.has(chart.id)) {
          results.push(chart);
        }
      }
    } else {
      // If no bounding box, get all charts from catalog (limited for performance)
      const catalogStatus = await chartQueryService.getCatalogStatus();
      if (catalogStatus.chartCount > 0) {
        // For search without bounds, we need to implement a more efficient approach
        // For now, just search cached charts
        const cachedCharts = await cacheManager.searchCachedCharts();
        results.push(...cachedCharts);
      }
    }

    // Apply filters
    let filtered = results;

    if (params.query) {
      const query = params.query.toLowerCase();
      filtered = filtered.filter(
        (chart) =>
          chart.id.toLowerCase().includes(query) ||
          chart.name.toLowerCase().includes(query) ||
          (chart.producer && chart.producer.toLowerCase().includes(query))
      );
    }

    if (params.scale) {
      filtered = filtered.filter((chart) => {
        if (params.scale?.min && chart.scale < params.scale.min) return false;
        if (params.scale?.max && chart.scale > params.scale.max) return false;
        return true;
      });
    }

    if (params.format) {
      filtered = filtered.filter((chart) => {
        // Default to S-57 if format not specified in metadata
        const chartFormat = chart.format || 'S-57';
        return chartFormat === params.format;
      });
    }

    // Sort results by scale (most detailed first) and then by name
    filtered.sort((a, b) => {
      const scaleDiff = a.scale - b.scale;
      if (scaleDiff !== 0) return scaleDiff;
      return a.name.localeCompare(b.name);
    });

    // Add cache status to results
    const cachedIds = new Set<string>();
    for (const chart of filtered) {
      if (await cacheManager.isChartCached(chart.id)) {
        cachedIds.add(chart.id);
      }
    }

    const enhancedResults = filtered.map(chart => ({
      ...chart,
      cached: cachedIds.has(chart.id),
      downloadUrl: `https://www.charts.noaa.gov/ENCs/${chart.id}/${chart.id}.zip`
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              results: enhancedResults,
              count: enhancedResults.length,
              query: params,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    let errorMessage = 'Unknown error';
    let params = args;
    
    if (error instanceof z.ZodError) {
      errorMessage = `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: errorMessage, params }, null, 2),
        },
      ],
    };
  }
}