import { ChartFetcher } from './ChartFetcher.js';
import { ChartDownloadService } from './chartDownload.js';
import { ChartRepository } from '../database/repositories/ChartRepository.js';
import { NavigationFeatureRepository } from '../database/repositories/NavigationFeatureRepository.js';
import { ChartQueryService } from './chartQuery.js';
import { XMLCatalogService } from './xmlCatalog.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import type { ChartRecord } from '../database/schemas.js';
import { promises as fs } from 'fs';

// Mock the services
jest.mock('./chartDownload.js');
jest.mock('./chartQuery.js');
jest.mock('./xmlCatalog.js');
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    readdir: jest.fn(),
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    rmdir: jest.fn()
  }
}));

describe('ChartFetcher', () => {
  let dbManager: DatabaseManager;
  let chartRepository: ChartRepository;
  let featureRepository: NavigationFeatureRepository;
  let chartQueryService: ChartQueryService;
  let chartFetcher: ChartFetcher;
  let mockDownloadService: jest.Mocked<ChartDownloadService>;

  beforeEach(() => {
    // Initialize database
    dbManager = new DatabaseManager({ memory: true });
    dbManager.initialize();
    chartRepository = new ChartRepository(dbManager);
    featureRepository = new NavigationFeatureRepository(dbManager);
    
    // Create mocked services
    const mockCatalogService = new XMLCatalogService();
    chartQueryService = new ChartQueryService(mockCatalogService);
    
    // Create ChartFetcher with mocked dependencies
    chartFetcher = new ChartFetcher(
      chartRepository,
      featureRepository,
      chartQueryService,
      '/test/cache'
    );
    
    // Get reference to mocked download service
    mockDownloadService = (chartFetcher as any).downloadService as jest.Mocked<ChartDownloadService>;
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (dbManager.isOpen()) {
      dbManager.close();
    }
  });

  const createTestChart = (chartId: string): ChartRecord => ({
    chart_id: chartId,
    chart_name: `Test Chart ${chartId}`,
    scale: 50000,
    file_path: `/test/cache/${chartId}`,
    file_size: 1024000,
    bbox_minlon: -122.5,
    bbox_minlat: 37.7,
    bbox_maxlon: -122.3,
    bbox_maxlat: 37.9
  });

  describe('fetchChart', () => {
    it('should return chart from database if available', async () => {
      // Insert chart into database
      const testChart = createTestChart('US5CA12M');
      await chartRepository.insert(testChart);
      
      // Mock file system to indicate files exist
      (fs.stat as jest.Mock).mockImplementation((path) => {
        if (path === '/test/cache/US5CA12M') {
          return Promise.resolve({ isDirectory: () => true, isFile: () => false });
        }
        return Promise.resolve({ isDirectory: () => false, isFile: () => true, size: 100000 });
      });
      (fs.readdir as jest.Mock).mockResolvedValue(['US5CA12M.000', 'README.txt']);
      
      // Fetch chart
      const result = await chartFetcher.fetchChart('US5CA12M');
      
      // Should return from database without downloading
      expect(result.fromDatabase).toBe(true);
      expect(result.chartId).toBe('US5CA12M');
      expect(result.basePath).toBe('/test/cache/US5CA12M');
      expect(mockDownloadService.downloadChart).not.toHaveBeenCalled();
      
      // Should update last accessed time
      const updatedChart = await chartRepository.getById('US5CA12M');
      expect(updatedChart?.last_accessed).toBeGreaterThan(testChart.last_accessed || 0);
    });

    it('should download chart if not in database', async () => {
      // Mock download service response
      const mockChartFiles = {
        chartId: 'US5CA13M',
        basePath: '/test/cache/US5CA13M',
        s57Files: ['/test/cache/US5CA13M/US5CA13M.000'],
        textFiles: ['/test/cache/US5CA13M/README.txt'],
        allFiles: ['/test/cache/US5CA13M/US5CA13M.000', '/test/cache/US5CA13M/README.txt']
      };
      mockDownloadService.downloadChart.mockResolvedValue(mockChartFiles);
      
      // Mock chart query service
      const mockMetadata = {
        id: 'US5CA13M',
        name: 'Oakland Harbor',
        scale: 25000,
        bounds: { minLon: -122.4, maxLon: -122.2, minLat: 37.7, maxLat: 37.9 }
      };
      jest.spyOn(chartQueryService, 'queryByChartId').mockResolvedValue(mockMetadata as any);
      
      // Mock file stats
      (fs.stat as jest.Mock).mockResolvedValue({ size: 1024000, isFile: () => true });
      
      // Fetch chart
      const result = await chartFetcher.fetchChart('US5CA13M');
      
      // Should download and return
      expect(result.fromDatabase).toBe(false);
      expect(result.chartId).toBe('US5CA13M');
      expect(mockDownloadService.downloadChart).toHaveBeenCalledWith('US5CA13M', undefined);
      
      // Should store in database
      const dbChart = await chartRepository.getById('US5CA13M');
      expect(dbChart).toBeDefined();
      expect(dbChart?.chart_name).toBe('Oakland Harbor');
      expect(dbChart?.scale).toBe(25000);
    });

    it('should re-download if database record exists but files are missing', async () => {
      // Insert chart into database
      const testChart = createTestChart('US5CA14M');
      await chartRepository.insert(testChart);
      
      // Mock file system to indicate directory doesn't exist
      (fs.stat as jest.Mock).mockRejectedValue(new Error('ENOENT'));
      
      // Mock download service
      const mockChartFiles = {
        chartId: 'US5CA14M',
        basePath: '/test/cache/US5CA14M',
        s57Files: ['/test/cache/US5CA14M/US5CA14M.000'],
        textFiles: [],
        allFiles: ['/test/cache/US5CA14M/US5CA14M.000']
      };
      mockDownloadService.downloadChart.mockResolvedValue(mockChartFiles);
      
      // Fetch chart
      const result = await chartFetcher.fetchChart('US5CA14M');
      
      // Should download even though in database
      expect(result.fromDatabase).toBe(false);
      expect(mockDownloadService.downloadChart).toHaveBeenCalled();
    });

    it('should pass progress callback to download service', async () => {
      // Mock download service
      mockDownloadService.downloadChart.mockResolvedValue({
        chartId: 'US5CA15M',
        basePath: '/test/cache/US5CA15M',
        s57Files: [],
        textFiles: [],
        allFiles: []
      });
      
      const progressCallback = jest.fn();
      
      // Fetch chart with progress
      await chartFetcher.fetchChart('US5CA15M', progressCallback);
      
      // Should pass callback to download service
      expect(mockDownloadService.downloadChart).toHaveBeenCalledWith('US5CA15M', progressCallback);
    });
  });

  describe('fetchMultipleCharts', () => {
    it('should efficiently fetch from database and download missing', async () => {
      // Insert some charts in database
      await chartRepository.insertBatch([
        createTestChart('US5CA12M'),
        createTestChart('US5CA13M')
      ]);
      
      // Mock file system - US5CA12M exists, US5CA13M missing
      (fs.stat as jest.Mock).mockImplementation((path) => {
        if (path.includes('US5CA12M')) {
          if (path === '/test/cache/US5CA12M') {
            return Promise.resolve({ isDirectory: () => true, isFile: () => false });
          }
          return Promise.resolve({ isDirectory: () => false, isFile: () => true, size: 100000 });
        }
        return Promise.reject(new Error('ENOENT'));
      });
      (fs.readdir as jest.Mock).mockResolvedValue(['chart.000']);
      
      // Mock download service for missing charts
      mockDownloadService.downloadMultipleCharts.mockResolvedValue(new Map([
        ['US5CA13M', {
          chartId: 'US5CA13M',
          basePath: '/test/cache/US5CA13M',
          s57Files: ['/test/cache/US5CA13M/US5CA13M.000'],
          textFiles: [],
          allFiles: ['/test/cache/US5CA13M/US5CA13M.000']
        }],
        ['US5CA14M', {
          chartId: 'US5CA14M',
          basePath: '/test/cache/US5CA14M',
          s57Files: ['/test/cache/US5CA14M/US5CA14M.000'],
          textFiles: [],
          allFiles: ['/test/cache/US5CA14M/US5CA14M.000']
        }]
      ]));
      
      // Fetch multiple charts
      const chartIds = ['US5CA12M', 'US5CA13M', 'US5CA14M'];
      const results = await chartFetcher.fetchMultipleCharts(chartIds);
      
      // Check results
      expect(results.size).toBe(3);
      expect(results.get('US5CA12M')?.fromDatabase).toBe(true);
      expect(results.get('US5CA13M')?.fromDatabase).toBe(false);
      expect(results.get('US5CA14M')?.fromDatabase).toBe(false);
      
      // Should only download missing charts
      expect(mockDownloadService.downloadMultipleCharts).toHaveBeenCalledWith(
        ['US5CA13M', 'US5CA14M'],
        undefined
      );
    });
  });

  describe('isChartInDatabase', () => {
    it('should return true if chart exists in database with files', async () => {
      // Insert chart
      await chartRepository.insert(createTestChart('US5CA12M'));
      
      // Mock file system
      (fs.stat as jest.Mock).mockImplementation((path) => {
        if (path === '/test/cache/US5CA12M') {
          return Promise.resolve({ isDirectory: () => true });
        }
        return Promise.resolve({ isFile: () => true });
      });
      (fs.readdir as jest.Mock).mockResolvedValue(['US5CA12M.000']);
      
      const result = await chartFetcher.isChartInDatabase('US5CA12M');
      expect(result).toBe(true);
    });

    it('should return false if chart not in database', async () => {
      const result = await chartFetcher.isChartInDatabase('NOTFOUND');
      expect(result).toBe(false);
    });

    it('should return false if chart in database but files missing', async () => {
      // Insert chart
      await chartRepository.insert(createTestChart('US5CA12M'));
      
      // Mock file system - directory doesn't exist
      (fs.stat as jest.Mock).mockRejectedValue(new Error('ENOENT'));
      
      const result = await chartFetcher.isChartInDatabase('US5CA12M');
      expect(result).toBe(false);
    });
  });

  describe('getDatabaseStats', () => {
    it('should return database statistics', async () => {
      // Insert test data
      await chartRepository.insertBatch([
        createTestChart('US5CA12M'),
        createTestChart('US5CA13M')
      ]);
      
      await featureRepository.insertBatch([
        { chart_id: 'US5CA12M', object_class: 'LIGHTS', geometry: '{}' },
        { chart_id: 'US5CA12M', object_class: 'BOYLAT', geometry: '{}' },
        { chart_id: 'US5CA13M', object_class: 'DEPARE', geometry: '{}' }
      ]);
      
      const stats = await chartFetcher.getDatabaseStats();
      
      expect(stats.totalCharts).toBe(2);
      expect(stats.totalFeatures).toBe(3);
      expect(stats.totalCacheSize).toBe(2048000); // 2 charts * 1024000 bytes
    });
  });
});