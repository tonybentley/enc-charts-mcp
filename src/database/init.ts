import { DatabaseManager, type DatabaseConfig } from './DatabaseManager.js';
import { ChartRepository } from './repositories/ChartRepository.js';
import { NavigationFeatureRepository } from './repositories/NavigationFeatureRepository.js';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface DatabaseInitResult {
  dbManager?: DatabaseManager;
  chartRepository?: ChartRepository;
  featureRepository?: NavigationFeatureRepository;
  error?: Error;
}

export interface DatabaseOptions extends DatabaseConfig {
  dataDir?: string;
  initializeSchema?: boolean;
}

const DEFAULT_OPTIONS: DatabaseOptions = {
  initializeSchema: true,
  verbose: false
};

/**
 * Initialize the database and repositories
 */
export function initializeDatabase(options: DatabaseOptions = {}): DatabaseInitResult {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  try {
    // Determine database location
    let dbConfig: DatabaseConfig;
    
    if (config.memory) {
      // Use in-memory database
      dbConfig = {
        memory: true,
        verbose: config.verbose
      };
    } else {
      // Use file-based database
      const dataDir = config.dataDir || process.env.ENC_CACHE_DIR || './cache/database';
      const dbPath = path.join(dataDir, 'enc-charts.db');
      
      // Ensure data directory exists
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      
      dbConfig = {
        filename: dbPath,
        memory: false,
        verbose: config.verbose,
        fileMustExist: config.fileMustExist,
        readonly: config.readonly,
        timeout: config.timeout
      };
    }
    
    // Create database manager
    const dbManager = new DatabaseManager(dbConfig);
    
    // Initialize database
    if (config.initializeSchema) {
      dbManager.initialize();
    }
    
    // Create repositories
    const chartRepository = new ChartRepository(dbManager);
    const featureRepository = new NavigationFeatureRepository(dbManager);
    
    // Log success to stderr (not stdout to avoid interfering with JSON-RPC)
    if (config.verbose && process.env.NODE_ENV !== 'test') {
      process.stderr.write(`[Database] Initialized successfully: ${config.memory ? 'memory' : dbConfig.filename}\n`);
    }
    
    return {
      dbManager,
      chartRepository,
      featureRepository
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      process.stderr.write(`[Database] Initialization failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    return {
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Get database status information
 */
export async function getDatabaseStatus(dbManager: DatabaseManager): Promise<{
  isOpen: boolean;
  sqliteVersion: string;
  memoryUsage: { used: number; highWater: number };
  tableStats: {
    charts: number;
    features: number;
    cache: number;
    downloads: number;
  };
  totalSize?: number;
}> {
  if (!dbManager.isOpen()) {
    return {
      isOpen: false,
      sqliteVersion: 'N/A',
      memoryUsage: { used: 0, highWater: 0 },
      tableStats: {
        charts: 0,
        features: 0,
        cache: 0,
        downloads: 0
      }
    };
  }
  
  try {
    // Get table counts
    const chartCountResult = dbManager.executeSql('SELECT COUNT(*) as count FROM charts')[0] as { count: number } | undefined;
    const chartCount = chartCountResult?.count || 0;
    const featureCountResult = dbManager.executeSql('SELECT COUNT(*) as count FROM chart_features')[0] as { count: number } | undefined;
    const featureCount = featureCountResult?.count || 0;
    const cacheCountResult = dbManager.executeSql('SELECT COUNT(*) as count FROM chart_cache')[0] as { count: number } | undefined;
    const cacheCount = cacheCountResult?.count || 0;
    const downloadCountResult = dbManager.executeSql('SELECT COUNT(*) as count FROM chart_downloads')[0] as { count: number } | undefined;
    const downloadCount = downloadCountResult?.count || 0;
    
    // Get total database size (for file-based databases)
    const pageCountResult = dbManager.executeSql('PRAGMA page_count')[0] as { page_count: number } | undefined;
    const pageCount = pageCountResult?.page_count || 0;
    const pageSizeResult = dbManager.executeSql('PRAGMA page_size')[0] as { page_size: number } | undefined;
    const pageSize = pageSizeResult?.page_size || 0;
    const totalSize = pageCount * pageSize;
    
    return {
      isOpen: true,
      sqliteVersion: dbManager.getSQLiteVersion(),
      memoryUsage: dbManager.getMemoryUsage(),
      tableStats: {
        charts: chartCount,
        features: featureCount,
        cache: cacheCount,
        downloads: downloadCount
      },
      totalSize
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      process.stderr.write(`[Database] Failed to get status: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    return {
      isOpen: true,
      sqliteVersion: dbManager.getSQLiteVersion(),
      memoryUsage: dbManager.getMemoryUsage(),
      tableStats: {
        charts: 0,
        features: 0,
        cache: 0,
        downloads: 0
      }
    };
  }
}

/**
 * Perform database maintenance operations
 */
export async function performDatabaseMaintenance(dbManager: DatabaseManager): Promise<{
  vacuumed: boolean;
  checkpointed: boolean;
  oldChartsDeleted: number;
  oldCacheDeleted: number;
  error?: Error;
}> {
  const result = {
    vacuumed: false,
    checkpointed: false,
    oldChartsDeleted: 0,
    oldCacheDeleted: 0
  };
  
  try {
    // Delete old charts (older than configured days)
    const maxAgeDays = parseInt(process.env.ENC_CACHE_MAX_AGE_DAYS || '7', 10);
    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    
    const deleteCharts = dbManager.prepare<[number]>(
      'DELETE FROM charts WHERE cached_at < ?'
    );
    const chartResult = deleteCharts.run([cutoffTime]);
    result.oldChartsDeleted = chartResult.changes;
    
    // Delete expired cache entries
    const deleteCache = dbManager.prepare<[number]>(
      'DELETE FROM chart_cache WHERE expires_at IS NOT NULL AND expires_at < ?'
    );
    const cacheResult = deleteCache.run([Date.now()]);
    result.oldCacheDeleted = cacheResult.changes;
    
    // Vacuum database to reclaim space
    dbManager.vacuum();
    result.vacuumed = true;
    
    // Checkpoint WAL if applicable
    dbManager.checkpoint();
    result.checkpointed = true;
    
    return result;
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}