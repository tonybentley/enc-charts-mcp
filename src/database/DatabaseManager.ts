/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatabaseSync } from 'node:sqlite';
import { DATABASE_SCHEMAS, DATABASE_INDEXES } from './schemas.js';

export interface DatabaseConfig {
  filename?: string;
  memory?: boolean;
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: boolean;
}

// SQLite-compatible statement interface
export interface SQLiteStatement<T = unknown> {
  all(params?: any[]): T[];
  get(params?: any[]): T | undefined;
  run(params?: any[]): { changes: number; lastInsertRowid: number };
}

export class DatabaseManager {
  private database: DatabaseSync | null = null;
  private isInitialized = false;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig = {}) {
    this.config = config;
  }

  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create SQLite database - in-memory by default
      const filename = this.config.memory !== false ? ':memory:' : (this.config.filename || ':memory:');
      this.database = new DatabaseSync(filename);
      
      // Enable foreign keys
      this.database.exec('PRAGMA foreign_keys = ON');
      
      // Create all tables and indexes
      this.database.exec(DATABASE_SCHEMAS.charts);
      this.database.exec(DATABASE_SCHEMAS.chart_features);
      this.database.exec(DATABASE_SCHEMAS.chart_cache);
      this.database.exec(DATABASE_SCHEMAS.chart_downloads);
      this.database.exec(DATABASE_SCHEMAS.coastline_cache);

      this.database.exec(DATABASE_INDEXES.chart_bbox);
      this.database.exec(DATABASE_INDEXES.chart_scale);
      this.database.exec(DATABASE_INDEXES.feature_bbox);
      this.database.exec(DATABASE_INDEXES.feature_class);
      this.database.exec(DATABASE_INDEXES.feature_chart);
      this.database.exec(DATABASE_INDEXES.cache_timestamp);
      this.database.exec(DATABASE_INDEXES.coastline_cache_chart);
      this.database.exec(DATABASE_INDEXES.coastline_type);

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize SQLite database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public getDatabase(): DatabaseSync {
    if (!this.isInitialized || !this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.database;
  }

  public prepare<BindParameters extends unknown[] = unknown[], Result = unknown>(
    sql: string
  ): SQLiteStatement<Result> {
    if (!this.isInitialized || !this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const stmt = this.database.prepare(sql);

    // Return a SQLite-compatible statement object
    return {
      all: (params?: BindParameters): Result[] => {
        if (params && params.length > 0) {
          return stmt.all(...params) as Result[];
        }
        return stmt.all() as Result[];
      },
      get: (params?: BindParameters): Result | undefined => {
        if (params && params.length > 0) {
          return stmt.get(...params) as Result | undefined;
        }
        return stmt.get() as Result | undefined;
      },
      run: (params?: BindParameters): { changes: number; lastInsertRowid: number } => {
        if (params && params.length > 0) {
          const result = stmt.run(...params);
          return { 
            changes: Number(result.changes), 
            lastInsertRowid: Number(result.lastInsertRowid) 
          };
        }
        const result = stmt.run();
        return { 
          changes: Number(result.changes), 
          lastInsertRowid: Number(result.lastInsertRowid) 
        };
      }
    };
  }

  public async transaction<T>(fn: () => Promise<T> | T): Promise<T> {
    if (!this.isInitialized || !this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    // SQLite handles transactions differently
    this.database.exec('BEGIN');
    try {
      const result = await fn();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  public close(): void {
    if (this.database) {
      this.database.close();
      this.database = null;
      this.isInitialized = false;
    }
  }

  public isOpen(): boolean {
    return this.database !== null && this.isInitialized;
  }

  public getMemoryUsage(): { used: number; highWater: number } {
    if (!this.isInitialized || !this.database) {
      return { used: 0, highWater: 0 };
    }

    try {
      // SQLite memory usage via PRAGMA
      const stmt = this.database.prepare('PRAGMA page_count');
      const pageCount = stmt.get() as { page_count: number } | undefined;
      const stmt2 = this.database.prepare('PRAGMA page_size');
      const pageSize = stmt2.get() as { page_size: number } | undefined;
      
      const used = (pageCount?.page_count || 0) * (pageSize?.page_size || 0);
      return { 
        used, 
        highWater: used 
      };
    } catch {
      return { used: 0, highWater: 0 };
    }
  }

  public vacuum(): void {
    if (!this.isInitialized || !this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    this.database.exec('VACUUM');
  }

  public checkpoint(): void {
    if (!this.isInitialized || !this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    // SQLite WAL checkpoint
    this.database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }

  // SQLite-specific helper methods
  public getSQLiteVersion(): string {
    if (!this.isInitialized || !this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    
    try {
      const result = this.executeSql('SELECT sqlite_version() as version');
      return result[0]?.version || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  public executeSql(sql: string, params?: any[]): any[] {
    if (!this.isInitialized || !this.database) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    
    const stmt = this.database.prepare(sql);
    if (params && params.length > 0) {
      return stmt.all(params);
    }
    return stmt.all();
  }
}