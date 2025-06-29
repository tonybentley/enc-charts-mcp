import { ChartDownloadService } from './chartDownload.js';
import { ChartQueryService } from './chartQuery.js';
import { XMLCatalogService } from './xmlCatalog.js';
import { CacheManager } from '../utils/cache.js';
import { ChartFetcher } from './ChartFetcher.js';
import { S57DatabaseParser } from './S57DatabaseParser.js';
import { ChartRepository } from '../database/repositories/ChartRepository.js';
import { NavigationFeatureRepository } from '../database/repositories/NavigationFeatureRepository.js';
import path from 'path';

let initialized = false;
let cacheManagerInstance: CacheManager;
let chartDownloadServiceInstance: ChartDownloadService;
let chartQueryServiceInstance: ChartQueryService;
let xmlCatalogServiceInstance: XMLCatalogService;
let chartFetcherInstance: ChartFetcher | undefined;
let s57DatabaseParserInstance: S57DatabaseParser | undefined;

// Database repositories (set externally)
let chartRepository: ChartRepository | undefined;
let featureRepository: NavigationFeatureRepository | undefined;

export function setDatabaseRepositories(
  chartRepo?: ChartRepository,
  featureRepo?: NavigationFeatureRepository
): void {
  chartRepository = chartRepo;
  featureRepository = featureRepo;
  
  // Reset initialization to recreate services with database support
  if (initialized && (chartRepo || featureRepo)) {
    initialized = false;
  }
}

export async function initializeServices(): Promise<{
  cacheManager: CacheManager;
  chartDownloadService: ChartDownloadService;
  chartQueryService: ChartQueryService;
  chartFetcher?: ChartFetcher;
  s57DatabaseParser?: S57DatabaseParser;
}> {
  if (initialized) {
    return {
      cacheManager: cacheManagerInstance,
      chartDownloadService: chartDownloadServiceInstance,
      chartQueryService: chartQueryServiceInstance,
      chartFetcher: chartFetcherInstance,
      s57DatabaseParser: s57DatabaseParserInstance,
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
  
  // Create XML catalog service with proper cache directory
  const catalogCacheDir = path.join(path.dirname(cacheConfig.cacheDir), 'catalog');
  xmlCatalogServiceInstance = new XMLCatalogService(catalogCacheDir);
  
  chartQueryServiceInstance = new ChartQueryService(xmlCatalogServiceInstance);
  chartDownloadServiceInstance = new ChartDownloadService(
    cacheConfig.cacheDir,
    cacheManagerInstance,
    chartQueryServiceInstance
  );

  // Create database-aware services if repositories are available
  if (chartRepository || featureRepository) {
    chartFetcherInstance = new ChartFetcher(
      chartRepository,
      featureRepository,
      chartQueryServiceInstance,
      cacheConfig.cacheDir
    );
    
    if (featureRepository) {
      s57DatabaseParserInstance = new S57DatabaseParser(featureRepository);
    }
  }

  initialized = true;

  return {
    cacheManager: cacheManagerInstance,
    chartDownloadService: chartDownloadServiceInstance,
    chartQueryService: chartQueryServiceInstance,
    chartFetcher: chartFetcherInstance,
    s57DatabaseParser: s57DatabaseParserInstance,
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

export async function getChartFetcher(): Promise<ChartFetcher | undefined> {
  const services = await initializeServices();
  return services.chartFetcher;
}

export async function getS57DatabaseParser(): Promise<S57DatabaseParser | undefined> {
  const services = await initializeServices();
  return services.s57DatabaseParser;
}