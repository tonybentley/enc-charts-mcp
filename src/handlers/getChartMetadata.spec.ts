import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { getChartMetadataHandler } from './getChartMetadata.js';
import { chartQueryService } from '../services/chartQuery.js';
import { chartDownloadService, ChartFiles } from '../services/chartDownload.js';
import { cacheManager } from '../utils/cache.js';
import { s57Parser } from '../services/s57Parser.js';
import { ChartMetadata } from '../types/enc.js';

// Mock all dependencies
jest.mock('../services/chartQuery.js');
jest.mock('../services/chartDownload.js');
jest.mock('../utils/cache.js');
jest.mock('../services/s57Parser.js');

const mockChartQueryService = chartQueryService as jest.Mocked<typeof chartQueryService>;
const mockChartDownloadService = chartDownloadService as jest.Mocked<typeof chartDownloadService>;
const mockCacheManager = cacheManager as jest.Mocked<typeof cacheManager>;
const mockS57Parser = s57Parser as jest.Mocked<typeof s57Parser>;

describe('getChartMetadataHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    mockCacheManager.initialize.mockResolvedValue(undefined);
    mockCacheManager.isChartCached.mockResolvedValue(false);
    mockCacheManager.getChartMetadata.mockResolvedValue(null);
    mockCacheManager.addChart.mockResolvedValue(undefined);
  });

  describe('chartId-based requests', () => {
    it('should retrieve metadata by chart ID from catalog', async () => {
      const mockMetadata: ChartMetadata = {
        id: 'US5CA52M',
        name: 'San Diego Bay',
        scale: 12000,
        edition: '25',
        lastUpdate: '2024-01-15',
        bounds: { minLat: 32.6, maxLat: 32.8, minLon: -117.3, maxLon: -117.1 },
        producer: 'NOAA',
      };

      mockChartQueryService.queryByChartId.mockResolvedValue(mockMetadata);

      const result = await getChartMetadataHandler({ chartId: 'US5CA52M' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.id).toBe('US5CA52M');
      expect(response.name).toBe('San Diego Bay');
      expect(response.scale).toBe(12000);
      expect(response.cached).toBe(false);
      expect(response.source).toBe('NOAA ENC Catalog');
      expect(response.downloadUrl).toBe('https://www.charts.noaa.gov/ENCs/US5CA52M/US5CA52M.zip');
    });

    it('should retrieve metadata from cache when available', async () => {
      const mockMetadata: ChartMetadata = {
        id: 'US5CA52M',
        name: 'San Diego Bay (Cached)',
        scale: 12000,
        edition: '25',
        lastUpdate: '2024-01-15',
        bounds: { minLat: 32.6, maxLat: 32.8, minLon: -117.3, maxLon: -117.1 },
      };

      mockCacheManager.getChartMetadata.mockResolvedValue(mockMetadata);

      const result = await getChartMetadataHandler({ chartId: 'US5CA52M' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.name).toBe('San Diego Bay (Cached)');
      expect(response.cached).toBe(true);
      expect(mockChartQueryService.queryByChartId).not.toHaveBeenCalled();
    });

    it('should include S-57 metadata when chart is cached', async () => {
      const mockMetadata: ChartMetadata = {
        id: 'US5CA52M',
        name: 'San Diego Bay',
        scale: 12000,
        edition: '25',
        lastUpdate: '2024-01-15',
        bounds: { minLat: 32.6, maxLat: 32.8, minLon: -117.3, maxLon: -117.1 },
      };

      const mockChartFiles: ChartFiles = {
        chartId: 'US5CA52M',
        basePath: '/cache/charts/US5CA52M',
        s57Files: ['US5CA52M.000'],
        catalogFile: 'CATALOG.031',
        textFiles: ['README.TXT'],
        allFiles: ['US5CA52M.000', 'CATALOG.031', 'README.TXT'],
      };

      const mockS57Metadata = {
        name: 'US5CA52M',
        scale: 12000,
        issueDate: '2024-01-15',
        updateDate: '2024-07-17',
        bounds: { minLat: 32.6, maxLat: 32.8, minLon: -117.3, maxLon: -117.1 },
      };

      mockChartQueryService.queryByChartId.mockResolvedValue(mockMetadata);
      mockCacheManager.isChartCached.mockResolvedValue(true);
      mockChartDownloadService.getCachedChart.mockResolvedValue(mockChartFiles);
      mockS57Parser.getChartMetadata.mockResolvedValue(mockS57Metadata);

      const result = await getChartMetadataHandler({ chartId: 'US5CA52M' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.s57Metadata).toEqual(mockS57Metadata);
      expect(mockS57Parser.getChartMetadata).toHaveBeenCalledWith(
        '/cache/charts/US5CA52M/US5CA52M.000'
      );
    });

    it('should return error when chart not found', async () => {
      mockChartQueryService.queryByChartId.mockResolvedValue(null);

      const result = await getChartMetadataHandler({ chartId: 'INVALID_CHART' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toBe('Chart not found');
      expect(response.chartId).toBe('INVALID_CHART');
    });
  });

  describe('coordinate-based requests', () => {
    it('should retrieve metadata for best chart at coordinates', async () => {
      const mockCharts: ChartMetadata[] = [
        {
          id: 'US5CA52M',
          name: 'San Diego Bay',
          scale: 12000,
          edition: '25',
          lastUpdate: '2024-01-15',
          bounds: { minLat: 32.6, maxLat: 32.8, minLon: -117.3, maxLon: -117.1 },
        },
        {
          id: 'US5CA53M',
          name: 'San Diego Harbor',
          scale: 5000,
          edition: '20',
          lastUpdate: '2024-01-10',
          bounds: { minLat: 32.65, maxLat: 32.75, minLon: -117.25, maxLon: -117.15 },
        },
      ];

      mockChartQueryService.queryByCoordinates.mockResolvedValue(mockCharts);
      mockChartQueryService.selectBestChart.mockReturnValue(mockCharts[1]);

      const result = await getChartMetadataHandler({
        coordinates: { lat: 32.7157, lon: -117.1611 },
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.id).toBe('US5CA53M');
      expect(response.name).toBe('San Diego Harbor');
      expect(response.scale).toBe(5000);
      expect(mockChartQueryService.queryByCoordinates).toHaveBeenCalledWith(32.7157, -117.1611);
      expect(mockChartQueryService.selectBestChart).toHaveBeenCalledWith(
        mockCharts,
        32.7157,
        -117.1611
      );
    });

    it('should return error when no charts found for coordinates', async () => {
      mockChartQueryService.queryByCoordinates.mockResolvedValue([]);

      const result = await getChartMetadataHandler({
        coordinates: { lat: 0, lon: 0 },
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toBe('No charts found for the specified coordinates');
      expect(response.coordinates).toEqual({ lat: 0, lon: 0 });
    });

    it('should handle when selectBestChart returns null', async () => {
      const mockCharts: ChartMetadata[] = [
        {
          id: 'US5CA52M',
          name: 'San Diego Bay',
          scale: 12000,
          edition: '25',
          lastUpdate: '2024-01-15',
        },
      ];

      mockChartQueryService.queryByCoordinates.mockResolvedValue(mockCharts);
      mockChartQueryService.selectBestChart.mockReturnValue(null);

      const result = await getChartMetadataHandler({
        coordinates: { lat: 32.7157, lon: -117.1611 },
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toBe('Chart not found');
    });
  });

  describe('error handling', () => {
    it('should handle invalid parameters', async () => {
      const result = await getChartMetadataHandler({ invalid: 'param' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toContain('Invalid input');
    });

    it('should handle chart query service errors', async () => {
      mockChartQueryService.queryByChartId.mockRejectedValue(new Error('Network error'));

      const result = await getChartMetadataHandler({ chartId: 'US5CA52M' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toBe('Network error');
      expect(response.params).toEqual({ chartId: 'US5CA52M' });
    });

    it('should handle S-57 metadata extraction errors gracefully', async () => {
      const mockMetadata: ChartMetadata = {
        id: 'US5CA52M',
        name: 'San Diego Bay',
        scale: 12000,
        edition: '25',
        lastUpdate: '2024-01-15',
      };

      const mockChartFiles: ChartFiles = {
        chartId: 'US5CA52M',
        basePath: '/cache/charts/US5CA52M',
        s57Files: ['US5CA52M.000'],
        catalogFile: 'CATALOG.031',
        textFiles: ['README.TXT'],
        allFiles: ['US5CA52M.000', 'CATALOG.031', 'README.TXT'],
      };

      mockChartQueryService.queryByChartId.mockResolvedValue(mockMetadata);
      mockCacheManager.isChartCached.mockResolvedValue(true);
      mockChartDownloadService.getCachedChart.mockResolvedValue(mockChartFiles);
      mockS57Parser.getChartMetadata.mockRejectedValue(new Error('S-57 parse error'));

      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

      const result = await getChartMetadataHandler({ chartId: 'US5CA52M' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      // Should still return metadata even if S-57 parsing fails
      expect(response.id).toBe('US5CA52M');
      expect(response.s57Metadata).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Could not extract S-57 metadata:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('cache interaction', () => {
    it('should add chart metadata to cache when retrieved from catalog', async () => {
      const mockMetadata: ChartMetadata = {
        id: 'US5CA52M',
        name: 'San Diego Bay',
        scale: 12000,
        edition: '25',
        lastUpdate: '2024-01-15',
      };

      mockChartQueryService.queryByChartId.mockResolvedValue(mockMetadata);

      await getChartMetadataHandler({ chartId: 'US5CA52M' });

      expect(mockCacheManager.addChart).toHaveBeenCalledWith('US5CA52M', mockMetadata);
    });

    it('should not query catalog when metadata is in cache', async () => {
      const mockMetadata: ChartMetadata = {
        id: 'US5CA52M',
        name: 'San Diego Bay (Cached)',
        scale: 12000,
        edition: '25',
        lastUpdate: '2024-01-15',
      };

      mockCacheManager.getChartMetadata.mockResolvedValue(mockMetadata);

      await getChartMetadataHandler({ chartId: 'US5CA52M' });

      expect(mockChartQueryService.queryByChartId).not.toHaveBeenCalled();
    });
  });
});