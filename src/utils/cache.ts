import { promises as fs } from 'fs';
import path from 'path';
import { ChartMetadata } from '../types/enc.js';

export interface CacheConfig {
  maxSizeGB: number;
  maxAgeInDays: number;
  cacheDir: string;
}

export interface CacheEntry {
  chartId: string;
  metadata: ChartMetadata;
  downloadDate: string;
  lastAccessed: string;
  sizeInBytes: number;
  version: string;
}

export interface CacheStats {
  totalSizeGB: number;
  chartCount: number;
  oldestChart: string | null;
  newestChart: string | null;
}

export class CacheManager {
  private config: CacheConfig;
  private indexPath: string;
  private index: Map<string, CacheEntry> = new Map();

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxSizeGB: config?.maxSizeGB || 10,
      maxAgeInDays: config?.maxAgeInDays || 7,
      cacheDir: config?.cacheDir || path.join(process.cwd(), 'cache', 'charts')
    };
    
    this.indexPath = path.join(this.config.cacheDir, 'cache-index.json');
  }

  async initialize(): Promise<void> {
    // Ensure cache directory exists
    await fs.mkdir(this.config.cacheDir, { recursive: true });
    
    // Load existing index
    await this.loadIndex();
    
    // Validate cache entries
    await this.validateCache();
  }

  async addChart(chartId: string, metadata: ChartMetadata): Promise<void> {
    const chartPath = path.join(this.config.cacheDir, chartId);
    
    // Calculate size
    const sizeInBytes = await this.getDirectorySize(chartPath);
    
    // Create cache entry
    const entry: CacheEntry = {
      chartId,
      metadata,
      downloadDate: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      sizeInBytes,
      version: metadata.edition.toString()
    };
    
    // Add to index
    this.index.set(chartId, entry);
    
    // Save index
    await this.saveIndex();
    
    // Check if cleanup is needed
    await this.enforceCacheLimits();
  }

  async getChart(chartId: string): Promise<CacheEntry | null> {
    const entry = this.index.get(chartId);
    if (!entry) return null;
    
    // Update last accessed time
    entry.lastAccessed = new Date().toISOString();
    await this.saveIndex();
    
    return entry;
  }

  async getChartMetadata(chartId: string): Promise<ChartMetadata | null> {
    const entry = this.index.get(chartId);
    return entry ? entry.metadata : null;
  }

  async isChartCached(chartId: string): Promise<boolean> {
    if (!this.index.has(chartId)) return false;
    
    // Verify the files still exist
    const chartPath = path.join(this.config.cacheDir, chartId);
    try {
      const stat = await fs.stat(chartPath);
      return stat.isDirectory();
    } catch {
      // Remove from index if directory doesn't exist
      this.index.delete(chartId);
      await this.saveIndex();
      return false;
    }
  }

  async needsUpdate(chartId: string, latestVersion: number): Promise<boolean> {
    const entry = this.index.get(chartId);
    if (!entry) return true;
    
    // Check version
    if (parseInt(entry.version) < latestVersion) return true;
    
    // Check age
    const age = Date.now() - new Date(entry.downloadDate).getTime();
    const maxAge = this.config.maxAgeInDays * 24 * 60 * 60 * 1000;
    
    return age > maxAge;
  }

  async removeChart(chartId: string): Promise<void> {
    // Remove from filesystem
    const chartPath = path.join(this.config.cacheDir, chartId);
    try {
      await fs.rm(chartPath, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to remove chart ${chartId}:`, error);
    }
    
    // Remove from index
    this.index.delete(chartId);
    await this.saveIndex();
  }

  async getStats(): Promise<CacheStats> {
    let totalSizeBytes = 0;
    let oldestDate: Date | null = null;
    let newestDate: Date | null = null;
    let oldestChart: string | null = null;
    let newestChart: string | null = null;
    
    for (const [chartId, entry] of this.index) {
      totalSizeBytes += entry.sizeInBytes;
      
      const downloadDate = new Date(entry.downloadDate);
      if (!oldestDate || downloadDate < oldestDate) {
        oldestDate = downloadDate;
        oldestChart = chartId;
      }
      if (!newestDate || downloadDate > newestDate) {
        newestDate = downloadDate;
        newestChart = chartId;
      }
    }
    
    return {
      totalSizeGB: totalSizeBytes / (1024 * 1024 * 1024),
      chartCount: this.index.size,
      oldestChart,
      newestChart
    };
  }

  async searchCachedCharts(
    bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number }
  ): Promise<ChartMetadata[]> {
    const results: ChartMetadata[] = [];
    
    for (const entry of this.index.values()) {
      const metadata = entry.metadata;
      
      // If no bounds specified, return all
      if (!bounds) {
        results.push(metadata);
        continue;
      }
      
      // Check if chart overlaps with search bounds
      if (metadata.bounds &&
          metadata.bounds.maxLat >= bounds.minLat &&
          metadata.bounds.minLat <= bounds.maxLat &&
          metadata.bounds.maxLon >= bounds.minLon &&
          metadata.bounds.minLon <= bounds.maxLon) {
        results.push(metadata);
      }
    }
    
    return results;
  }

  private async enforceCacheLimits(): Promise<void> {
    const stats = await this.getStats();
    
    // Check size limit
    if (stats.totalSizeGB > this.config.maxSizeGB) {
      await this.evictLRU(stats.totalSizeGB - this.config.maxSizeGB);
    }
    
    // Check age limit
    await this.evictOldCharts();
  }

  private async evictLRU(sizeToFreeGB: number): Promise<void> {
    // Sort by last accessed time
    const entries = Array.from(this.index.entries())
      .sort((a, b) => new Date(a[1].lastAccessed).getTime() - new Date(b[1].lastAccessed).getTime());
    
    let freedBytes = 0;
    const bytesToFree = sizeToFreeGB * 1024 * 1024 * 1024;
    
    for (const [chartId, entry] of entries) {
      if (freedBytes >= bytesToFree) break;
      
      await this.removeChart(chartId);
      freedBytes += entry.sizeInBytes;
    }
  }

  private async evictOldCharts(): Promise<void> {
    const now = Date.now();
    const maxAge = this.config.maxAgeInDays * 24 * 60 * 60 * 1000;
    
    for (const [chartId, entry] of this.index) {
      const age = now - new Date(entry.downloadDate).getTime();
      if (age > maxAge) {
        await this.removeChart(chartId);
      }
    }
  }

  private async loadIndex(): Promise<void> {
    try {
      const data = await fs.readFile(this.indexPath, 'utf-8');
      const entries = JSON.parse(data) as CacheEntry[];
      this.index = new Map(entries.map(e => [e.chartId, e]));
    } catch {
      // Index doesn't exist or is corrupted, start fresh
      this.index = new Map();
    }
  }

  private async saveIndex(): Promise<void> {
    const entries = Array.from(this.index.values());
    await fs.writeFile(this.indexPath, JSON.stringify(entries, null, 2));
  }

  private async validateCache(): Promise<void> {
    const invalidEntries: string[] = [];
    
    for (const [chartId] of this.index) {
      const chartPath = path.join(this.config.cacheDir, chartId);
      try {
        await fs.stat(chartPath);
      } catch {
        invalidEntries.push(chartId);
      }
    }
    
    // Remove invalid entries
    for (const chartId of invalidEntries) {
      this.index.delete(chartId);
    }
    
    if (invalidEntries.length > 0) {
      await this.saveIndex();
    }
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;
    
    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        
        if (file.isDirectory()) {
          size += await this.getDirectorySize(fullPath);
        } else {
          const stat = await fs.stat(fullPath);
          size += stat.size;
        }
      }
    } catch (error) {
      console.error(`Error calculating size for ${dirPath}:`, error);
    }
    
    return size;
  }

  async clearCache(): Promise<void> {
    // Remove all charts
    for (const chartId of this.index.keys()) {
      await this.removeChart(chartId);
    }
    
    // Clear index
    this.index.clear();
    await this.saveIndex();
  }
}

// Export only the class, not a singleton instance
// Instances should be created through serviceInitializer.ts