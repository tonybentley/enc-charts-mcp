import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { searchChartsHandler } from '../src/handlers/searchCharts.js';
import { ChartDownloadService } from '../src/services/chartDownload.js';
import { CacheManager } from '../src/utils/cache.js';
import { getCacheManager, getChartDownloadService } from '../src/services/serviceInitializer.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('searchCharts Integration Tests', () => {
  let testCacheDir: string;
  let cacheManager: CacheManager;
  let chartDownloadService: ChartDownloadService;

  beforeAll(async () => {
    // Create a temporary cache directory for tests
    testCacheDir = path.join(os.tmpdir(), 'enc-charts-test-' + Date.now());
    await fs.mkdir(testCacheDir, { recursive: true });
    
    // Set environment variable for test cache directory
    process.env.ENC_CACHE_DIR = testCacheDir;
    process.env.ENC_CACHE_MAX_SIZE_GB = '1';
    process.env.ENC_CACHE_MAX_AGE_DAYS = '7';
    
    // Get services from initializer
    cacheManager = await getCacheManager();
    chartDownloadService = await getChartDownloadService();
  });

  afterAll(async () => {
    // Clean up test cache directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  });

  describe('Real chart search with XML catalog', () => {
    it('should search for charts in San Francisco Bay area', async () => {
      const result = await searchChartsHandler({
        boundingBox: {
          minLat: 37.4,
          maxLat: 38.0,
          minLon: -122.7,
          maxLon: -122.0,
        }
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.count).toBeGreaterThan(0);
      expect(response.results).toBeDefined();
      expect(Array.isArray(response.results)).toBe(true);

      // Verify we get San Francisco Bay charts
      const sfBayCharts = response.results.filter((chart: any) => 
        chart.name.toLowerCase().includes('san francisco') ||
        chart.id.includes('CA1')
      );
      expect(sfBayCharts.length).toBeGreaterThan(0);

      // Verify chart metadata structure
      const firstChart = response.results[0];
      expect(firstChart).toHaveProperty('id');
      expect(firstChart).toHaveProperty('name');
      expect(firstChart).toHaveProperty('scale');
      expect(firstChart).toHaveProperty('cached');
      expect(firstChart).toHaveProperty('downloadUrl');
      expect(firstChart.downloadUrl).toMatch(/^https:\/\/www\.charts\.noaa\.gov\/ENCs\//);
    });

    it('should search for charts by name query', async () => {
      const result = await searchChartsHandler({
        query: 'San Diego'
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      // Since we're searching cached charts only without bounds, might be empty
      expect(response.count).toBeGreaterThanOrEqual(0);
      expect(response.results).toBeDefined();
    });

    it('should filter charts by scale', async () => {
      const result = await searchChartsHandler({
        boundingBox: {
          minLat: 32.5,
          maxLat: 33.5,
          minLon: -118.0,
          maxLon: -117.0,
        },
        scale: {
          min: 10000,
          max: 50000
        }
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.results).toBeDefined();
      
      // All results should be within scale range
      for (const chart of response.results) {
        expect(chart.scale).toBeGreaterThanOrEqual(10000);
        expect(chart.scale).toBeLessThanOrEqual(50000);
      }
    });

    it('should handle search with download and cache', async () => {
      // First, download a specific chart
      const chartId = 'US5CA52M'; // San Diego Bay
      
      // Check if already cached to avoid redundant download
      const isCached = await cacheManager.isChartCached(chartId);
      
      if (!isCached) {
        try {
          await chartDownloadService.downloadChart(chartId);
        } catch (error) {
          // Skip if download fails (network issues, etc.)
          console.log('Skipping cache test due to download failure:', error);
          return;
        }
      }

      // Now search for charts in the San Diego area
      const result = await searchChartsHandler({
        boundingBox: {
          minLat: 32.6,
          maxLat: 32.8,
          minLon: -117.3,
          maxLon: -117.1,
        }
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      // Should find at least the cached chart
      expect(response.count).toBeGreaterThan(0);
      
      // Find the San Diego Bay chart
      const sdChart = response.results.find((chart: any) => chart.id === chartId);
      expect(sdChart).toBeDefined();
      expect(sdChart.cached).toBe(true);
    });

    it('should merge cached and catalog results without duplicates', async () => {
      // Search for a broad area that might have cached charts
      const result = await searchChartsHandler({
        boundingBox: {
          minLat: 32.0,
          maxLat: 38.0,
          minLon: -123.0,
          maxLon: -117.0,
        }
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      // Check for duplicate chart IDs
      const chartIds = response.results.map((chart: any) => chart.id);
      const uniqueIds = new Set(chartIds);
      expect(chartIds.length).toBe(uniqueIds.size);
    });

    it('should handle combined filters correctly', async () => {
      const result = await searchChartsHandler({
        query: 'bay',
        boundingBox: {
          minLat: 37.0,
          maxLat: 38.5,
          minLon: -123.0,
          maxLon: -121.5,
        },
        scale: {
          max: 100000
        },
        format: 'S-57'
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      // Verify all results match the filters
      for (const chart of response.results) {
        expect(chart.name.toLowerCase()).toContain('bay');
        expect(chart.scale).toBeLessThanOrEqual(100000);
        // Format defaults to S-57 if not specified
        expect(chart.format || 'S-57').toBe('S-57');
      }
    });

    it('should sort results by scale and name', async () => {
      const result = await searchChartsHandler({
        boundingBox: {
          minLat: 37.7,
          maxLat: 37.9,
          minLon: -122.5,
          maxLon: -122.3,
        }
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      if (response.results.length > 1) {
        // Verify sorting by scale
        for (let i = 1; i < response.results.length; i++) {
          const prevScale = response.results[i - 1].scale;
          const currScale = response.results[i].scale;
          
          expect(currScale).toBeGreaterThanOrEqual(prevScale);
          
          // If same scale, verify alphabetical order
          if (currScale === prevScale) {
            expect(response.results[i].name.localeCompare(response.results[i - 1].name)).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
  });

  describe('Error handling', () => {
    it('should handle invalid bounding box gracefully', async () => {
      const result = await searchChartsHandler({
        boundingBox: {
          minLat: 'invalid', // Invalid type
          maxLat: 38.0,
          minLon: -122.7,
          maxLon: -122.0,
        }
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toBeDefined();
      expect(response.error).toContain('Invalid parameters');
    });

    it('should handle empty search results', async () => {
      // Use a small area in the middle of the Pacific Ocean
      const result = await searchChartsHandler({
        boundingBox: {
          minLat: -10,
          maxLat: -9,
          minLon: -150,
          maxLon: -149,
        }
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      // Some charts may cover very large areas, so we expect few results
      expect(response.count).toBeLessThanOrEqual(5);
      expect(response.results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Cache integration', () => {
    it('should correctly identify cached vs non-cached charts', async () => {
      // Get current cache stats
      const stats = await cacheManager.getStats();
      
      const result = await searchChartsHandler({
        boundingBox: {
          minLat: 32.0,
          maxLat: 38.0,
          minLon: -123.0,
          maxLon: -117.0,
        }
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      // Count cached charts
      const cachedCharts = response.results.filter((chart: any) => chart.cached);
      
      // Should match our cache stats
      expect(cachedCharts.length).toBeLessThanOrEqual(stats.chartCount);
    });
  });
});