import axios, { AxiosProgressEvent, AxiosResponse } from 'axios';
import AdmZip from 'adm-zip';
import { promises as fs } from 'fs';
import path from 'path';
import { CacheManager } from '../utils/cache.js';
import { ChartQueryService } from './chartQuery.js';
// Use process.cwd() instead of __dirname for ES modules
const projectRoot = process.cwd();

export interface DownloadProgress {
  chartId: string;
  totalBytes: number;
  downloadedBytes: number;
  percentage: number;
}

export interface ChartFiles {
  chartId: string;
  basePath: string;
  s57Files: string[];
  catalogFile?: string;
  textFiles: string[];
  allFiles: string[];
}

export class ChartDownloadService {
  private readonly baseUrl = 'https://www.charts.noaa.gov/ENCs';
  private readonly cacheDir: string;
  private downloadInProgress = new Map<string, Promise<ChartFiles>>();
  private cacheManager: CacheManager | null = null;
  private chartQueryService: ChartQueryService | null = null;
  
  constructor(cacheDir?: string, cacheManager?: CacheManager, chartQueryService?: ChartQueryService) {
    this.cacheDir = cacheDir || path.join(projectRoot, 'cache', 'charts');
    this.cacheManager = cacheManager || null;
    this.chartQueryService = chartQueryService || null;
  }

  async downloadChart(
    chartId: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<ChartFiles> {
    // Check if download is already in progress
    const existingDownload = this.downloadInProgress.get(chartId);
    if (existingDownload) {
      return existingDownload;
    }

    // Start new download
    const downloadPromise = this.performDownload(chartId, onProgress);
    this.downloadInProgress.set(chartId, downloadPromise);

    try {
      const result = await downloadPromise;
      return result;
    } finally {
      this.downloadInProgress.delete(chartId);
    }
  }

  async isChartCached(chartId: string): Promise<boolean> {
    const chartPath = path.join(this.cacheDir, chartId);
    try {
      const stat = await fs.stat(chartPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async getCachedChart(chartId: string): Promise<ChartFiles | null> {
    if (!await this.isChartCached(chartId)) {
      return null;
    }

    const basePath = path.join(this.cacheDir, chartId);
    return this.scanChartDirectory(chartId, basePath);
  }

  async downloadMultipleCharts(
    chartIds: string[],
    onProgress?: (chartId: string, progress: DownloadProgress) => void
  ): Promise<Map<string, ChartFiles>> {
    const results = new Map<string, ChartFiles>();
    const errors: Array<{ chartId: string; error: Error }> = [];

    // Download in parallel with concurrency limit
    const concurrency = 3;
    const chunks: string[][] = [];
    
    for (let i = 0; i < chartIds.length; i += concurrency) {
      chunks.push(chartIds.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (chartId) => {
        try {
          const files = await this.downloadChart(chartId, (progress) => {
            if (onProgress) onProgress(chartId, progress);
          });
          results.set(chartId, files);
        } catch (error) {
          errors.push({ chartId, error: error as Error });
        }
      });

      await Promise.all(promises);
    }

    if (errors.length > 0) {
      // Failed to download some charts - continue silently
    }

    return results;
  }

  private async performDownload(
    chartId: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<ChartFiles> {
    // Check cache first
    const cached = await this.getCachedChart(chartId);
    if (cached) {
      return cached;
    }

    // Ensure cache directory exists
    const chartPath = path.join(this.cacheDir, chartId);
    await fs.mkdir(chartPath, { recursive: true });

    // Download ZIP file
    const zipUrl = `${this.baseUrl}/${chartId}.zip`;
    const zipPath = path.join(chartPath, `${chartId}.zip`);

    try {
      // Download with progress tracking
      const response: AxiosResponse<ArrayBuffer> = await axios.request<ArrayBuffer>({
        method: 'GET',
        url: zipUrl,
        responseType: 'arraybuffer',
        timeout: 300000, // 5 minutes
        onDownloadProgress: (progressEvent: AxiosProgressEvent) => {
          if (onProgress && progressEvent.total) {
            onProgress({
              chartId,
              totalBytes: progressEvent.total,
              downloadedBytes: progressEvent.loaded,
              percentage: Math.round((progressEvent.loaded / progressEvent.total) * 100)
            });
          }
        },
        headers: {
          'User-Agent': 'enc-charts-mcp/1.0'
        }
      });

      // Save ZIP file
      await fs.writeFile(zipPath, Buffer.from(response.data));

      // Extract ZIP
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(chartPath, true);

      // Clean up ZIP file
      await fs.unlink(zipPath);

      // Scan extracted files
      const chartFiles = await this.scanChartDirectory(chartId, chartPath);
      
      // Register with cache manager if available
      if (this.cacheManager && this.chartQueryService) {
        try {
          // Get metadata for the chart
          const metadata = await this.chartQueryService.queryByChartId(chartId);
          if (metadata) {
            await this.cacheManager.addChart(chartId, metadata);
          }
        } catch (error) {
          // Failed to register chart with cache manager - continue silently
        }
      }
      
      return chartFiles;
    } catch (error) {
      // Clean up on error
      try {
        await fs.rmdir(chartPath, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new Error(`Chart ${chartId} not found on NOAA server`);
        }
        throw new Error(`Failed to download chart ${chartId}: ${error.message}`);
      }
      throw error;
    }
  }

  private async scanChartDirectory(chartId: string, basePath: string): Promise<ChartFiles> {
    const result: ChartFiles = {
      chartId,
      basePath,
      s57Files: [],
      catalogFile: undefined,
      textFiles: [],
      allFiles: []
    };

    // Recursive function to scan directories
    const scanDir = async (dirPath: string): Promise<void> => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await scanDir(fullPath);
        } else if (entry.isFile()) {
          const relativePath = path.relative(basePath, fullPath);
          result.allFiles.push(relativePath);

          const ext = path.extname(entry.name).toLowerCase();
          
          // S-57 files typically have .000 extension
          if (ext === '.000') {
            // Log S-57 file found for debugging
            if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
              console.error(`[ChartDownload] Found S-57 file: ${relativePath} in chart ${chartId}`);
            }
            result.s57Files.push(relativePath);
          }
          // Catalog files
          else if (entry.name.toUpperCase() === 'CATALOG.031') {
            result.catalogFile = relativePath;
          }
          // Text files with metadata
          else if (ext === '.txt') {
            result.textFiles.push(relativePath);
          }
        }
      }
    };

    // Log scanning start
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
      console.error(`[ChartDownload] Scanning directory for chart ${chartId}: ${basePath}`);
    }
    
    // Start scanning from the base path
    await scanDir(basePath);

    // Log results
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
      console.error(`[ChartDownload] Scan complete for ${chartId}. Found ${result.s57Files.length} S-57 files, ${result.allFiles.length} total files`);
      if (result.s57Files.length > 0) {
        console.error(`[ChartDownload] S-57 files: ${result.s57Files.join(', ')}`);
      }
    }

    if (result.s57Files.length === 0) {
      if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
        console.error(`[ChartDownload] ERROR: No S-57 files found in ${basePath}. All files: ${result.allFiles.join(', ')}`);
      }
      throw new Error(`No S-57 files found in chart ${chartId}`);
    }

    return result;
  }

  async cleanupOldCharts(maxAgeInDays: number = 7): Promise<number> {
    let cleaned = 0;
    
    try {
      const charts = await fs.readdir(this.cacheDir);
      const now = Date.now();
      const maxAge = maxAgeInDays * 24 * 60 * 60 * 1000;

      for (const chartId of charts) {
        const chartPath = path.join(this.cacheDir, chartId);
        const stat = await fs.stat(chartPath);
        
        if (stat.isDirectory() && (now - stat.mtimeMs) > maxAge) {
          await fs.rm(chartPath, { recursive: true, force: true });
          cleaned++;
        }
      }
    } catch (error) {
      // Error cleaning up old charts - continue silently
    }

    return cleaned;
  }

  async getCacheSize(): Promise<{ totalSize: number; chartCount: number }> {
    let totalSize = 0;
    let chartCount = 0;

    try {
      const charts = await fs.readdir(this.cacheDir);
      
      for (const chartId of charts) {
        const chartPath = path.join(this.cacheDir, chartId);
        const size = await this.getDirectorySize(chartPath);
        totalSize += size;
        chartCount++;
      }
    } catch (error) {
      // Error calculating cache size - continue silently
    }

    return { totalSize, chartCount };
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;
    
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
    
    return size;
  }
}

// Export only the class, not a singleton instance
// Instances should be created through serviceInitializer.ts