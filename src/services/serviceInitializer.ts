import { ChartDownloadService } from './chartDownload.js';
import { ChartQueryService } from './chartQuery.js';
import { CacheManager } from '../utils/cache.js';
import path from 'path';

let initialized = false;
let cacheManagerInstance: CacheManager;
let chartDownloadServiceInstance: ChartDownloadService;
let chartQueryServiceInstance: ChartQueryService;

export async function initializeServices(): Promise<{
  cacheManager: CacheManager;
  chartDownloadService: ChartDownloadService;
  chartQueryService: ChartQueryService;
}> {
  if (initialized) {
    return {
      cacheManager: cacheManagerInstance,
      chartDownloadService: chartDownloadServiceInstance,
      chartQueryService: chartQueryServiceInstance,
    };
  }

  // Create cache configuration from environment variables
  const cacheConfig: Partial<{ cacheDir: string; maxSizeGB: number; maxAgeInDays: number }> = {};
  
  if (process.env.ENC_CACHE_DIR) {
    cacheConfig.cacheDir = process.env.ENC_CACHE_DIR;
  } else {
    // Use relative path from current working directory
    cacheConfig.cacheDir = path.join(process.cwd(), 'cache', 'charts');
  }
  
  if (process.env.ENC_CACHE_MAX_SIZE_GB) {
    cacheConfig.maxSizeGB = parseFloat(process.env.ENC_CACHE_MAX_SIZE_GB);
  }
  
  if (process.env.ENC_CACHE_MAX_AGE_DAYS) {
    cacheConfig.maxAgeInDays = parseInt(process.env.ENC_CACHE_MAX_AGE_DAYS, 10);
  }

  // Initialize services with proper dependencies
  cacheManagerInstance = new CacheManager(cacheConfig);
  await cacheManagerInstance.initialize();
  
  chartQueryServiceInstance = new ChartQueryService();
  chartDownloadServiceInstance = new ChartDownloadService(
    cacheConfig.cacheDir,
    cacheManagerInstance,
    chartQueryServiceInstance
  );

  initialized = true;

  return {
    cacheManager: cacheManagerInstance,
    chartDownloadService: chartDownloadServiceInstance,
    chartQueryService: chartQueryServiceInstance,
  };
}

// Export getters for the initialized services
export async function getCacheManager(): Promise<CacheManager> {
  const services = await initializeServices();
  return services.cacheManager;
}

export async function getChartDownloadService(): Promise<ChartDownloadService> {
  const services = await initializeServices();
  return services.chartDownloadService;
}

export async function getChartQueryService(): Promise<ChartQueryService> {
  const services = await initializeServices();
  return services.chartQueryService;
}