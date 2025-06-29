import { DatabaseManager } from './DatabaseManager.js';

describe('DatabaseManager', () => {
  let dbManager: DatabaseManager;

  beforeEach(() => {
    dbManager = new DatabaseManager({ memory: true });
  });

  afterEach(() => {
    if (dbManager.isOpen()) {
      dbManager.close();
    }
  });

  describe('initialization', () => {
    it('should initialize database successfully', () => {
      expect(() => dbManager.initialize()).not.toThrow();
      expect(dbManager.isOpen()).toBe(true);
    });

    it('should handle multiple initialization calls gracefully', () => {
      dbManager.initialize();
      expect(() => dbManager.initialize()).not.toThrow();
      expect(dbManager.isOpen()).toBe(true);
    });

    it('should create all required tables', () => {
      dbManager.initialize();
      
      // Check if tables exist
      const tables = dbManager.executeSql(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      );
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('charts');
      expect(tableNames).toContain('chart_features');
      expect(tableNames).toContain('chart_cache');
      expect(tableNames).toContain('chart_downloads');
    });

    it('should create all required indexes', () => {
      dbManager.initialize();
      
      // Check if indexes exist
      const indexes = dbManager.executeSql(
        "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name"
      );
      
      const indexNames = indexes.map(i => i.name);
      expect(indexNames).toContain('idx_chart_bbox');
      expect(indexNames).toContain('idx_chart_scale');
      expect(indexNames).toContain('idx_feature_bbox');
      expect(indexNames).toContain('idx_feature_class');
      expect(indexNames).toContain('idx_feature_chart');
      expect(indexNames).toContain('idx_cache_timestamp');
    });

    it('should enable foreign keys', () => {
      dbManager.initialize();
      
      const result = dbManager.executeSql('PRAGMA foreign_keys');
      expect(result[0].foreign_keys).toBe(1);
    });
  });

  describe('database operations', () => {
    beforeEach(() => {
      dbManager.initialize();
    });

    it('should prepare and execute statements', () => {
      const stmt = dbManager.prepare<[string, string, number], { chart_id: string }>(`
        INSERT INTO charts (chart_id, chart_name, scale) VALUES (?, ?, ?)
      `);
      
      const result = stmt.run(['US5CA12M', 'San Francisco Bay', 50000]);
      expect(result.changes).toBe(1);
      
      const selectStmt = dbManager.prepare<[], { chart_id: string }>('SELECT chart_id FROM charts');
      const charts = selectStmt.all();
      expect(charts).toHaveLength(1);
      expect(charts[0].chart_id).toBe('US5CA12M');
    });

    it('should handle transactions correctly', async () => {
      await dbManager.transaction(async () => {
        const stmt = dbManager.prepare(`
          INSERT INTO charts (chart_id, chart_name, scale) VALUES (?, ?, ?)
        `);
        stmt.run(['US5CA12M', 'San Francisco Bay', 50000]);
        stmt.run(['US5CA13M', 'Oakland Harbor', 25000]);
      });
      
      const result = dbManager.executeSql('SELECT COUNT(*) as count FROM charts');
      expect(result[0].count).toBe(2);
    });

    it('should rollback transaction on error', async () => {
      try {
        await dbManager.transaction(async () => {
          const stmt = dbManager.prepare(`
            INSERT INTO charts (chart_id, chart_name, scale) VALUES (?, ?, ?)
          `);
          stmt.run(['US5CA12M', 'San Francisco Bay', 50000]);
          
          // This should fail due to PRIMARY KEY constraint
          stmt.run(['US5CA12M', 'Duplicate Chart', 25000]);
        });
      } catch (error) {
        // Expected error
      }
      
      const result = dbManager.executeSql('SELECT COUNT(*) as count FROM charts');
      expect(result[0].count).toBe(0);
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      dbManager.initialize();
    });

    it('should return SQLite version', () => {
      const version = dbManager.getSQLiteVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should return memory usage', () => {
      const usage = dbManager.getMemoryUsage();
      expect(usage).toHaveProperty('used');
      expect(usage).toHaveProperty('highWater');
      expect(usage.used).toBeGreaterThanOrEqual(0);
    });

    it('should vacuum database', () => {
      expect(() => dbManager.vacuum()).not.toThrow();
    });

    it('should checkpoint database', () => {
      expect(() => dbManager.checkpoint()).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should throw error when using database before initialization', () => {
      expect(() => dbManager.getDatabase()).toThrow('Database not initialized');
      expect(() => dbManager.prepare('SELECT 1')).toThrow('Database not initialized');
      expect(() => dbManager.executeSql('SELECT 1')).toThrow('Database not initialized');
    });

    it('should handle close and reopen', () => {
      dbManager.initialize();
      expect(dbManager.isOpen()).toBe(true);
      
      dbManager.close();
      expect(dbManager.isOpen()).toBe(false);
      
      // Should be able to reinitialize
      dbManager.initialize();
      expect(dbManager.isOpen()).toBe(true);
    });
  });

  describe('file-based database', () => {
    it('should create file-based database when memory is false', () => {
      const fileDb = new DatabaseManager({ 
        filename: ':memory:', // Still use memory for testing
        memory: false 
      });
      
      fileDb.initialize();
      expect(fileDb.isOpen()).toBe(true);
      
      fileDb.close();
    });
  });
});