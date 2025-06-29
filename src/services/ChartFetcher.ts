import { ChartDownloadService, ChartFiles, DownloadProgress } from './chartDownload.js';
import { ChartRepository } from '../database/repositories/ChartRepository.js';
import { NavigationFeatureRepository } from '../database/repositories/NavigationFeatureRepository.js';
import { ChartQueryService } from './chartQuery.js';
import { ChartRecord } from '../database/schemas.js';
import { S57DatabaseParser } from './S57DatabaseParser.js';
import path from 'path';
import { promises as fs } from 'fs';

/**
 * ChartFetcher adapts ChartDownloadService to use database repositories
 * Provides database-first approach with fallback to file-based downloads
 */
export class ChartFetcher {
  private downloadService: ChartDownloadService;
  private s57Parser?: S57DatabaseParser;
  
  constructor(
    private chartRepository?: ChartRepository,
    private featureRepository?: NavigationFeatureRepository,
    private chartQueryService?: ChartQueryService,
    cacheDir?: string
  ) {
    this.downloadService = new ChartDownloadService(cacheDir);
    
    // Create S57 parser if database repositories are available
    if (this.featureRepository) {
      this.s57Parser = new S57DatabaseParser(this.featureRepository);
    }
  }

  /**
   * Get chart with database-first approach
   * 1. Check database for chart metadata
   * 2. If not in database, download and store
   * 3. Return chart information
   */
  async fetchChart(
    chartId: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<ChartFiles & { fromDatabase: boolean }> {
    // Check database first
    if (this.chartRepository) {
      const dbChart = await this.chartRepository.getById(chartId);
      if (dbChart && dbChart.file_path) {
        // Chart exists in database, check if files exist
        const filesExist = await this.verifyChartFiles(dbChart.file_path);
        if (filesExist) {
          // Update last accessed time
          await this.chartRepository.updateLastAccessed(chartId);
          
          // Return chart files from database record
          const chartFiles = await this.scanChartDirectory(chartId, dbChart.file_path);
          return { ...chartFiles, fromDatabase: true };
        }
      }
    }

    // Not in database or files missing, download chart
    const chartFiles = await this.downloadService.downloadChart(chartId, onProgress);
    
    // Store in database if available
    if (this.chartRepository && this.chartQueryService) {
      await this.storeChartInDatabase(chartId, chartFiles);
      
      // Automatically parse S-57 features to database
      if (this.s57Parser && this.featureRepository && chartFiles.s57Files.length > 0) {
        try {
          const s57FilePath = path.join(chartFiles.basePath, chartFiles.s57Files[0]);
          const parseResult = await this.s57Parser.parseChartToDatabase(
            s57FilePath,
            chartId,
            { clearExisting: true }
          );
          
          if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
            console.error(`[ChartFetcher] Automatically parsed ${parseResult.featuresStored} features for chart ${chartId}`);
          }
        } catch (error) {
          // Log but don't fail the chart fetch
          if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
            console.error(`[ChartFetcher] Failed to parse features for ${chartId}:`, error);
          }
        }
      }
    }
    
    return { ...chartFiles, fromDatabase: false };
  }

  /**
   * Fetch multiple charts with database optimization
   */
  async fetchMultipleCharts(
    chartIds: string[],
    onProgress?: (chartId: string, progress: DownloadProgress) => void
  ): Promise<Map<string, ChartFiles & { fromDatabase: boolean }>> {
    const results = new Map<string, ChartFiles & { fromDatabase: boolean }>();
    
    // Separate charts that need downloading from those in database
    const toDownload: string[] = [];
    
    for (const chartId of chartIds) {
      if (this.chartRepository) {
        const dbChart = await this.chartRepository.getById(chartId);
        if (dbChart && dbChart.file_path) {
          const filesExist = await this.verifyChartFiles(dbChart.file_path);
          if (filesExist) {
            const chartFiles = await this.scanChartDirectory(chartId, dbChart.file_path);
            results.set(chartId, { ...chartFiles, fromDatabase: true });
            continue;
          }
        }
      }
      toDownload.push(chartId);
    }
    
    // Download missing charts
    if (toDownload.length > 0) {
      const downloaded = await this.downloadService.downloadMultipleCharts(toDownload, onProgress);
      
      for (const [chartId, chartFiles] of downloaded) {
        results.set(chartId, { ...chartFiles, fromDatabase: false });
        
        // Store in database and parse features if available
        if (this.chartRepository && this.chartQueryService) {
          await this.storeChartInDatabase(chartId, chartFiles);
          
          // Automatically parse S-57 features to database
          if (this.s57Parser && this.featureRepository && chartFiles.s57Files.length > 0) {
            try {
              const s57FilePath = path.join(chartFiles.basePath, chartFiles.s57Files[0]);
              await this.s57Parser.parseChartToDatabase(
                s57FilePath,
                chartId,
                { clearExisting: true }
              );
            } catch (error) {
              // Log but don't fail
              if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
                console.error(`[ChartFetcher] Failed to parse features for ${chartId}:`, error);
              }
            }
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Check if chart exists in database
   */
  async isChartInDatabase(chartId: string): Promise<boolean> {
    if (!this.chartRepository) {
      return false;
    }
    
    const chart = await this.chartRepository.getById(chartId);
    if (!chart || !chart.file_path) {
      return false;
    }
    
    return this.verifyChartFiles(chart.file_path);
  }

  /**
   * Get chart metadata from database or NOAA catalog
   */
  async getChartMetadata(chartId: string): Promise<ChartRecord | null> {
    // Check database first
    if (this.chartRepository) {
      const dbChart = await this.chartRepository.getById(chartId);
      if (dbChart) {
        return dbChart;
      }
    }
    
    // Query NOAA catalog
    if (this.chartQueryService) {
      const catalogMetadata = await this.chartQueryService.queryByChartId(chartId);
      if (catalogMetadata) {
        // Convert to ChartRecord format
        return {
          chart_id: catalogMetadata.id,
          chart_name: catalogMetadata.name,
          scale: catalogMetadata.scale,
          edition: typeof catalogMetadata.edition === 'number' ? catalogMetadata.edition : parseInt(catalogMetadata.edition, 10) || null,
          update_date: catalogMetadata.updateDate ? catalogMetadata.updateDate.toISOString() : catalogMetadata.lastUpdate,
          bbox_minlon: catalogMetadata.bounds?.minLon,
          bbox_minlat: catalogMetadata.bounds?.minLat,
          bbox_maxlon: catalogMetadata.bounds?.maxLon,
          bbox_maxlat: catalogMetadata.bounds?.maxLat,
          download_url: catalogMetadata.downloadUrl
        };
      }
    }
    
    return null;
  }

  /**
   * Store chart information in database
   */
  private async storeChartInDatabase(chartId: string, chartFiles: ChartFiles): Promise<void> {
    if (!this.chartRepository || !this.chartQueryService) {
      return;
    }
    
    try {
      // Get metadata from NOAA catalog
      const metadata = await this.chartQueryService.queryByChartId(chartId);
      if (!metadata) {
        return;
      }
      
      // Calculate total file size
      let totalSize = 0;
      for (const file of chartFiles.allFiles) {
        try {
          const stat = await fs.stat(file);
          totalSize += stat.size;
        } catch {
          // Ignore stat errors
        }
      }
      
      // Store chart record
      const chartRecord: ChartRecord = {
        chart_id: chartId,
        chart_name: metadata.name,
        scale: metadata.scale,
        edition: typeof metadata.edition === 'number' ? metadata.edition : parseInt(metadata.edition, 10) || null,
        update_date: metadata.updateDate ? metadata.updateDate.toISOString() : metadata.lastUpdate,
        bbox_minlon: metadata.bounds?.minLon,
        bbox_minlat: metadata.bounds?.minLat,
        bbox_maxlon: metadata.bounds?.maxLon,
        bbox_maxlat: metadata.bounds?.maxLat,
        file_path: chartFiles.basePath,
        file_size: totalSize,
        download_url: metadata.downloadUrl
      };
      
      await this.chartRepository.insert(chartRecord);
    } catch (error) {
      // Log error but don't throw - database storage is optional
      if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'production') {
        console.error(`Failed to store chart ${chartId} in database:`, error);
      }
    }
  }

  /**
   * Verify that chart files exist on disk
   */
  private async verifyChartFiles(chartPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(chartPath);
      if (!stat.isDirectory()) {
        return false;
      }
      
      // Check for at least one S-57 file
      const files = await fs.readdir(chartPath);
      return files.some(file => file.endsWith('.000'));
    } catch {
      return false;
    }
  }

  /**
   * Scan chart directory for files (copied from ChartDownloadService)
   */
  private async scanChartDirectory(chartId: string, basePath: string): Promise<ChartFiles> {
    const files = await fs.readdir(basePath, { recursive: true });
    const allFiles: string[] = [];
    const s57Files: string[] = [];
    const textFiles: string[] = [];
    let catalogFile: string | undefined;

    for (const file of files) {
      if (typeof file === 'string') {
        const fullPath = path.join(basePath, file);
        const stat = await fs.stat(fullPath);
        
        if (stat.isFile()) {
          allFiles.push(fullPath);
          
          const ext = path.extname(file).toLowerCase();
          if (ext === '.000') {
            s57Files.push(fullPath);
          } else if (ext === '.txt') {
            textFiles.push(fullPath);
          } else if (file.toUpperCase() === 'CATALOG.031') {
            catalogFile = fullPath;
          }
        }
      }
    }

    return {
      chartId,
      basePath,
      s57Files,
      catalogFile,
      textFiles,
      allFiles
    };
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<{
    totalCharts: number;
    totalFeatures: number;
    totalCacheSize: number;
  }> {
    if (!this.chartRepository || !this.featureRepository) {
      return {
        totalCharts: 0,
        totalFeatures: 0,
        totalCacheSize: 0
      };
    }
    
    const totalCharts = await this.chartRepository.count();
    const totalFeatures = await this.featureRepository.getFeatureCountByChart()
      .then(stats => stats.reduce((sum, s) => sum + s.feature_count, 0));
    const totalCacheSize = await this.chartRepository.getTotalCacheSize();
    
    return {
      totalCharts,
      totalFeatures,
      totalCacheSize
    };
  }
}