import { getChartHandler } from '../../src/handlers/getChart';
import { searchChartsHandler } from '../../src/handlers/searchCharts';
import { ChartDownloadService } from '../../src/services/chartDownload';
import { S57Parser } from '../../src/services/s57Parser';
import { ChartQueryService } from '../../src/services/chartQuery';
import { CacheManager } from '../../src/utils/cache';
import { promises as fs } from 'fs';
import path from 'path';

describe('Pagination Integration Tests', () => {
  let originalCacheDir: string | undefined;

  beforeAll(async () => {
    // Save original cache directory
    originalCacheDir = process.env.ENC_CACHE_DIR;

    // Use the existing cache directory
    const cacheDir = path.join(process.cwd(), 'cache', 'charts');
    process.env.ENC_CACHE_DIR = cacheDir;
  });

  afterAll(async () => {
    // Restore original cache directory
    if (originalCacheDir !== undefined) {
      process.env.ENC_CACHE_DIR = originalCacheDir;
    } else {
      delete process.env.ENC_CACHE_DIR;
    }
  });

  describe('get_chart pagination', () => {
    it('should apply default pagination limits', async () => {
      // Create a mock response that would be too large without pagination
      const result = await getChartHandler({
        chartId: 'US5CA72M' // This is a known test chart
      });

      expect(result.content).toBeDefined();
      expect(result.content).toHaveLength(1);
      
      const response = JSON.parse(result.content[0].text);
      
      // Check if response includes pagination metadata
      if (response.features && response.features.length > 0) {
        expect(response).toHaveProperty('limit');
        expect(response).toHaveProperty('offset');
        expect(response).toHaveProperty('featureCount');
        expect(response).toHaveProperty('totalFeatures');
        expect(response).toHaveProperty('hasMore');
        
        // Default limit should be 100
        expect(response.limit).toBe(100);
        expect(response.offset).toBe(0);
        expect(response.featureCount).toBeLessThanOrEqual(100);
      }
    });

    it('should respect custom limit parameter', async () => {
      const result = await getChartHandler({
        chartId: 'US5CA72M',
        limit: 10,
        offset: 0
      });

      expect(result.content).toBeDefined();
      expect(result.content).toHaveLength(1);
      
      const response = JSON.parse(result.content[0].text);
      
      if (response.features && response.features.length > 0) {
        expect(response.limit).toBe(10);
        expect(response.featureCount).toBeLessThanOrEqual(10);
      }
    });

    it('should handle offset parameter correctly', async () => {
      // First request to get total count
      const firstResult = await getChartHandler({
        chartId: 'US5CA72M',
        limit: 5,
        offset: 0
      });

      const firstResponse = JSON.parse(firstResult.content[0].text);
      
      if (firstResponse.totalFeatures > 5) {
        // Second request with offset
        const secondResult = await getChartHandler({
          chartId: 'US5CA72M',
          limit: 5,
          offset: 5
        });

        const secondResponse = JSON.parse(secondResult.content[0].text);
        
        expect(secondResponse.offset).toBe(5);
        expect(secondResponse.limit).toBe(5);
        
        // Features should be different
        if (firstResponse.features.length > 0 && secondResponse.features.length > 0) {
          expect(firstResponse.features[0].id).not.toBe(secondResponse.features[0].id);
        }
      }
    });

    it('should handle errors gracefully', async () => {
      const result = await getChartHandler({
        chartId: 'NONEXISTENT',
        limit: 10
      });

      expect(result.content).toBeDefined();
      expect(result.content).toHaveLength(1);
      
      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('error');
    });
  });

  describe('search_charts pagination', () => {
    it('should apply default pagination limits', async () => {
      const result = await searchChartsHandler({});

      expect(result.content).toBeDefined();
      expect(result.content).toHaveLength(1);
      
      const response = JSON.parse(result.content[0].text);
      
      expect(response).toHaveProperty('limit');
      expect(response).toHaveProperty('offset');
      expect(response).toHaveProperty('count');
      expect(response).toHaveProperty('hasMore');
      
      // Default limit should be 50
      expect(response.limit).toBe(50);
      expect(response.offset).toBe(0);
      expect(response.count).toBeLessThanOrEqual(50);
    });

    it('should respect custom pagination parameters', async () => {
      const result = await searchChartsHandler({
        limit: 10,
        offset: 5
      });

      expect(result.content).toBeDefined();
      expect(result.content).toHaveLength(1);
      
      const response = JSON.parse(result.content[0].text);
      
      expect(response.limit).toBe(10);
      expect(response.offset).toBe(5);
      expect(response.count).toBeLessThanOrEqual(10);
    });

    it('should paginate search results correctly', async () => {
      // Search with a bounding box that should return multiple results
      const boundingBox = {
        minLat: 30,
        maxLat: 40,
        minLon: -125,
        maxLon: -115
      };

      // First page
      const firstResult = await searchChartsHandler({
        boundingBox,
        limit: 5,
        offset: 0
      });

      const firstResponse = JSON.parse(firstResult.content[0].text);
      
      if (firstResponse.totalCount > 5) {
        // Second page
        const secondResult = await searchChartsHandler({
          boundingBox,
          limit: 5,
          offset: 5
        });

        const secondResponse = JSON.parse(secondResult.content[0].text);
        
        expect(secondResponse.offset).toBe(5);
        
        // Results should be different
        if (firstResponse.results.length > 0 && secondResponse.results.length > 0) {
          expect(firstResponse.results[0].id).not.toBe(secondResponse.results[0].id);
        }
      }
    });
  });
});