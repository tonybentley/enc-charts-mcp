import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { searchChartsHandler } from './searchCharts.js';
import { ChartQueryService } from '../services/chartQuery.js';
import { CacheManager } from '../utils/cache.js';
import { ChartMetadata } from '../types/enc.js';

// Mock dependencies
jest.mock('../services/chartQuery.js');
jest.mock('../utils/cache.js');

const mockChartQueryService = {
  queryByBoundingBox: jest.fn() as jest.MockedFunction<any>,
  getCatalogStatus: jest.fn() as jest.MockedFunction<any>,
};
const mockCacheManager = {
  initialize: jest.fn() as jest.MockedFunction<any>,
  searchCachedCharts: jest.fn() as jest.MockedFunction<any>,
  isChartCached: jest.fn() as jest.MockedFunction<any>,
};

(ChartQueryService as unknown as jest.Mock).mockImplementation(() => mockChartQueryService);
(CacheManager as unknown as jest.Mock).mockImplementation(() => mockCacheManager);

describe('searchChartsHandler', () => {
  const mockChartSF: ChartMetadata = {
    id: 'US5CA12M',
    name: 'San Francisco Bay',
    scale: 40000,
    format: 'S-57',
    bounds: {
      minLat: 37.4,
      maxLat: 38.0,
      minLon: -122.7,
      maxLon: -122.0,
    },
    lastUpdate: '2024-01-15',
    edition: 28,
    producer: 'NOAA',
  };

  const mockChartSD: ChartMetadata = {
    id: 'US5CA52M',
    name: 'San Diego Bay',
    scale: 12000,
    bounds: {
      minLat: 32.6,
      maxLat: 32.8,
      minLon: -117.3,
      maxLon: -117.1,
    },
    lastUpdate: '2024-01-20',
    edition: 25,
    producer: 'NOAA',
  };

  const mockChartLA: ChartMetadata = {
    id: 'US5CA83M',
    name: 'Los Angeles and Long Beach Harbors',
    scale: 20000,
    format: 'S-101',
    bounds: {
      minLat: 33.7,
      maxLat: 33.8,
      minLon: -118.3,
      maxLon: -118.1,
    },
    lastUpdate: '2024-02-01',
    edition: 30,
    producer: 'NOAA',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    mockCacheManager.initialize.mockResolvedValue(undefined);
    mockCacheManager.searchCachedCharts.mockResolvedValue([]);
    mockCacheManager.isChartCached.mockResolvedValue(false);
    mockChartQueryService.queryByBoundingBox.mockResolvedValue([]);
    mockChartQueryService.getCatalogStatus.mockResolvedValue({
      chartCount: 100,
      lastUpdated: new Date(),
      cacheDir: '/cache/catalog'
    });
  });

  describe('basic search functionality', () => {
    it('should search charts by bounding box', async () => {
      const boundingBox = {
        minLat: 37.0,
        maxLat: 38.5,
        minLon: -123.0,
        maxLon: -122.0,
      };

      mockChartQueryService.queryByBoundingBox.mockResolvedValue([mockChartSF]);

      const result = await searchChartsHandler({ boundingBox });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(1);
      expect(response.results).toHaveLength(1);
      expect(response.results[0].id).toBe('US5CA12M');
      expect(response.results[0].cached).toBe(false);
      expect(response.results[0].downloadUrl).toBe('https://www.charts.noaa.gov/ENCs/US5CA12M.zip');
      
      expect(mockChartQueryService.queryByBoundingBox).toHaveBeenCalledWith(37.0, 38.5, -123.0, -122.0);
    });

    it('should merge cached and catalog results', async () => {
      const boundingBox = {
        minLat: 32.0,
        maxLat: 38.0,
        minLon: -123.0,
        maxLon: -117.0,
      };

      mockCacheManager.searchCachedCharts.mockResolvedValue([mockChartSF]);
      mockChartQueryService.queryByBoundingBox.mockResolvedValue([mockChartSF, mockChartSD]);
      mockCacheManager.isChartCached.mockImplementation(async (chartId: string) => chartId === 'US5CA12M');

      const result = await searchChartsHandler({ boundingBox });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(2); // Should deduplicate SF chart
      expect(response.results).toHaveLength(2);
      
      const sfChart = response.results.find((r: any) => r.id === 'US5CA12M');
      const sdChart = response.results.find((r: any) => r.id === 'US5CA52M');
      
      expect(sfChart.cached).toBe(true);
      expect(sdChart.cached).toBe(false);
    });

    it('should search without bounding box', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue([mockChartSF, mockChartSD]);
      mockCacheManager.isChartCached.mockResolvedValue(true);

      const result = await searchChartsHandler({});

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(2);
      expect(response.results).toHaveLength(2);
      expect(response.results.every((r: any) => r.cached === true)).toBe(true);
      
      expect(mockCacheManager.searchCachedCharts).toHaveBeenCalledWith();
    });
  });

  describe('query filtering', () => {
    it('should filter by query string', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue([mockChartSF, mockChartSD, mockChartLA]);

      const result = await searchChartsHandler({ query: 'diego' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(1);
      expect(response.results[0].id).toBe('US5CA52M');
    });

    it('should search by chart ID', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue([mockChartSF, mockChartSD, mockChartLA]);

      const result = await searchChartsHandler({ query: 'CA52' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(1);
      expect(response.results[0].id).toBe('US5CA52M');
    });

    it('should search by producer', async () => {
      const ukChart: ChartMetadata = {
        id: 'GB5UK01M',
        name: 'English Channel',
        scale: 50000,
        producer: 'UKHO',
        lastUpdate: '2024-01-01',
        edition: 10,
      };

      mockCacheManager.searchCachedCharts.mockResolvedValue([mockChartSF, ukChart]);

      const result = await searchChartsHandler({ query: 'ukho' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(1);
      expect(response.results[0].id).toBe('GB5UK01M');
    });
  });

  describe('scale filtering', () => {
    it('should filter by minimum scale', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue([mockChartSF, mockChartSD, mockChartLA]);

      const result = await searchChartsHandler({ scale: { min: 25000 } });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(1);
      expect(response.results[0].id).toBe('US5CA12M'); // Scale 40000
    });

    it('should filter by maximum scale', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue([mockChartSF, mockChartSD, mockChartLA]);

      const result = await searchChartsHandler({ scale: { max: 30000 } });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(2);
      expect(response.results.map((r: ChartMetadata) => r.id)).toContain('US5CA52M'); // Scale 12000
      expect(response.results.map((r: ChartMetadata) => r.id)).toContain('US5CA83M'); // Scale 20000
    });

    it('should filter by scale range', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue([mockChartSF, mockChartSD, mockChartLA]);

      const result = await searchChartsHandler({ scale: { min: 15000, max: 30000 } });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(1);
      expect(response.results[0].id).toBe('US5CA83M'); // Scale 20000
    });
  });

  describe('format filtering', () => {
    it('should filter by S-57 format', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue([mockChartSF, mockChartSD, mockChartLA]);

      const result = await searchChartsHandler({ format: 'S-57' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(2); // SF and SD (SD has no format, defaults to S-57)
      expect(response.results.map((r: ChartMetadata) => r.id)).toContain('US5CA12M');
      expect(response.results.map((r: ChartMetadata) => r.id)).toContain('US5CA52M');
    });

    it('should filter by S-101 format', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue([mockChartSF, mockChartSD, mockChartLA]);

      const result = await searchChartsHandler({ format: 'S-101' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(1);
      expect(response.results[0].id).toBe('US5CA83M');
    });
  });

  describe('combined filters', () => {
    it('should apply multiple filters', async () => {
      const charts = [mockChartSF, mockChartSD, mockChartLA];
      mockCacheManager.searchCachedCharts.mockResolvedValue(charts);

      const result = await searchChartsHandler({
        query: 'bay',
        scale: { max: 30000 },
        format: 'S-57'
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(1);
      expect(response.results[0].id).toBe('US5CA52M'); // San Diego Bay, scale 12000, S-57
    });

    it('should handle bounding box with other filters', async () => {
      const boundingBox = {
        minLat: 32.0,
        maxLat: 34.0,
        minLon: -119.0,
        maxLon: -117.0,
      };

      mockChartQueryService.queryByBoundingBox.mockResolvedValue([mockChartSD, mockChartLA]);

      const result = await searchChartsHandler({
        boundingBox,
        scale: { max: 15000 }
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(1);
      expect(response.results[0].id).toBe('US5CA52M'); // Scale 12000
    });
  });

  describe('sorting', () => {
    it('should sort results by scale then name', async () => {
      const chartA: ChartMetadata = { ...mockChartSF, name: 'A Chart', scale: 20000 };
      const chartB: ChartMetadata = { ...mockChartSD, name: 'B Chart', scale: 20000 };
      const chartC: ChartMetadata = { ...mockChartLA, name: 'C Chart', scale: 10000 };

      mockCacheManager.searchCachedCharts.mockResolvedValue([chartB, chartC, chartA]);

      const result = await searchChartsHandler({});

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.results).toHaveLength(3);
      expect(response.results[0].name).toBe('C Chart'); // Smallest scale first
      expect(response.results[1].name).toBe('A Chart'); // Same scale, alphabetical
      expect(response.results[2].name).toBe('B Chart');
    });
  });

  describe('error handling', () => {
    it('should handle invalid parameters', async () => {
      const result = await searchChartsHandler({
        scale: { min: 'invalid' } // Invalid type
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toContain('Invalid parameters');
      expect(response.params).toBeDefined();
    });

    it('should handle missing required bounding box fields', async () => {
      const result = await searchChartsHandler({
        boundingBox: { minLat: 32.0 } // Missing other fields
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toContain('Invalid parameters');
    });

    it('should handle chart query service errors', async () => {
      mockChartQueryService.queryByBoundingBox.mockRejectedValue(new Error('Network error'));

      const result = await searchChartsHandler({
        boundingBox: {
          minLat: 32.0,
          maxLat: 33.0,
          minLon: -118.0,
          maxLon: -117.0,
        }
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toBe('Network error');
    });

    it('should handle cache manager errors gracefully', async () => {
      mockCacheManager.searchCachedCharts.mockRejectedValue(new Error('Cache error'));

      const result = await searchChartsHandler({});

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toBe('Cache error');
    });
  });

  describe('edge cases', () => {
    it('should handle empty results', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue([]);
      mockChartQueryService.queryByBoundingBox.mockResolvedValue([]);

      const result = await searchChartsHandler({
        boundingBox: {
          minLat: 0,
          maxLat: 1,
          minLon: 0,
          maxLon: 1,
        }
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(0);
      expect(response.results).toHaveLength(0);
    });

    it('should handle charts without bounds', async () => {
      const chartNoBounds: ChartMetadata = {
        id: 'TESTCHART',
        name: 'Test Chart',
        scale: 50000,
        lastUpdate: '2024-01-01',
        edition: 1,
      };

      mockCacheManager.searchCachedCharts.mockResolvedValue([chartNoBounds]);

      const result = await searchChartsHandler({});

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(1);
      expect(response.results[0].id).toBe('TESTCHART');
    });

    it('should handle null/undefined producer', async () => {
      const chartNoProducer: ChartMetadata = {
        ...mockChartSF,
        producer: undefined,
      };

      mockCacheManager.searchCachedCharts.mockResolvedValue([chartNoProducer]);

      const result = await searchChartsHandler({ query: 'noaa' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBe(0); // Should not match undefined producer
    });
  });

  describe('pagination', () => {
    const mockCharts = Array.from({ length: 100 }, (_, i) => ({
      id: `CHART${i.toString().padStart(3, '0')}`,
      name: `Test Chart ${i}`,
      scale: 10000 + i * 1000,
      format: 'S-57' as const,
      bounds: {
        minLat: 30 + i * 0.1,
        maxLat: 30.5 + i * 0.1,
        minLon: -120 + i * 0.1,
        maxLon: -119.5 + i * 0.1,
      },
      lastUpdate: '2024-01-01',
      edition: 1,
      producer: 'NOAA',
    }));

    it('should apply default pagination (limit=50, offset=0)', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue(mockCharts);

      const result = await searchChartsHandler({});
      const response = JSON.parse(result.content[0].text);

      expect(response.count).toBe(50); // Default limit
      expect(response.totalCount).toBe(100);
      expect(response.hasMore).toBe(true);
      expect(response.limit).toBe(50);
      expect(response.offset).toBe(0);
      expect(response.results).toHaveLength(50);
      expect(response.results[0].id).toBe('CHART000');
      expect(response.results[49].id).toBe('CHART049');
    });

    it('should apply custom pagination parameters', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue(mockCharts);

      const result = await searchChartsHandler({
        limit: 20,
        offset: 30
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.count).toBe(20);
      expect(response.totalCount).toBe(100);
      expect(response.hasMore).toBe(true);
      expect(response.limit).toBe(20);
      expect(response.offset).toBe(30);
      expect(response.results).toHaveLength(20);
      expect(response.results[0].id).toBe('CHART030');
      expect(response.results[19].id).toBe('CHART049');
    });

    it('should handle offset beyond total results', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue(mockCharts.slice(0, 30));

      const result = await searchChartsHandler({
        limit: 50,
        offset: 50
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.count).toBe(0);
      expect(response.totalCount).toBe(30);
      expect(response.hasMore).toBe(false);
      expect(response.results).toHaveLength(0);
    });

    it('should handle last page correctly', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue(mockCharts);

      const result = await searchChartsHandler({
        limit: 30,
        offset: 90
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.count).toBe(10); // Only 10 items left
      expect(response.totalCount).toBe(100);
      expect(response.hasMore).toBe(false);
      expect(response.limit).toBe(30);
      expect(response.offset).toBe(90);
      expect(response.results).toHaveLength(10);
      expect(response.results[0].id).toBe('CHART090');
      expect(response.results[9].id).toBe('CHART099');
    });

    it('should respect maximum limit of 100', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue(mockCharts);

      const result = await searchChartsHandler({
        limit: 100 // At max limit
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.count).toBe(100); // Returns max allowed
      expect(response.totalCount).toBe(100);
      expect(response.hasMore).toBe(false);
      expect(response.limit).toBe(100);
    });

    it('should reject limit values over 100', async () => {
      const result = await searchChartsHandler({
        limit: 150 // Over max - should be rejected by schema
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBeDefined();
      expect(response.error).toContain('100');
    });

    it('should apply pagination after filtering', async () => {
      mockCacheManager.searchCachedCharts.mockResolvedValue(mockCharts);

      const result = await searchChartsHandler({
        query: 'Chart 1', // Will match Chart 1, 10-19, 100 (if existed)
        limit: 5,
        offset: 0
      });
      const response = JSON.parse(result.content[0].text);

      // Should match Chart 1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19
      expect(response.totalCount).toBe(11); // Chart 1 and Chart 10-19
      expect(response.count).toBe(5); // Limited to 5
      expect(response.hasMore).toBe(true);
      expect(response.results[0].name).toBe('Test Chart 1');
      expect(response.results[1].name).toBe('Test Chart 10');
      expect(response.results[4].name).toBe('Test Chart 13');
    });
  });
});