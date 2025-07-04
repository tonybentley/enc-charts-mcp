import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { getChartHandler } from './getChart.js';
import { ChartQueryService } from '../services/chartQuery.js';
import { ChartDownloadService, ChartFiles } from '../services/chartDownload.js';
import { CacheManager } from '../utils/cache.js';
import { s57Parser } from '../services/s57Parser.js';
import { ChartMetadata } from '../types/enc.js';

// Mock all dependencies
jest.mock('../services/chartQuery.js');
jest.mock('../services/chartDownload.js');
jest.mock('../utils/cache.js');
jest.mock('../services/s57Parser.js');

const mockChartQueryService = {
  queryByChartId: jest.fn() as jest.MockedFunction<any>,
  queryByCoordinates: jest.fn() as jest.MockedFunction<any>,
  selectBestChart: jest.fn() as jest.MockedFunction<any>,
};
const mockChartDownloadService = {
  downloadChart: jest.fn() as jest.MockedFunction<any>,
  getCachedChart: jest.fn() as jest.MockedFunction<any>,
};
const mockCacheManager = {
  initialize: jest.fn() as jest.MockedFunction<any>,
  isChartCached: jest.fn() as jest.MockedFunction<any>,
  addChart: jest.fn() as jest.MockedFunction<any>,
  getChartMetadata: jest.fn() as jest.MockedFunction<any>,
  needsUpdate: jest.fn() as jest.MockedFunction<any>,
};
const mockS57Parser = {
  parseChart: jest.fn() as jest.MockedFunction<any>,
};

(ChartQueryService as unknown as jest.Mock).mockImplementation(() => mockChartQueryService);
(ChartDownloadService as unknown as jest.Mock).mockImplementation(() => mockChartDownloadService);
(CacheManager as unknown as jest.Mock).mockImplementation(() => mockCacheManager);
(s57Parser as any).parseChart = mockS57Parser.parseChart;

describe('getChartHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    mockCacheManager.initialize.mockResolvedValue(undefined);
    mockCacheManager.isChartCached.mockResolvedValue(false);
    mockCacheManager.addChart.mockResolvedValue(undefined);
    mockCacheManager.needsUpdate.mockResolvedValue(false);
  });

  describe('chartId-based requests', () => {
    it('should download and parse chart successfully', async () => {
      const mockChartFiles: ChartFiles = {
        chartId: 'US5CA52M',
        basePath: '/cache/charts/US5CA52M',
        s57Files: ['US5CA52M.000'],
        catalogFile: 'CATALOG.031',
        textFiles: ['README.TXT'],
        allFiles: ['US5CA52M.000', 'CATALOG.031', 'README.TXT'],
      };

      const mockFeatures = [
        {
          type: 'Feature' as const,
          id: 'depare-1',
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[[-122.5, 37.7], [-122.4, 37.7], [-122.4, 37.8], [-122.5, 37.8], [-122.5, 37.7]]],
          },
          properties: {
            _featureType: 'DEPARE',
            DRVAL1: 0,
            DRVAL2: 10,
          },
        },
      ];

      mockChartDownloadService.downloadChart.mockResolvedValue(mockChartFiles);
      mockChartQueryService.queryByChartId.mockResolvedValue({
        id: 'US5CA52M',
        name: 'San Diego Bay',
        scale: 12000,
        edition: '25',
        lastUpdate: '2024-01-15',
        bounds: { minLat: 32.6, maxLat: 32.8, minLon: -117.3, maxLon: -117.1 }
      });
      mockS57Parser.parseChart.mockResolvedValue({
        type: 'FeatureCollection',
        features: mockFeatures,
      });

      const result = await getChartHandler({ chartId: 'US5CA52M' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.chartId).toBe('US5CA52M');
      expect(response.features).toHaveLength(1);
      expect(response.features[0].type).toBe('DEPARE');
      expect(response.source).toBe('NOAA ENC');
      expect(response.s57Files).toEqual(['US5CA52M.000']);
      
      // Should not include 'parsed' field anymore
      expect(response.parsed).toBeUndefined();
    });

    it('should return error when S-57 parsing fails', async () => {
      const mockChartFiles: ChartFiles = {
        chartId: 'US5CA52M',
        basePath: '/cache/charts/US5CA52M',
        s57Files: ['US5CA52M.000'],
        catalogFile: 'CATALOG.031',
        textFiles: ['README.TXT'],
        allFiles: ['US5CA52M.000', 'CATALOG.031', 'README.TXT'],
      };

      mockChartDownloadService.downloadChart.mockResolvedValue(mockChartFiles);
      mockS57Parser.parseChart.mockRejectedValue(new Error('Invalid S-57 format'));

      const result = await getChartHandler({ chartId: 'US5CA52M' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toBe('Failed to parse S-57 chart data');
      expect(response.details).toBe('Invalid S-57 format');
      expect(response.chartId).toBe('US5CA52M');
      expect(response.s57Files).toEqual(['US5CA52M.000']);
      expect(response.hint).toContain('chart was downloaded successfully but could not be parsed');
      
      // Should not return mock features
      expect(response.features).toBeUndefined();
    });

    it('should use cached chart when available', async () => {
      const mockChartFiles: ChartFiles = {
        chartId: 'US5CA52M',
        basePath: '/cache/charts/US5CA52M',
        s57Files: ['US5CA52M.000'],
        catalogFile: 'CATALOG.031',
        textFiles: ['README.TXT'],
        allFiles: ['US5CA52M.000', 'CATALOG.031', 'README.TXT'],
      };

      mockCacheManager.isChartCached.mockResolvedValue(true);
      mockChartDownloadService.getCachedChart.mockResolvedValue(mockChartFiles);
      mockS57Parser.parseChart.mockResolvedValue({
        type: 'FeatureCollection',
        features: [],
      });

      await getChartHandler({ chartId: 'US5CA52M' });

      expect(mockChartDownloadService.downloadChart).not.toHaveBeenCalled();
      expect(mockChartDownloadService.getCachedChart).toHaveBeenCalledWith('US5CA52M');
    });
  });

  describe('coordinate-based requests', () => {
    it('should query and download best chart for coordinates', async () => {
      const mockCharts: ChartMetadata[] = [
        { id: 'US5CA52M', name: 'San Diego Bay', scale: 12000, edition: '25', lastUpdate: '2024-01-15' },
        { id: 'US5CA53M', name: 'San Diego Harbor', scale: 5000, edition: '20', lastUpdate: '2024-01-10' },
      ];

      const mockChartFiles: ChartFiles = {
        chartId: 'US5CA53M',
        basePath: '/cache/charts/US5CA53M',
        s57Files: ['US5CA53M.000'],
        catalogFile: 'CATALOG.031',
        textFiles: ['README.TXT'],
        allFiles: ['US5CA53M.000', 'CATALOG.031', 'README.TXT'],
      };

      mockChartQueryService.queryByCoordinates.mockResolvedValue(mockCharts);
      mockChartQueryService.selectBestChart.mockReturnValue(mockCharts[1]);
      mockChartDownloadService.downloadChart.mockResolvedValue(mockChartFiles);
      mockS57Parser.parseChart.mockResolvedValue({
        type: 'FeatureCollection',
        features: [],
      });

      const result = await getChartHandler({
        coordinates: { lat: 32.7157, lon: -117.1611 },
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.chartId).toBe('US5CA53M');
      expect(mockChartQueryService.queryByCoordinates).toHaveBeenCalledWith(32.7157, -117.1611);
      expect(mockChartQueryService.selectBestChart).toHaveBeenCalledWith(mockCharts, 32.7157, -117.1611);
    });

    it('should return error when no charts found for coordinates', async () => {
      mockChartQueryService.queryByCoordinates.mockResolvedValue([]);

      const result = await getChartHandler({
        coordinates: { lat: 0, lon: 0 },
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toBe('No charts found for the specified coordinates');
      expect(response.coordinates).toEqual({ lat: 0, lon: 0 });
    });
  });

  describe('feature filtering', () => {
    it('should apply feature type filter', async () => {
      const mockChartFiles: ChartFiles = {
        chartId: 'US5CA52M',
        basePath: '/cache/charts/US5CA52M',
        s57Files: ['US5CA52M.000'],
        catalogFile: 'CATALOG.031',
        textFiles: ['README.TXT'],
        allFiles: ['US5CA52M.000', 'CATALOG.031', 'README.TXT'],
      };

      mockChartDownloadService.downloadChart.mockResolvedValue(mockChartFiles);
      mockS57Parser.parseChart.mockResolvedValue({
        type: 'FeatureCollection',
        features: [],
      });

      await getChartHandler({
        chartId: 'US5CA52M',
        featureTypes: ['DEPARE', 'LIGHTS'],
      });

      expect(mockS57Parser.parseChart).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          featureTypes: ['DEPARE', 'LIGHTS'],
        })
      );
    });

    it('should apply bounding box filter', async () => {
      const mockChartFiles: ChartFiles = {
        chartId: 'US5CA52M',
        basePath: '/cache/charts/US5CA52M',
        s57Files: ['US5CA52M.000'],
        catalogFile: 'CATALOG.031',
        textFiles: ['README.TXT'],
        allFiles: ['US5CA52M.000', 'CATALOG.031', 'README.TXT'],
      };

      const boundingBox = {
        minLat: 32.6,
        maxLat: 32.8,
        minLon: -117.3,
        maxLon: -117.1,
      };

      mockChartDownloadService.downloadChart.mockResolvedValue(mockChartFiles);
      mockS57Parser.parseChart.mockResolvedValue({
        type: 'FeatureCollection',
        features: [],
      });

      await getChartHandler({
        chartId: 'US5CA52M',
        boundingBox,
      });

      expect(mockS57Parser.parseChart).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ boundingBox })
      );
    });

    it('should apply depth range filter', async () => {
      const mockChartFiles: ChartFiles = {
        chartId: 'US5CA52M',
        basePath: '/cache/charts/US5CA52M',
        s57Files: ['US5CA52M.000'],
        catalogFile: 'CATALOG.031',
        textFiles: ['README.TXT'],
        allFiles: ['US5CA52M.000', 'CATALOG.031', 'README.TXT'],
      };

      const depthRange = { min: 5, max: 20 };

      mockChartDownloadService.downloadChart.mockResolvedValue(mockChartFiles);
      mockS57Parser.parseChart.mockResolvedValue({
        type: 'FeatureCollection',
        features: [],
      });

      await getChartHandler({
        chartId: 'US5CA52M',
        depthRange,
      });

      expect(mockS57Parser.parseChart).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ depthRange })
      );
    });

    describe('pagination', () => {
      it('should apply default pagination (limit=100, offset=0)', async () => {
        const mockChartFiles: ChartFiles = {
          chartId: 'US5CA52M',
          basePath: '/cache/charts/US5CA52M',
          s57Files: ['US5CA52M.000'],
          catalogFile: 'CATALOG.031',
          textFiles: ['README.TXT'],
          allFiles: ['US5CA52M.000', 'CATALOG.031', 'README.TXT'],
        };

        // Create 150 mock features
        const mockFeatures = Array.from({ length: 150 }, (_, i) => ({
          type: 'Feature' as const,
          id: `feature-${i}`,
          geometry: { type: 'Point' as const, coordinates: [-122.5 + i * 0.001, 37.7] },
          properties: { _featureType: 'LIGHTS', OBJNAM: `Light ${i}` },
        }));

        mockChartDownloadService.downloadChart.mockResolvedValue(mockChartFiles);
        mockS57Parser.parseChart.mockResolvedValue({
          type: 'FeatureCollection',
          features: mockFeatures,
        });

        const result = await getChartHandler({ chartId: 'US5CA52M' });
        const response = JSON.parse(result.content[0].text);

        expect(response.featureCount).toBe(100); // Default limit
        expect(response.totalFeatures).toBe(150);
        expect(response.hasMore).toBe(true);
        expect(response.limit).toBe(100);
        expect(response.offset).toBe(0);
        expect(response.features).toHaveLength(100);
        expect(response.features[0].id).toBe('feature-0');
        expect(response.features[99].id).toBe('feature-99');
      });

      it('should apply custom pagination parameters', async () => {
        const mockChartFiles: ChartFiles = {
          chartId: 'US5CA52M',
          basePath: '/cache/charts/US5CA52M',
          s57Files: ['US5CA52M.000'],
          catalogFile: 'CATALOG.031',
          textFiles: ['README.TXT'],
          allFiles: ['US5CA52M.000', 'CATALOG.031', 'README.TXT'],
        };

        // Create 150 mock features
        const mockFeatures = Array.from({ length: 150 }, (_, i) => ({
          type: 'Feature' as const,
          id: `feature-${i}`,
          geometry: { type: 'Point' as const, coordinates: [-122.5 + i * 0.001, 37.7] },
          properties: { _featureType: 'LIGHTS', OBJNAM: `Light ${i}` },
        }));

        mockChartDownloadService.downloadChart.mockResolvedValue(mockChartFiles);
        mockS57Parser.parseChart.mockResolvedValue({
          type: 'FeatureCollection',
          features: mockFeatures,
        });

        const result = await getChartHandler({ 
          chartId: 'US5CA52M',
          limit: 50,
          offset: 100 
        });
        const response = JSON.parse(result.content[0].text);

        expect(response.featureCount).toBe(50);
        expect(response.totalFeatures).toBe(150);
        expect(response.hasMore).toBe(false); // No more features after 150
        expect(response.limit).toBe(50);
        expect(response.offset).toBe(100);
        expect(response.features).toHaveLength(50);
        expect(response.features[0].id).toBe('feature-100');
        expect(response.features[49].id).toBe('feature-149');
      });

      it('should handle offset beyond total features', async () => {
        const mockChartFiles: ChartFiles = {
          chartId: 'US5CA52M',
          basePath: '/cache/charts/US5CA52M',
          s57Files: ['US5CA52M.000'],
          catalogFile: 'CATALOG.031',
          textFiles: ['README.TXT'],
          allFiles: ['US5CA52M.000', 'CATALOG.031', 'README.TXT'],
        };

        const mockFeatures = Array.from({ length: 50 }, (_, i) => ({
          type: 'Feature' as const,
          id: `feature-${i}`,
          geometry: { type: 'Point' as const, coordinates: [-122.5, 37.7] },
          properties: { _featureType: 'LIGHTS' },
        }));

        mockChartDownloadService.downloadChart.mockResolvedValue(mockChartFiles);
        mockS57Parser.parseChart.mockResolvedValue({
          type: 'FeatureCollection',
          features: mockFeatures,
        });

        const result = await getChartHandler({ 
          chartId: 'US5CA52M',
          limit: 100,
          offset: 100 
        });
        const response = JSON.parse(result.content[0].text);

        expect(response.featureCount).toBe(0);
        expect(response.totalFeatures).toBe(50);
        expect(response.hasMore).toBe(false);
        expect(response.features).toHaveLength(0);
      });

      it('should respect maximum limit of 1000', async () => {
        const mockChartFiles: ChartFiles = {
          chartId: 'US5CA52M',
          basePath: '/cache/charts/US5CA52M',
          s57Files: ['US5CA52M.000'],
          catalogFile: 'CATALOG.031',
          textFiles: ['README.TXT'],
          allFiles: ['US5CA52M.000', 'CATALOG.031', 'README.TXT'],
        };

        const mockFeatures = Array.from({ length: 2000 }, (_, i) => ({
          type: 'Feature' as const,
          id: `feature-${i}`,
          geometry: { type: 'Point' as const, coordinates: [-122.5, 37.7] },
          properties: { _featureType: 'SOUNDG' },
        }));

        mockChartDownloadService.downloadChart.mockResolvedValue(mockChartFiles);
        mockS57Parser.parseChart.mockResolvedValue({
          type: 'FeatureCollection',
          features: mockFeatures,
        });

        const result = await getChartHandler({ 
          chartId: 'US5CA52M',
          limit: 1000 // At max limit
        });
        const response = JSON.parse(result.content[0].text);

        expect(response.featureCount).toBe(1000); // Returns max allowed
        expect(response.totalFeatures).toBe(2000);
        expect(response.hasMore).toBe(true);
        expect(response.limit).toBe(1000);
      });

      it('should handle limit values at maximum', async () => {
        const mockChartFiles: ChartFiles = {
          chartId: 'US5CA52M',
          basePath: '/cache/charts/US5CA52M',
          s57Files: ['US5CA52M.000'],
          catalogFile: 'CATALOG.031',
          textFiles: ['README.TXT'],
          allFiles: ['US5CA52M.000', 'CATALOG.031', 'README.TXT'],
        };

        const mockFeatures = Array.from({ length: 1200 }, (_, i) => ({
          type: 'Feature' as const,
          id: `feature-${i}`,
          geometry: { type: 'Point' as const, coordinates: [-122.5, 37.7] },
          properties: { _featureType: 'SOUNDG' },
        }));

        mockChartDownloadService.downloadChart.mockResolvedValue(mockChartFiles);
        mockS57Parser.parseChart.mockResolvedValue({
          type: 'FeatureCollection',
          features: mockFeatures,
        });
        mockChartQueryService.queryByChartId.mockResolvedValue({
          id: 'US5CA52M',
          name: 'Test Chart',
          scale: 40000
        });

        const result = await getChartHandler({ 
          chartId: 'US5CA52M',
          limit: 1000 // At max limit
        });
        const response = JSON.parse(result.content[0].text);

        expect(response.featureCount).toBe(1000);
        expect(response.totalFeatures).toBe(1200);
        expect(response.hasMore).toBe(true);
      });
    });
  });

  describe('error handling', () => {
    it('should handle download errors', async () => {
      mockChartDownloadService.downloadChart.mockRejectedValue(
        new Error('Network error')
      );

      const result = await getChartHandler({ chartId: 'US5CA52M' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toBe('Network error');
      expect(response.params).toEqual({ chartId: 'US5CA52M' });
    });

    it('should handle invalid parameters', async () => {
      const result = await getChartHandler({ invalid: 'param' });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toContain('Invalid input');
    });
  });

  describe('edge cases - uncovered lines', () => {
    it('should handle chart metadata not found (line 117)', async () => {
      mockCacheManager.isChartCached.mockResolvedValue(false);
      mockCacheManager.getChartMetadata.mockResolvedValue(null);
      mockChartQueryService.queryByChartId.mockResolvedValue(null);
      mockChartDownloadService.downloadChart.mockRejectedValue(new Error('Chart metadata not found'));

      const result = await getChartHandler({ chartId: 'UNKNOWN123' });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toContain('Chart metadata not found');
    });

    it('should skip download when chart is already cached (line 132)', async () => {
      mockCacheManager.isChartCached.mockResolvedValue(true);
      mockChartDownloadService.getCachedChart.mockResolvedValue({
        chartId: 'US5CA52M',
        basePath: '/cache/charts/US5CA52M',
        s57Files: ['US5CA52M.000'],
        catalogFile: 'CATALOG.031',
        textFiles: ['README.TXT'],
        allFiles: ['US5CA52M.000']
      });
      mockS57Parser.parseChart.mockResolvedValue({
        type: 'FeatureCollection',
        features: []
      });
      mockChartQueryService.queryByChartId.mockResolvedValue({
        id: 'US5CA52M',
        name: 'Test Chart',
        scale: 40000
      });

      await getChartHandler({ chartId: 'US5CA52M' });

      expect(mockChartDownloadService.downloadChart).not.toHaveBeenCalled();
      expect(mockChartDownloadService.getCachedChart).toHaveBeenCalled();
    });

    it('should use cached chart for coordinates (line 155)', async () => {
      const mockCharts = [{ 
        id: 'US5CA52M', 
        name: 'Test Chart',
        scale: 40000,
        lastUpdate: '2024-01-15',
        edition: '25'
      }];
      
      mockChartQueryService.queryByCoordinates.mockResolvedValue(mockCharts);
      mockChartQueryService.selectBestChart.mockReturnValue(mockCharts[0]);
      mockCacheManager.isChartCached.mockResolvedValue(true);
      mockCacheManager.needsUpdate.mockResolvedValue(false);
      mockChartDownloadService.getCachedChart.mockResolvedValue({
        chartId: 'US5CA52M',
        basePath: '/cache/charts/US5CA52M',
        s57Files: ['US5CA52M.000'],
        catalogFile: 'CATALOG.031',
        textFiles: ['README.TXT'],
        allFiles: ['US5CA52M.000']
      });
      mockS57Parser.parseChart.mockResolvedValue({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          id: 'test-1',
          geometry: { type: 'Point', coordinates: [-122.45, 37.8] },
          properties: { _featureType: 'LIGHTS' }
        }]
      });

      const result = await getChartHandler({ 
        coordinates: { lat: 37.8, lon: -122.45 } 
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.chartId).toBe('US5CA52M');
      expect(mockChartDownloadService.downloadChart).not.toHaveBeenCalled();
      expect(mockChartDownloadService.getCachedChart).toHaveBeenCalledWith('US5CA52M');
    });

    it('should handle no S-57 files available (line 191)', async () => {
      mockChartDownloadService.downloadChart.mockResolvedValue({
        chartId: 'US5CA52M',
        basePath: '/cache/charts/US5CA52M',
        s57Files: [], // No S-57 files
        textFiles: ['README.txt'],
        allFiles: ['README.txt']
      });
      mockChartQueryService.queryByChartId.mockResolvedValue({
        id: 'US5CA52M',
        name: 'Test Chart',
        scale: 40000
      });

      const result = await getChartHandler({ chartId: 'US5CA52M' });
      const response = JSON.parse(result.content[0].text);

      expect(response.features).toEqual([]);
      expect(response.s57Files).toEqual([]);
      expect(response.chartId).toBe('US5CA52M');
    });
  });
});