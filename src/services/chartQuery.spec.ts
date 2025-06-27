import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ChartQueryService } from './chartQuery.js';
import { XMLCatalogService } from './xmlCatalog.js';
import { ChartMetadata } from '../types/enc.js';

jest.mock('./xmlCatalog.js');

describe('ChartQueryService', () => {
  let service: ChartQueryService;
  let mockCatalogService: jest.Mocked<XMLCatalogService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalogService = new XMLCatalogService() as jest.Mocked<XMLCatalogService>;
    service = new ChartQueryService(mockCatalogService);
  });

  describe('queryByCoordinates', () => {
    it('should query charts by coordinates', async () => {
      const mockCatalogCharts = [{
        name: 'US5CA52M',
        longName: 'San Francisco Bay',
        scale: 40000,
        edition: '25',
        updateDate: '20240115',
        coverage: {
          minLat: 37.7,
          maxLat: 37.8,
          minLon: -122.5,
          maxLon: -122.4,
          vertices: []
        },
        status: 'Active',
        updateNumber: '10',
        issueDate: '20230101',
        zipfileLocation: 'https://example.com/chart.zip',
        zipfileSize: 1048576
      }];

      const expectedMetadata: ChartMetadata = {
        id: 'US5CA52M',
        name: 'San Francisco Bay',
        scale: 40000,
        edition: '25',
        lastUpdate: '20240115',
        bounds: {
          minLat: 37.7,
          maxLat: 37.8,
          minLon: -122.5,
          maxLon: -122.4
        },
        downloadUrl: 'https://example.com/chart.zip',
        fileSize: 1048576,
        status: 'Active'
      };

      mockCatalogService.findChartsByCoordinates.mockResolvedValue(mockCatalogCharts);
      mockCatalogService.convertToChartMetadata.mockReturnValue(expectedMetadata);

      const results = await service.queryByCoordinates(37.75, -122.45);
      
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('US5CA52M');
      expect(mockCatalogService.findChartsByCoordinates).toHaveBeenCalledWith(37.75, -122.45);
    });

    it('should handle empty results', async () => {
      mockCatalogService.findChartsByCoordinates.mockResolvedValue([]);

      const results = await service.queryByCoordinates(0, 0);
      expect(results).toHaveLength(0);
    });

    it('should handle API errors', async () => {
      mockCatalogService.findChartsByCoordinates.mockRejectedValue(new Error('Network error'));
      
      await expect(service.queryByCoordinates(37.75, -122.45))
        .rejects.toThrow('Failed to query charts by coordinates');
    });
  });

  describe('queryByBoundingBox', () => {
    it('should query by bounding box', async () => {
      const mockCatalogCharts = [{
        name: 'US5CA52M',
        longName: 'San Francisco Bay',
        scale: 40000
      }, {
        name: 'US5CA53M',
        longName: 'San Francisco Harbor',
        scale: 20000
      }];

      const mockMetadata = [
        { id: 'US5CA52M', name: 'San Francisco Bay', scale: 40000 },
        { id: 'US5CA53M', name: 'San Francisco Harbor', scale: 20000 }
      ];

      mockCatalogService.findChartsByBounds.mockResolvedValue(mockCatalogCharts as any);
      mockCatalogService.convertToChartMetadata
        .mockReturnValueOnce(mockMetadata[0] as any)
        .mockReturnValueOnce(mockMetadata[1] as any);

      const results = await service.queryByBoundingBox(37.7, 37.8, -122.5, -122.4);

      expect(results).toHaveLength(2);
      expect(mockCatalogService.findChartsByBounds).toHaveBeenCalledWith({
        minLat: 37.7,
        maxLat: 37.8,
        minLon: -122.5,
        maxLon: -122.4
      });
    });

    it('should handle malformed response', async () => {
      mockCatalogService.findChartsByBounds.mockResolvedValue([]);

      const results = await service.queryByBoundingBox(37.7, 37.8, -122.5, -122.4);
      
      expect(results).toHaveLength(0);
    });
  });

  describe('queryByChartId', () => {
    it('should query by chart ID', async () => {
      const mockCatalogChart = {
        name: 'US5CA52M',
        longName: 'San Francisco Bay',
        scale: 40000,
        edition: '25',
        updateDate: '2024-01-15'
      };

      const expectedMetadata = {
        id: 'US5CA52M',
        name: 'San Francisco Bay',
        scale: 40000,
        edition: '25',
        lastUpdate: '2024-01-15'
      };

      mockCatalogService.findChartById.mockResolvedValue(mockCatalogChart as any);
      mockCatalogService.convertToChartMetadata.mockReturnValue(expectedMetadata as any);

      const result = await service.queryByChartId('US5CA52M');
      
      expect(result?.id).toBe('US5CA52M');
      expect(result?.name).toBe('San Francisco Bay');
    });

    it('should return null for non-existent chart', async () => {
      mockCatalogService.findChartById.mockResolvedValue(null);

      const result = await service.queryByChartId('UNKNOWN');
      expect(result).toBeNull();
    });

    it('should handle API errors', async () => {
      mockCatalogService.findChartById.mockRejectedValue(new Error('Not found'));
      
      await expect(service.queryByChartId('US5CA52M'))
        .rejects.toThrow('Failed to query chart by ID');
    });
  });

  describe('selectBestChart', () => {
    const charts: ChartMetadata[] = [
      { 
        id: 'US5CA52M', 
        name: 'Overview',
        scale: 80000, 
        bounds: { minLat: 37.0, maxLat: 38.5, minLon: -123.0, maxLon: -122.0 },
        lastUpdate: '2024-01-15',
        edition: '25'
      },
      { 
        id: 'US5CA53M', 
        name: 'Harbor',
        scale: 20000, 
        bounds: { minLat: 37.75, maxLat: 37.85, minLon: -122.5, maxLon: -122.4 },
        lastUpdate: '2024-01-15',
        edition: '20'
      },
      { 
        id: 'US5CA54M', 
        name: 'Approach',
        scale: 40000, 
        bounds: { minLat: 37.7, maxLat: 37.9, minLon: -122.6, maxLon: -122.3 },
        lastUpdate: '2024-01-15',
        edition: '22'
      }
    ];

    it('should select best scale chart containing point', () => {
      const mockCatalogCharts = charts.map(c => ({
        name: c.id,
        longName: c.name,
        scale: c.scale,
        status: 'Active',
        coverage: {
          minLat: c.bounds!.minLat,
          maxLat: c.bounds!.maxLat,
          minLon: c.bounds!.minLon,
          maxLon: c.bounds!.maxLon,
          vertices: []
        }
      }));

      mockCatalogService.selectBestChart.mockReturnValue(mockCatalogCharts[1] as any);
      
      const best = service.selectBestChart(charts, 37.8, -122.45);
      expect(best?.id).toBe('US5CA53M');
    });

    it('should return null if no chart contains point', () => {
      // selectBestChart in ChartQueryService delegates to catalogService
      mockCatalogService.selectBestChart.mockImplementation((charts, lat, lon) => {
        // Mock the logic - return null if point is outside all chart bounds
        const containingCharts = charts.filter((c: any) => {
          const bounds = c.coverage || c.bounds;
          if (!bounds) return false;
          return lat >= bounds.minLat && lat <= bounds.maxLat &&
                 lon >= bounds.minLon && lon <= bounds.maxLon;
        });
        return containingCharts.length > 0 ? containingCharts[0] : null;
      });
      
      const best = service.selectBestChart(charts, 40.0, -120.0);
      expect(best).toBeNull();
    });

    it('should handle empty chart list', () => {
      mockCatalogService.selectBestChart.mockReturnValue(null);
      
      const best = service.selectBestChart([], 37.8, -122.45);
      expect(best).toBeNull();
    });
  });

  describe('getCatalogStatus', () => {
    it('should get catalog status', async () => {
      const mockCatalog = [{
        name: 'US5CA52M',
        status: 'Active',
        updateDate: '2024-01-15'
      }];

      mockCatalogService.getCatalog.mockResolvedValue(mockCatalog as any);

      const status = await service.getCatalogStatus();
      
      expect(status.chartCount).toBe(1);
      expect(status.lastUpdated).toBeDefined();
      expect(status.cacheDir).toBeDefined();
    });

    it('should handle status check errors', async () => {
      mockCatalogService.getCatalog.mockRejectedValue(new Error('Service unavailable'));
      
      // getCatalogStatus doesn't wrap errors, it throws them directly
      await expect(service.getCatalogStatus())
        .rejects.toThrow('Service unavailable');
    });
  });
});