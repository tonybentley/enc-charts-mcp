import { DatabaseManager } from '../DatabaseManager.js';
import { ChartRepository } from './ChartRepository.js';
import type { ChartRecord, BoundingBox } from '../schemas.js';

describe('ChartRepository', () => {
  let dbManager: DatabaseManager;
  let chartRepo: ChartRepository;

  beforeEach(() => {
    dbManager = new DatabaseManager({ memory: true });
    dbManager.initialize();
    chartRepo = new ChartRepository(dbManager);
  });

  afterEach(() => {
    if (dbManager.isOpen()) {
      dbManager.close();
    }
  });

  const createTestChart = (chartId: string, overrides?: Partial<ChartRecord>): ChartRecord => ({
    chart_id: chartId,
    chart_name: `Test Chart ${chartId}`,
    scale: 50000,
    bbox_minlon: -122.5,
    bbox_minlat: 37.7,
    bbox_maxlon: -122.3,
    bbox_maxlat: 37.9,
    edition: 1,
    update_date: '2024-01-01',
    file_path: `/cache/charts/${chartId}`,
    file_size: 1024000,
    download_url: `https://charts.noaa.gov/ENCs/${chartId}.zip`,
    chart_purpose: 'OVERVIEW',
    compilation_scale: 50000,
    ...overrides
  });

  describe('insert operations', () => {
    it('should insert a single chart', async () => {
      const chart = createTestChart('US5CA12M');
      await chartRepo.insert(chart);
      
      const result = await chartRepo.getById('US5CA12M');
      expect(result).toBeDefined();
      expect(result?.chart_id).toBe('US5CA12M');
      expect(result?.chart_name).toBe('Test Chart US5CA12M');
    });

    it('should insert multiple charts in batch', async () => {
      const charts = [
        createTestChart('US5CA12M'),
        createTestChart('US5CA13M'),
        createTestChart('US5CA14M')
      ];
      
      await chartRepo.insertBatch(charts);
      
      const count = await chartRepo.count();
      expect(count).toBe(3);
    });

    it('should update existing chart on conflict', async () => {
      const chart = createTestChart('US5CA12M');
      await chartRepo.insert(chart);
      
      const updatedChart = createTestChart('US5CA12M', { scale: 25000 });
      await chartRepo.insert(updatedChart);
      
      const result = await chartRepo.getById('US5CA12M');
      expect(result?.scale).toBe(25000);
    });
  });

  describe('query operations', () => {
    beforeEach(async () => {
      await chartRepo.insertBatch([
        createTestChart('US5CA12M', { 
          bbox_minlon: -122.5, bbox_minlat: 37.7, 
          bbox_maxlon: -122.3, bbox_maxlat: 37.9,
          scale: 50000
        }),
        createTestChart('US5CA13M', { 
          bbox_minlon: -122.4, bbox_minlat: 37.75, 
          bbox_maxlon: -122.2, bbox_maxlat: 37.85,
          scale: 25000
        }),
        createTestChart('US5CA14M', { 
          bbox_minlon: -123.0, bbox_minlat: 37.0, 
          bbox_maxlon: -122.0, bbox_maxlat: 38.0,
          scale: 100000
        })
      ]);
    });

    it('should find charts by coordinates', async () => {
      const charts = await chartRepo.findByCoordinates(37.8, -122.4);
      expect(charts).toHaveLength(3);
      // Should be ordered by scale (most detailed first)
      expect(charts[0].scale).toBe(25000);
      expect(charts[1].scale).toBe(50000);
      expect(charts[2].scale).toBe(100000);
    });

    it('should find charts by bounding box', async () => {
      const bounds: BoundingBox = {
        minLat: 37.75,
        maxLat: 37.85,
        minLon: -122.4,
        maxLon: -122.2
      };
      
      const charts = await chartRepo.findByBounds(bounds);
      // US5CA12M: bbox -122.5 to -122.3, 37.7 to 37.9 - overlaps with query bounds
      // US5CA13M: bbox -122.4 to -122.2, 37.75 to 37.85 - fully contained in query bounds
      // US5CA14M: bbox -123.0 to -122.0, 37.0 to 38.0 - overlaps with query bounds
      expect(charts).toHaveLength(3); // All three charts overlap with the query bounds
      expect(charts.map(c => c.chart_id)).toContain('US5CA12M');
      expect(charts.map(c => c.chart_id)).toContain('US5CA13M');
      expect(charts.map(c => c.chart_id)).toContain('US5CA14M');
    });

    it('should find charts by scale range', async () => {
      const charts = await chartRepo.findByScaleRange(20000, 60000);
      expect(charts).toHaveLength(2);
      expect(charts[0].scale).toBe(25000);
      expect(charts[1].scale).toBe(50000);
    });

    it('should find all charts', async () => {
      const charts = await chartRepo.findAll();
      expect(charts).toHaveLength(3);
    });

    it('should paginate results', async () => {
      const page1 = await chartRepo.findAll({ limit: 2, offset: 0 });
      expect(page1).toHaveLength(2);
      
      const page2 = await chartRepo.findAll({ limit: 2, offset: 2 });
      expect(page2).toHaveLength(1);
    });
  });

  describe('update operations', () => {
    it('should update last accessed timestamp', async () => {
      const chart = createTestChart('US5CA12M');
      await chartRepo.insert(chart);
      
      const before = await chartRepo.getById('US5CA12M');
      const beforeTimestamp = before?.last_accessed || 0;
      
      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await chartRepo.updateLastAccessed('US5CA12M');
      
      const after = await chartRepo.getById('US5CA12M');
      const afterTimestamp = after?.last_accessed || 0;
      
      expect(afterTimestamp).toBeGreaterThan(beforeTimestamp);
    });

    it('should update file path and size', async () => {
      const chart = createTestChart('US5CA12M');
      await chartRepo.insert(chart);
      
      await chartRepo.updateFileInfo('US5CA12M', '/new/path', 2048000);
      
      const result = await chartRepo.getById('US5CA12M');
      expect(result?.file_path).toBe('/new/path');
      expect(result?.file_size).toBe(2048000);
    });
  });

  describe('delete operations', () => {
    it('should delete a chart by ID', async () => {
      const chart = createTestChart('US5CA12M');
      await chartRepo.insert(chart);
      
      const deleted = await chartRepo.delete('US5CA12M');
      expect(deleted).toBe(true);
      
      const result = await chartRepo.getById('US5CA12M');
      expect(result).toBeNull();
    });

    it('should delete old charts', async () => {
      const oldDate = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
      const recentDate = Date.now() - (2 * 24 * 60 * 60 * 1000); // 2 days ago
      
      await chartRepo.insertBatch([
        { ...createTestChart('US5CA12M'), cached_at: oldDate },
        { ...createTestChart('US5CA13M'), cached_at: recentDate },
        { ...createTestChart('US5CA14M'), cached_at: oldDate }
      ]);
      
      // Delete charts older than 7 days
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const deleted = await chartRepo.deleteOlderThan(sevenDaysAgo);
      
      expect(deleted).toBe(2);
      
      const remaining = await chartRepo.findAll();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].chart_id).toBe('US5CA13M');
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await chartRepo.insertBatch([
        createTestChart('US5CA12M', { file_size: 1024000 }),
        createTestChart('US5CA13M', { file_size: 2048000 }),
        createTestChart('US5CA14M', { file_size: 512000 })
      ]);
    });

    it('should get total cache size', async () => {
      const totalSize = await chartRepo.getTotalCacheSize();
      expect(totalSize).toBe(3584000); // 1024000 + 2048000 + 512000
    });

    it('should get charts by update date', async () => {
      const charts = await chartRepo.findByUpdateDateRange('2023-12-01', '2024-02-01');
      expect(charts).toHaveLength(3);
    });

    it('should check if chart exists', async () => {
      const exists = await chartRepo.exists('US5CA12M');
      expect(exists).toBe(true);
      
      const notExists = await chartRepo.exists('NOTFOUND');
      expect(notExists).toBe(false);
    });
  });
});