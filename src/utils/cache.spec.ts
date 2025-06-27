import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { CacheManager } from './cache.js';
import { promises as fs } from 'fs';

jest.mock('fs', () => ({
  promises: {
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  stat: jest.fn(),
  rm: jest.fn(),
  access: jest.fn()
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  const mockCacheDir = '/test/cache';

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager = new CacheManager({ 
      cacheDir: mockCacheDir,
      maxSizeGB: 10,
      maxAgeInDays: 7
    });
  });

  describe('initialize', () => {
    it('should create cache directory and load index', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(new Error('Not found'));

      await cacheManager.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith(mockCacheDir, { recursive: true });
    });

    it('should load existing index', async () => {
      const mockIndex = [{
        chartId: 'US5CA52M',
        metadata: { id: 'US5CA52M', name: 'Test Chart' },
        downloadDate: '2024-01-15',
        lastAccessed: '2024-01-15'
      }];
      
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockIndex) as any);
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);

      await cacheManager.initialize();

      const cached = await cacheManager.isChartCached('US5CA52M');
      expect(cached).toBe(true);
    });
  });

  describe('isChartCached', () => {
    it('should return true if chart exists in index', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify([{
        chartId: 'US5CA52M',
        metadata: { id: 'US5CA52M' }
      }]) as any);
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);

      await cacheManager.initialize();
      const result = await cacheManager.isChartCached('US5CA52M');
      expect(result).toBe(true);
    });

    it('should return false if chart does not exist', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(new Error('Not found'));

      await cacheManager.initialize();
      const result = await cacheManager.isChartCached('US5CA52M');
      expect(result).toBe(false);
    });
  });

  describe('addChart', () => {
    it('should save chart to cache', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(new Error('Not found'));
      mockFs.writeFile.mockResolvedValue(undefined);

      await cacheManager.initialize();
      await cacheManager.addChart('US5CA52M', { 
        id: 'US5CA52M', 
        name: 'Test Chart',
        scale: 40000,
        lastUpdate: '2024-01-15',
        edition: '25'
      });

      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle errors when saving', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(new Error('Not found'));
      mockFs.writeFile.mockRejectedValue(new Error('Permission denied'));

      await cacheManager.initialize();
      await expect(cacheManager.addChart('US5CA52M', {
        id: 'US5CA52M',
        name: 'Test Chart',
        scale: 40000,
        lastUpdate: '2024-01-15',
        edition: '25'
      })).rejects.toThrow('Permission denied');
    });
  });

  describe('searchCachedCharts', () => {
    beforeEach(async () => {
      const mockIndex = [{
        chartId: 'US5CA52M',
        metadata: {
          id: 'US5CA52M',
          name: 'San Francisco Bay',
          scale: 40000,
          bounds: { minLat: 37.7, maxLat: 37.8, minLon: -122.5, maxLon: -122.4 }
        }
      }, {
        chartId: 'US5CA53M',
        metadata: {
          id: 'US5CA53M',
          name: 'Los Angeles Harbor',
          scale: 20000,
          bounds: { minLat: 33.7, maxLat: 33.8, minLon: -118.3, maxLon: -118.2 }
        }
      }];
      
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockIndex) as any);
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);

      await cacheManager.initialize();
    });

    it('should search by bounds', async () => {
      const results = await cacheManager.searchCachedCharts({
        minLat: 37.6,
        maxLat: 37.9,
        minLon: -122.6,
        maxLon: -122.3
      });
      
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('US5CA52M');
    });

    it('should return all charts when no bounds specified', async () => {
      const results = await cacheManager.searchCachedCharts({
        minLat: -90,
        maxLat: 90,
        minLon: -180,
        maxLon: 180
      });
      
      expect(results).toHaveLength(2);
    });
  });

  describe('getChartMetadata', () => {
    it('should return metadata if exists', async () => {
      const mockIndex = [{
        chartId: 'US5CA52M',
        metadata: {
          id: 'US5CA52M',
          name: 'Test Chart',
          scale: 40000
        }
      }];
      
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockIndex) as any);
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);

      await cacheManager.initialize();
      const metadata = await cacheManager.getChartMetadata('US5CA52M');
      
      expect(metadata?.id).toBe('US5CA52M');
      expect(metadata?.name).toBe('Test Chart');
    });

    it('should return null if not exists', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(new Error('Not found'));

      await cacheManager.initialize();
      const metadata = await cacheManager.getChartMetadata('UNKNOWN');
      expect(metadata).toBeNull();
    });
  });

  describe('getChart', () => {
    it('should return chart entry if exists', async () => {
      const mockIndex = [{
        chartId: 'US5CA52M',
        metadata: { id: 'US5CA52M', name: 'Test Chart' },
        downloadDate: '2024-01-15',
        lastAccessed: '2024-01-15',
        sizeInBytes: 1024,
        version: '25'
      }];
      
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockIndex) as any);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);

      await cacheManager.initialize();
      const chart = await cacheManager.getChart('US5CA52M');
      
      expect(chart?.chartId).toBe('US5CA52M');
      expect(chart?.metadata.name).toBe('Test Chart');
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      const mockIndex = [{
        chartId: 'US5CA52M',
        metadata: { id: 'US5CA52M' },
        sizeInBytes: 1024 * 1024,
        downloadDate: '2024-01-15'
      }];
      
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockIndex) as any);
      mockFs.access.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);

      await cacheManager.initialize();
      const stats = await cacheManager.getStats();
      
      expect(stats.chartCount).toBe(1);
      expect(stats.totalSizeGB).toBeGreaterThan(0);
    });
  });
});