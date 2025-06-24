import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { searchChartsHandler } from './searchCharts.js';
import { chartQueryService } from '../services/chartQuery.js';
import { cacheManager } from '../utils/cache.js';
import { ChartMetadata } from '../types/enc.js';

// Mock dependencies
jest.mock('../services/chartQuery.js');
jest.mock('../utils/cache.js');

const mockChartQueryService = chartQueryService as jest.Mocked<typeof chartQueryService>;
const mockCacheManager = cacheManager as jest.Mocked<typeof cacheManager>;

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
      expect(response.results[0].downloadUrl).toBe('https://www.charts.noaa.gov/ENCs/US5CA12M/US5CA12M.zip');
      
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
      mockCacheManager.isChartCached.mockImplementation(async (chartId) => chartId === 'US5CA12M');

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
      expect(response.results.map((r: any) => r.id)).toContain('US5CA52M'); // Scale 12000
      expect(response.results.map((r: any) => r.id)).toContain('US5CA83M'); // Scale 20000
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
      expect(response.results.map((r: any) => r.id)).toContain('US5CA12M');
      expect(response.results.map((r: any) => r.id)).toContain('US5CA52M');
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
});