import { XMLCatalogService, xmlCatalogService } from './xmlCatalog.js';
import type { ChartMetadata } from '../types/enc.js';

export { ChartMetadata };

export interface ChartQueryOptions {
  geometry: { lat: number; lon: number } | { minLat: number; maxLat: number; minLon: number; maxLon: number };
  geometryType: 'point' | 'envelope';
  returnGeometry?: boolean;
}

export class ChartQueryService {
  private catalogService: XMLCatalogService;

  constructor(catalogService?: XMLCatalogService) {
    this.catalogService = catalogService || xmlCatalogService;
  }

  async queryByCoordinates(lat: number, lon: number): Promise<ChartMetadata[]> {
    try {
      const catalogCharts = await this.catalogService.findChartsByCoordinates(lat, lon);
      return catalogCharts.map(chart => this.catalogService.convertToChartMetadata(chart));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to query charts by coordinates: ${error.message}`);
      }
      throw error;
    }
  }

  async queryByBoundingBox(
    minLat: number,
    maxLat: number,
    minLon: number,
    maxLon: number
  ): Promise<ChartMetadata[]> {
    try {
      const bounds = { minLat, maxLat, minLon, maxLon };
      const catalogCharts = await this.catalogService.findChartsByBounds(bounds);
      return catalogCharts.map(chart => this.catalogService.convertToChartMetadata(chart));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to query charts by bounding box: ${error.message}`);
      }
      throw error;
    }
  }

  async queryByChartId(chartId: string): Promise<ChartMetadata | null> {
    try {
      const chart = await this.catalogService.findChartById(chartId);
      return chart ? this.catalogService.convertToChartMetadata(chart) : null;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to query chart by ID: ${error.message}`);
      }
      throw error;
    }
  }

  selectBestChart(charts: ChartMetadata[], _lat: number, _lon: number): ChartMetadata | null {
    if (charts.length === 0) return null;

    
    // For now, use simple selection logic
    // Sort by scale (larger scale = more detail = smaller number)
    const sorted = charts.sort((a, b) => {
      // First, prefer larger scale (smaller number)
      const scaleDiff = a.scale - b.scale;
      if (scaleDiff !== 0) return scaleDiff;

      // Then, prefer more recent updates
      const dateA = new Date(a.lastUpdate).getTime();
      const dateB = new Date(b.lastUpdate).getTime();
      return dateB - dateA;
    });

    // Prefer harbor/approach charts for navigation
    const harborChart = sorted.find(chart => chart.scale <= 50000);
    if (harborChart) return harborChart;

    // Otherwise return the most detailed chart
    return sorted[0];
  }

  async queryMultipleScales(options: ChartQueryOptions): Promise<ChartMetadata[]> {
    // XML catalog contains all scales, so we just need one query
    if (options.geometryType === 'point') {
      const point = options.geometry as { lat: number; lon: number };
      return this.queryByCoordinates(point.lat, point.lon);
    } else {
      const bbox = options.geometry as { minLat: number; maxLat: number; minLon: number; maxLon: number };
      return this.queryByBoundingBox(bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon);
    }
  }

  async getCatalogStatus(): Promise<{
    chartCount: number;
    lastUpdated: Date | null;
    cacheDir: string;
  }> {
    const catalog = await this.catalogService.getCatalog();
    return {
      chartCount: catalog.length,
      lastUpdated: new Date(), // Could be enhanced to track actual catalog date
      cacheDir: process.cwd() + '/cache/catalog'
    };
  }

  async refreshCatalog(): Promise<void> {
    await this.catalogService.clearCache();
    await this.catalogService.getCatalog(true);
  }
}

export const chartQueryService = new ChartQueryService();