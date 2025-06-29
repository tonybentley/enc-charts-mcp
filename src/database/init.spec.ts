import { initializeDatabase, getDatabaseStatus, performDatabaseMaintenance } from './init.js';
import { existsSync, rmSync } from 'fs';
import path from 'path';

describe('Database Initialization', () => {
  const testDataDir = './test-db-temp';
  
  afterEach(() => {
    // Clean up test database directory
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('initializeDatabase', () => {
    it('should initialize in-memory database successfully', () => {
      const result = initializeDatabase({ memory: true });
      
      expect(result.error).toBeUndefined();
      expect(result.dbManager).toBeDefined();
      expect(result.chartRepository).toBeDefined();
      expect(result.featureRepository).toBeDefined();
      expect(result.dbManager?.isOpen()).toBe(true);
      
      // Clean up
      result.dbManager?.close();
    });

    it('should initialize file-based database successfully', () => {
      const result = initializeDatabase({ 
        memory: false,
        dataDir: testDataDir 
      });
      
      expect(result.error).toBeUndefined();
      expect(result.dbManager).toBeDefined();
      expect(existsSync(path.join(testDataDir, 'enc-charts.db'))).toBe(true);
      
      // Clean up
      result.dbManager?.close();
    });

    it('should create data directory if it does not exist', () => {
      const nestedDir = path.join(testDataDir, 'nested', 'path');
      
      const result = initializeDatabase({ 
        memory: false,
        dataDir: nestedDir 
      });
      
      expect(existsSync(nestedDir)).toBe(true);
      expect(result.error).toBeUndefined();
      
      // Clean up
      result.dbManager?.close();
    });

    it('should handle initialization errors gracefully', () => {
      // Force an error by providing invalid config
      const result = initializeDatabase({ 
        memory: false,
        dataDir: '/invalid\0path',
        fileMustExist: true
      });
      
      expect(result.error).toBeDefined();
      expect(result.dbManager).toBeUndefined();
      expect(result.chartRepository).toBeUndefined();
      expect(result.featureRepository).toBeUndefined();
    });

    it('should respect verbose option', () => {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();
      
      const result = initializeDatabase({ 
        memory: true,
        verbose: true 
      });
      
      // The message is only written if NODE_ENV is not 'test'
      // Since we're in test environment, it shouldn't be called
      expect(stderrSpy).not.toHaveBeenCalled();
      
      // Clean up
      stderrSpy.mockRestore();
      result.dbManager?.close();
    });
  });

  describe('getDatabaseStatus', () => {
    it('should return status for open database', async () => {
      const { dbManager, chartRepository } = initializeDatabase({ memory: true });
      
      if (!dbManager || !chartRepository) {
        throw new Error('Database initialization failed');
      }
      
      // Insert test data
      await chartRepository.insert({
        chart_id: 'TEST001',
        chart_name: 'Test Chart',
        scale: 50000
      });
      
      const status = await getDatabaseStatus(dbManager);
      
      expect(status.isOpen).toBe(true);
      expect(status.sqliteVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(status.memoryUsage.used).toBeGreaterThan(0);
      expect(status.tableStats.charts).toBe(1);
      expect(status.tableStats.features).toBe(0);
      expect(status.totalSize).toBeGreaterThan(0);
      
      // Clean up
      dbManager.close();
    });

    it('should return empty status for closed database', async () => {
      const { dbManager } = initializeDatabase({ memory: true });
      
      if (!dbManager) {
        throw new Error('Database initialization failed');
      }
      
      dbManager.close();
      
      const status = await getDatabaseStatus(dbManager);
      
      expect(status.isOpen).toBe(false);
      expect(status.sqliteVersion).toBe('N/A');
      expect(status.memoryUsage.used).toBe(0);
      expect(status.tableStats.charts).toBe(0);
    });
  });

  describe('performDatabaseMaintenance', () => {
    it('should perform maintenance operations successfully', async () => {
      const { dbManager, chartRepository } = initializeDatabase({ memory: true });
      
      if (!dbManager || !chartRepository) {
        throw new Error('Database initialization failed');
      }
      
      // Insert old chart
      const oldDate = Date.now() - (10 * 24 * 60 * 60 * 1000); // 10 days ago
      await chartRepository.insert({
        chart_id: 'OLD001',
        chart_name: 'Old Chart',
        scale: 50000,
        cached_at: oldDate
      });
      
      // Insert recent chart
      await chartRepository.insert({
        chart_id: 'NEW001',
        chart_name: 'New Chart',
        scale: 50000
      });
      
      const result = await performDatabaseMaintenance(dbManager);
      
      expect(result.vacuumed).toBe(true);
      expect(result.checkpointed).toBe(true);
      expect(result.oldChartsDeleted).toBe(1);
      expect(result.error).toBeUndefined();
      
      // Verify old chart was deleted
      const remainingCount = await chartRepository.count();
      expect(remainingCount).toBe(1);
      
      // Clean up
      dbManager.close();
    });

    it('should handle maintenance errors gracefully', async () => {
      const { dbManager } = initializeDatabase({ memory: true });
      
      if (!dbManager) {
        throw new Error('Database initialization failed');
      }
      
      // Close database to force error
      dbManager.close();
      
      const result = await performDatabaseMaintenance(dbManager);
      
      expect(result.error).toBeDefined();
      expect(result.vacuumed).toBe(false);
      expect(result.checkpointed).toBe(false);
    });
  });
});