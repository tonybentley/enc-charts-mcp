import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { promises as fs } from 'fs';
import path from 'path';
import { ChartMetadata } from './chartQuery';

export interface CatalogChart {
  name: string;
  longName: string;
  scale: number;
  status: string;
  edition: string;
  updateNumber: string;
  updateDate: string;
  issueDate: string;
  zipfileLocation: string;
  zipfileSize: number;
  coverage: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    vertices: Array<{ lat: number; lon: number }>;
  };
}

export class XMLCatalogService {
  private readonly catalogUrl = 'https://www.charts.noaa.gov/ENCs/ENCProdCat.xml';
  private readonly cacheDir: string;
  private catalogCache: CatalogChart[] | null = null;
  private lastCatalogFetch: Date | null = null;
  private readonly catalogCacheDuration = 24 * 60 * 60 * 1000; // 24 hours
  
  constructor(cacheDir?: string) {
    const projectRoot = process.cwd();
    this.cacheDir = cacheDir || path.join(projectRoot, 'cache', 'catalog');
  }

  async getCatalog(forceRefresh = false): Promise<CatalogChart[]> {
    // Check memory cache first
    if (!forceRefresh && this.catalogCache && this.lastCatalogFetch) {
      const age = Date.now() - this.lastCatalogFetch.getTime();
      if (age < this.catalogCacheDuration) {
        return this.catalogCache;
      }
    }

    // Check file cache
    const cacheFile = path.join(this.cacheDir, 'enc-catalog.json');
    if (!forceRefresh) {
      try {
        await fs.mkdir(this.cacheDir, { recursive: true });
        const stat = await fs.stat(cacheFile);
        const age = Date.now() - stat.mtimeMs;
        
        if (age < this.catalogCacheDuration) {
          const cached = await fs.readFile(cacheFile, 'utf8');
          this.catalogCache = JSON.parse(cached) as CatalogChart[];
          this.lastCatalogFetch = stat.mtime;
          return this.catalogCache;
        }
      } catch {
        // Cache miss, continue to download
      }
    }

    // Download and parse catalog
    console.log('Downloading NOAA ENC catalog...');
    const response = await axios.get(this.catalogUrl, {
      timeout: 60000,
      maxContentLength: 50 * 1024 * 1024 // 50MB
    });

    const parsed = await parseStringPromise(response.data) as { EncProductCatalog?: { cell?: unknown[] } };
    const cells = parsed.EncProductCatalog?.cell || [];
    
    this.catalogCache = cells.map((cell: unknown) => this.parseCatalogCell(cell));
    this.lastCatalogFetch = new Date();

    // Save to file cache
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(this.catalogCache, null, 2));

    console.log(`Catalog loaded: ${this.catalogCache.length} charts`);
    return this.catalogCache;
  }

  async findChartsByCoordinates(lat: number, lon: number): Promise<CatalogChart[]> {
    const catalog = await this.getCatalog();
    
    return catalog.filter(chart => {
      // Quick bounding box check first
      const { minLat, maxLat, minLon, maxLon } = chart.coverage;
      if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) {
        return false;
      }
      
      // Detailed point-in-polygon check
      return this.isPointInPolygon({ lat, lon }, chart.coverage.vertices);
    });
  }

  async findChartsByBounds(bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  }): Promise<CatalogChart[]> {
    const catalog = await this.getCatalog();
    
    return catalog.filter(chart => {
      // Check if chart bounds intersect with search bounds
      return !(
        chart.coverage.maxLat < bounds.minLat ||
        chart.coverage.minLat > bounds.maxLat ||
        chart.coverage.maxLon < bounds.minLon ||
        chart.coverage.minLon > bounds.maxLon
      );
    });
  }

  async findChartById(chartId: string): Promise<CatalogChart | null> {
    const catalog = await this.getCatalog();
    return catalog.find(chart => chart.name === chartId) || null;
  }

  selectBestChart(charts: CatalogChart[], _lat: number, _lon: number): CatalogChart | null {
    if (charts.length === 0) return null;
    
    // Filter to only active charts
    const activeCharts = charts.filter(chart => chart.status === 'Active');
    if (activeCharts.length === 0) return null;
    
    // Sort by scale (smaller number = larger scale = more detailed)
    const sorted = activeCharts.sort((a, b) => a.scale - b.scale);
    
    // Prefer harbor/approach charts for navigation
    const harborChart = sorted.find(chart => chart.scale <= 50000);
    if (harborChart) return harborChart;
    
    // Otherwise return the most detailed chart
    return sorted[0];
  }

  convertToChartMetadata(chart: CatalogChart): ChartMetadata {
    return {
      id: chart.name,
      name: chart.longName,
      scale: chart.scale,
      edition: chart.edition,
      lastUpdate: chart.updateDate,
      bounds: {
        minLat: chart.coverage.minLat,
        maxLat: chart.coverage.maxLat,
        minLon: chart.coverage.minLon,
        maxLon: chart.coverage.maxLon
      },
      downloadUrl: chart.zipfileLocation,
      fileSize: chart.zipfileSize,
      status: chart.status
    };
  }

  private parseCatalogCell(cell: unknown): CatalogChart {
    const cellObj = cell as Record<string, unknown[]>;
    const cov = cellObj.cov?.[0] as Record<string, unknown[]> | undefined;
    const panel = cov?.panel?.[0] as Record<string, unknown[]> | undefined;
    const vertices = this.parseVertices(panel?.vertex || []);
    const bounds = this.calculateBounds(vertices);
    
    return {
      name: String(cellObj.name?.[0] || ''),
      longName: String(cellObj.lname?.[0] || ''),
      scale: parseInt(String(cellObj.cscale?.[0] || '0'), 10),
      status: String(cellObj.status?.[0] || 'Unknown'),
      edition: String(cellObj.edtn?.[0] || ''),
      updateNumber: String(cellObj.updn?.[0] || ''),
      updateDate: String(cellObj.uadt?.[0] || ''),
      issueDate: String(cellObj.isdt?.[0] || ''),
      zipfileLocation: String(cellObj.zipfile_location?.[0] || ''),
      zipfileSize: parseInt(String(cellObj.zipfile_size?.[0] || '0'), 10),
      coverage: {
        ...bounds,
        vertices
      }
    };
  }

  private parseVertices(vertexArray: unknown[]): Array<{ lat: number; lon: number }> {
    return vertexArray.map(v => {
      const vertex = v as Record<string, unknown[]>;
      return {
        lat: parseFloat(String(vertex.lat?.[0] || '0')),
        lon: parseFloat(String(vertex.long?.[0] || vertex.lon?.[0] || '0'))
      };
    });
  }

  private calculateBounds(vertices: Array<{ lat: number; lon: number }>): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
    if (vertices.length === 0) {
      return { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
    }

    const lats = vertices.map(v => v.lat);
    const lons = vertices.map(v => v.lon);
    
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLon: Math.min(...lons),
      maxLon: Math.max(...lons)
    };
  }

  private isPointInPolygon(point: { lat: number; lon: number }, vertices: Array<{ lat: number; lon: number }>): boolean {
    if (vertices.length < 3) return false;
    
    let inside = false;
    const x = point.lon;
    const y = point.lat;
    
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].lon;
      const yi = vertices[i].lat;
      const xj = vertices[j].lon;
      const yj = vertices[j].lat;
      
      const intersect = ((yi > y) !== (yj > y)) &&
                       (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }

  async clearCache(): Promise<void> {
    this.catalogCache = null;
    this.lastCatalogFetch = null;
    
    try {
      const cacheFile = path.join(this.cacheDir, 'enc-catalog.json');
      await fs.unlink(cacheFile);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}

export const xmlCatalogService = new XMLCatalogService();