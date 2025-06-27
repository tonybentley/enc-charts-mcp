import { ChartDownloadService, DownloadProgress } from './chartDownload';
import { CacheManager } from '../utils/cache';
import { ChartQueryService } from './chartQuery';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { promises as fs } from 'fs';
import path from 'path';

// Mock dependencies
jest.mock('axios');
jest.mock('adm-zip');
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn(),
    readdir: jest.fn(),
    rm: jest.fn().mockResolvedValue(undefined),
    rmdir: jest.fn().mockResolvedValue(undefined)
  }
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ChartDownloadService', () => {
  let service: ChartDownloadService;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockChartQueryService: jest.Mocked<ChartQueryService>;
  const testCacheDir = '/test/cache/charts';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock services
    mockCacheManager = {
      addChart: jest.fn().mockResolvedValue(undefined),
      initialize: jest.fn().mockResolvedValue(undefined),
      getChart: jest.fn().mockResolvedValue(null),
      isChartCached: jest.fn().mockResolvedValue(false),
      removeChart: jest.fn().mockResolvedValue(undefined),
      getStats: jest.fn().mockResolvedValue({ totalSizeGB: 0, chartCount: 0 }),
      searchCachedCharts: jest.fn().mockResolvedValue([]),
      clearCache: jest.fn().mockResolvedValue(undefined),
      needsUpdate: jest.fn().mockResolvedValue(false)
    } as any;

    mockChartQueryService = {
      queryByChartId: jest.fn().mockResolvedValue({
        id: 'US5CA72M',
        name: 'San Diego Bay',
        scale: 12000,
        edition: '56',
        lastUpdate: '2024-07-17',
        bounds: {
          minLat: 32.6,
          maxLat: 32.8,
          minLon: -117.3,
          maxLon: -117.1
        }
      })
    } as any;

    service = new ChartDownloadService(testCacheDir, mockCacheManager, mockChartQueryService);
  });

  describe('downloadChart', () => {
    const mockChartData = Buffer.from('mock chart data');
    const mockProgress: DownloadProgress[] = [];

    beforeEach(() => {
      mockProgress.length = 0;
      
      // Mock axios response
      mockedAxios.request = jest.fn().mockImplementation((config) => {
        // Simulate progress events
        if (config.onDownloadProgress) {
          config.onDownloadProgress({
            loaded: 50,
            total: 100,
            bytes: 50,
            lengthComputable: true,
            target: null
          });
          config.onDownloadProgress({
            loaded: 100,
            total: 100,
            bytes: 100,
            lengthComputable: true,
            target: null
          });
        }
        
        return Promise.resolve({
          data: mockChartData,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {}
        });
      });

      // Mock file system operations
      mockedFs.readdir.mockImplementation((dirPath: any, _options: any) => {
        const pathStr = typeof dirPath === 'string' ? dirPath : dirPath.toString();
        return Promise.resolve([
          {
            name: 'US5CA72M.000',
            isFile: () => true,
            isDirectory: () => false,
            path: pathStr + '/ENC_ROOT/US5CA72M'
          },
          {
            name: 'README.txt',
            isFile: () => true,
            isDirectory: () => false,
            path: pathStr
          }
        ] as any);
      });

      // Mock AdmZip
      (AdmZip as any).mockImplementation(() => ({
        extractAllTo: jest.fn()
      }));
    });

    it('should download a chart successfully', async () => {
      const chartId = 'US5CA72M';
      const onProgress = jest.fn((progress: DownloadProgress) => {
        mockProgress.push(progress);
      });

      const result = await service.downloadChart(chartId, onProgress);

      // Verify result
      expect(result).toEqual({
        chartId,
        basePath: path.join(testCacheDir, chartId),
        s57Files: ['US5CA72M.000'],
        catalogFile: undefined,
        textFiles: ['README.txt'],
        allFiles: ['US5CA72M.000', 'README.txt']
      });

      // Verify axios was called correctly
      expect((mockedAxios.request as jest.Mock)).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        url: `https://www.charts.noaa.gov/ENCs/${chartId}.zip`,
        responseType: 'arraybuffer',
        timeout: 300000,
        headers: {
          'User-Agent': 'enc-charts-mcp/1.0'
        }
      }));

      // Verify file operations
      expect((mockedFs.mkdir as jest.Mock)).toHaveBeenCalledWith(
        path.join(testCacheDir, chartId),
        { recursive: true }
      );
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        path.join(testCacheDir, chartId, `${chartId}.zip`),
        mockChartData
      );
      expect(mockedFs.unlink).toHaveBeenCalledWith(
        path.join(testCacheDir, chartId, `${chartId}.zip`)
      );

      // Verify progress callbacks
      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(mockProgress[0]).toEqual({
        chartId,
        totalBytes: 100,
        downloadedBytes: 50,
        percentage: 50
      });
      expect(mockProgress[1]).toEqual({
        chartId,
        totalBytes: 100,
        downloadedBytes: 100,
        percentage: 100
      });

      // Verify cache manager was called
      expect((mockCacheManager.addChart as jest.Mock)).toHaveBeenCalledWith(chartId, {
        id: 'US5CA72M',
        name: 'San Diego Bay',
        scale: 12000,
        edition: '56',
        lastUpdate: '2024-07-17',
        bounds: {
          minLat: 32.6,
          maxLat: 32.8,
          minLon: -117.3,
          maxLon: -117.1
        }
      });
    });

    it('should handle 404 errors gracefully', async () => {
      const chartId = 'INVALID_CHART';
      
      const error = {
        isAxiosError: true,
        response: { status: 404 },
        message: 'Not found'
      };
      mockedAxios.request = jest.fn().mockRejectedValue(error);
      mockedAxios.isAxiosError = jest.fn(() => true) as any;

      await expect(service.downloadChart(chartId)).rejects.toThrow(
        `Chart ${chartId} not found on NOAA server`
      );

      // Verify cleanup was attempted
      expect((mockedFs.rmdir as jest.Mock)).toHaveBeenCalledWith(
        path.join(testCacheDir, chartId),
        { recursive: true }
      );
    });

    it('should handle network errors', async () => {
      const chartId = 'US5CA72M';
      
      const error = {
        isAxiosError: true,
        message: 'Network error'
      };
      mockedAxios.request = jest.fn().mockRejectedValue(error);
      mockedAxios.isAxiosError = jest.fn(() => true) as any;

      await expect(service.downloadChart(chartId)).rejects.toThrow(
        `Failed to download chart ${chartId}: Network error`
      );
    });

    it('should handle concurrent downloads of the same chart', async () => {
      const chartId = 'US5CA72M';
      
      // Start two downloads simultaneously
      const download1 = service.downloadChart(chartId);
      const download2 = service.downloadChart(chartId);

      const result1 = await download1;
      const result2 = await download2;

      // Both should return the same result
      expect(result1).toEqual(result2);

      // But axios should only be called once
      const requestMock = mockedAxios.request as jest.Mock;
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('should throw error if no S-57 files found', async () => {
      const chartId = 'US5CA72M';
      
      // Mock readdir to return no .000 files
      mockedFs.readdir.mockResolvedValue([
        {
          name: 'README.txt',
          isFile: () => true,
          isDirectory: () => false,
          path: testCacheDir
        }
      ] as any);

      await expect(service.downloadChart(chartId)).rejects.toThrow(
        `No S-57 files found in chart ${chartId}`
      );
    });
  });

  describe('isChartCached', () => {
    it('should return true if chart directory exists', async () => {
      const chartId = 'US5CA72M';
      
      mockedFs.stat.mockResolvedValue({
        isDirectory: () => true
      } as any);

      const result = await service.isChartCached(chartId);
      
      expect(result).toBe(true);
      expect((mockedFs.stat as jest.Mock)).toHaveBeenCalledWith(
        path.join(testCacheDir, chartId)
      );
    });

    it('should return false if chart directory does not exist', async () => {
      const chartId = 'US5CA72M';
      
      mockedFs.stat.mockRejectedValue(new Error('ENOENT'));

      const result = await service.isChartCached(chartId);
      
      expect(result).toBe(false);
    });

    it('should return false if path is not a directory', async () => {
      const chartId = 'US5CA72M';
      
      mockedFs.stat.mockResolvedValue({
        isDirectory: () => false
      } as any);

      const result = await service.isChartCached(chartId);
      
      expect(result).toBe(false);
    });
  });

  describe('getCachedChart', () => {
    it('should return cached chart files', async () => {
      const chartId = 'US5CA72M';
      
      // Mock chart exists
      mockedFs.stat.mockResolvedValue({
        isDirectory: () => true
      } as any);

      // Mock directory contents
      mockedFs.readdir.mockResolvedValue([
        {
          name: 'US5CA72M.000',
          isFile: () => true,
          isDirectory: () => false,
          path: path.join(testCacheDir, chartId, 'ENC_ROOT/US5CA72M')
        },
        {
          name: 'CATALOG.031',
          isFile: () => true,
          isDirectory: () => false,
          path: path.join(testCacheDir, chartId)
        }
      ] as any);

      const result = await service.getCachedChart(chartId);

      expect(result).toEqual({
        chartId,
        basePath: path.join(testCacheDir, chartId),
        s57Files: ['US5CA72M.000'],
        catalogFile: 'CATALOG.031',
        textFiles: [],
        allFiles: ['US5CA72M.000', 'CATALOG.031']
      });
    });

    it('should return null if chart is not cached', async () => {
      const chartId = 'US5CA72M';
      
      mockedFs.stat.mockRejectedValue(new Error('ENOENT'));

      const result = await service.getCachedChart(chartId);
      
      expect(result).toBeNull();
    });
  });

  describe('downloadMultipleCharts', () => {
    it('should download multiple charts with concurrency limit', async () => {
      const chartIds = ['US5CA72M', 'US4CA74M', 'US3CA70M', 'US2WC05M', 'US1WC01M'];
      const progressCallbacks: Array<{ chartId: string; progress: DownloadProgress }> = [];

      // Mock successful downloads
      mockedAxios.request = jest.fn().mockResolvedValue({
        data: Buffer.from('mock data'),
        status: 200
      });

      mockedFs.readdir.mockResolvedValue([
        {
          name: 'chart.000',
          isFile: () => true,
          isDirectory: () => false,
          path: testCacheDir
        }
      ] as any);

      const results = await service.downloadMultipleCharts(
        chartIds,
        (chartId: string, progress: DownloadProgress) => {
          progressCallbacks.push({ chartId, progress });
        }
      );

      // Verify all charts were downloaded
      expect(results.size).toBe(5);
      chartIds.forEach(chartId => {
        expect(results.has(chartId)).toBe(true);
        expect(results.get(chartId)?.s57Files.length).toBeGreaterThan(0);
      });

      // Verify concurrency limit was respected
      // With concurrency of 3, we should have at most 3 concurrent downloads
      // This is hard to test precisely, but we can verify all were called
      const requestMock2 = mockedAxios.request as jest.Mock;
      expect(requestMock2).toHaveBeenCalledTimes(5);
    });

    it('should handle partial failures in batch download', async () => {
      const chartIds = ['US5CA72M', 'INVALID_CHART', 'US3CA70M'];

      // Mock mixed success/failure
      let callCount = 0;
      mockedAxios.request = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          const error = {
            isAxiosError: true,
            response: { status: 404 },
            message: 'Not found'
          };
          return Promise.reject(error);
        }
        return Promise.resolve({
          data: Buffer.from('mock data'),
          status: 200
        });
      });
      mockedAxios.isAxiosError = jest.fn(() => true) as any;

      mockedFs.readdir.mockResolvedValue([
        {
          name: 'chart.000',
          isFile: () => true,
          isDirectory: () => false,
          path: testCacheDir
        }
      ] as any);

      const results = await service.downloadMultipleCharts(chartIds);

      // Should have 2 successful downloads
      expect(results.size).toBe(2);
      expect(results.has('US5CA72M')).toBe(true);
      expect(results.has('US3CA70M')).toBe(true);
      expect(results.has('INVALID_CHART')).toBe(false);
    });
  });

  describe('cleanupOldCharts', () => {
    it('should remove charts older than specified days', async () => {
      const now = Date.now();
      const oldDate = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days old
      const newDate = new Date(now - 1 * 24 * 60 * 60 * 1000); // 1 day old

      mockedFs.readdir.mockResolvedValue(['US5CA72M', 'US4CA74M'] as any);
      
      mockedFs.stat
        .mockResolvedValueOnce({
          isDirectory: () => true,
          mtimeMs: oldDate.getTime()
        } as any)
        .mockResolvedValueOnce({
          isDirectory: () => true,
          mtimeMs: newDate.getTime()
        } as any);

      const cleaned = await service.cleanupOldCharts(7);

      expect(cleaned).toBe(1);
      expect(mockedFs.rm).toHaveBeenCalledWith(
        path.join(testCacheDir, 'US5CA72M'),
        { recursive: true, force: true }
      );
      expect(mockedFs.rm).not.toHaveBeenCalledWith(
        path.join(testCacheDir, 'US4CA74M'),
        expect.any(Object)
      );
    });

    it('should handle errors gracefully', async () => {
      mockedFs.readdir.mockRejectedValue(new Error('Permission denied'));

      const cleaned = await service.cleanupOldCharts(7);

      expect(cleaned).toBe(0);
      // Should not throw error
    });
  });

  describe('getCacheSize', () => {
    it('should calculate total cache size', async () => {
      mockedFs.readdir
        .mockResolvedValueOnce(['US5CA72M', 'US4CA74M'] as any)
        .mockResolvedValueOnce([
          { name: 'file1', isFile: () => true, isDirectory: () => false }
        ] as any)
        .mockResolvedValueOnce([
          { name: 'file2', isFile: () => true, isDirectory: () => false }
        ] as any);

      mockedFs.stat
        .mockResolvedValueOnce({ size: 1000000 } as any) // 1MB
        .mockResolvedValueOnce({ size: 2000000 } as any); // 2MB

      const result = await service.getCacheSize();

      expect(result).toEqual({
        totalSize: 3000000,
        chartCount: 2
      });
    });

    it('should handle empty cache', async () => {
      mockedFs.readdir.mockResolvedValue([] as any);

      const result = await service.getCacheSize();

      expect(result).toEqual({
        totalSize: 0,
        chartCount: 0
      });
    });
  });
});