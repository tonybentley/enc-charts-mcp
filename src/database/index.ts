// Database core
export { DatabaseManager, type DatabaseConfig, type SQLiteStatement } from './DatabaseManager.js';

// Schemas and types
export {
  type ChartRecord,
  type ChartFeatureRecord,
  type ChartCacheRecord,
  type ChartDownloadRecord,
  type BoundingBox,
  DATABASE_SCHEMAS,
  DATABASE_INDEXES
} from './schemas.js';

// Repositories
export { ChartRepository, type PaginationOptions as ChartPaginationOptions } from './repositories/ChartRepository.js';
export { 
  NavigationFeatureRepository, 
  type PaginationOptions as FeaturePaginationOptions,
  type ObjectClassStats,
  type ChartFeatureStats
} from './repositories/NavigationFeatureRepository.js';

// Initialization
export {
  initializeDatabase,
  getDatabaseStatus,
  performDatabaseMaintenance,
  type DatabaseInitResult,
  type DatabaseOptions
} from './init.js';