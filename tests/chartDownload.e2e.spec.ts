import { ChartQueryService } from '../src/services/chartQuery';
import { ChartDownloadService } from '../src/services/chartDownload';
import { CacheManager } from '../src/utils/cache';
import { XMLCatalogService } from '../src/services/xmlCatalog';
import { promises as fs } from 'fs';
import path from 'path';

describe('Chart Download E2E', () => {
  // San Diego coordinates: 32°42'51.7"N 117°13'40.4"W
  const testCoordinates = {
    lat: 32.714361,  // 32 + 42/60 + 51.7/3600
    lon: -117.227889 // -(117 + 13/60 + 40.4/3600)
  };

  const testCacheDir = path.join(process.cwd(), 'tests', 'test-e2e-cache');
  let xmlCatalogService: XMLCatalogService;
  let chartQueryService: ChartQueryService;
  let chartDownloadService: ChartDownloadService;
  let cacheManager: CacheManager;

  beforeAll(async () => {
    // Create services with test cache directory
    xmlCatalogService = new XMLCatalogService(path.join(testCacheDir, 'catalog'));
    chartQueryService = new ChartQueryService(xmlCatalogService);
    cacheManager = new CacheManager({
      cacheDir: path.join(testCacheDir, 'charts'),
      maxSizeGB: 1,
      maxAgeInDays: 1
    });
    chartDownloadService = new ChartDownloadService(
      path.join(testCacheDir, 'charts'),
      cacheManager,
      chartQueryService
    );

    // Initialize cache manager
    await cacheManager.initialize();
  });

  afterAll(async () => {
    // Clean up test cache directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('XML Catalog Integration', () => {
    it('should download and cache XML catalog', async () => {
      console.log('\n📥 Downloading NOAA XML catalog...');
      
      const status = await chartQueryService.getCatalogStatus();
      
      expect(status.chartCount).toBeGreaterThan(6000);
      console.log(`✅ Catalog loaded with ${status.chartCount} charts`);
    }, 60000); // 1 minute timeout for catalog download

    it('should query charts for San Diego coordinates', async () => {
      console.log(`\n🔍 Querying charts for: ${testCoordinates.lat}°N, ${testCoordinates.lon}°W`);
      
      const charts = await chartQueryService.queryByCoordinates(
        testCoordinates.lat,
        testCoordinates.lon
      );

      expect(charts).toBeDefined();
      expect(Array.isArray(charts)).toBe(true);
      expect(charts.length).toBeGreaterThan(0);

      console.log(`✅ Found ${charts.length} charts`);
      
      // Log all charts found
      charts
        .sort((a, b) => a.scale - b.scale)
        .forEach(chart => {
          console.log(`   - ${chart.id}: ${chart.name} (1:${chart.scale})`);
        });

      // Verify chart structure
      const firstChart = charts[0];
      expect(firstChart).toHaveProperty('id');
      expect(firstChart).toHaveProperty('name');
      expect(firstChart).toHaveProperty('scale');
      expect(firstChart).toHaveProperty('edition');
      expect(firstChart).toHaveProperty('lastUpdate');
      expect(firstChart).toHaveProperty('downloadUrl');
      
      // Verify bounds
      expect(firstChart.bounds).toBeDefined();
      expect(firstChart.bounds?.minLat).toBeLessThanOrEqual(testCoordinates.lat);
      expect(firstChart.bounds?.maxLat).toBeGreaterThanOrEqual(testCoordinates.lat);
      expect(firstChart.bounds?.minLon).toBeLessThanOrEqual(testCoordinates.lon);
      expect(firstChart.bounds?.maxLon).toBeGreaterThanOrEqual(testCoordinates.lon);
    }, 30000);

    it('should select the best chart for the location', async () => {
      const charts = await chartQueryService.queryByCoordinates(
        testCoordinates.lat,
        testCoordinates.lon
      );

      const bestChart = chartQueryService.selectBestChart(
        charts,
        testCoordinates.lat,
        testCoordinates.lon
      );

      expect(bestChart).toBeDefined();
      expect(bestChart).not.toBeNull();
      
      console.log(`\n🎯 Best chart: ${bestChart!.id} - ${bestChart!.name}`);
      console.log(`   Scale: 1:${bestChart!.scale}`);
      console.log(`   Edition: ${bestChart!.edition}`);
      console.log(`   Last Update: ${bestChart!.lastUpdate}`);
      console.log(`   Download URL: ${bestChart!.downloadUrl}`);

      // Best chart should have reasonable scale for navigation
      expect(bestChart!.scale).toBeLessThanOrEqual(80000); // Not too small scale
      expect(bestChart!.scale).toBeGreaterThanOrEqual(5000); // Not too large scale
      
      // Should be San Diego Bay chart based on our test
      expect(bestChart!.id).toBe('US5CA72M');
      expect(bestChart!.name).toContain('San Diego Bay');
    }, 30000);
  });

  describe('Chart Download', () => {
    let targetChartId: string;

    beforeAll(async () => {
      // Get the best chart to download
      const charts = await chartQueryService.queryByCoordinates(
        testCoordinates.lat,
        testCoordinates.lon
      );
      const bestChart = chartQueryService.selectBestChart(
        charts,
        testCoordinates.lat,
        testCoordinates.lon
      );
      targetChartId = bestChart!.id;
    });

    it('should download a chart from NOAA', async () => {
      console.log(`\n📥 Downloading chart ${targetChartId}...`);

      let progressUpdates = 0;
      const chartFiles = await chartDownloadService.downloadChart(
        targetChartId,
        (progress) => {
          progressUpdates++;
          if (progress.percentage % 20 === 0 || progress.percentage === 100) {
            console.log(`   Progress: ${progress.percentage}% (${(progress.downloadedBytes / 1024 / 1024).toFixed(2)}/${(progress.totalBytes / 1024 / 1024).toFixed(2)} MB)`);
          }
        }
      );

      expect(chartFiles).toBeDefined();
      expect(chartFiles.chartId).toBe(targetChartId);
      expect(chartFiles.s57Files.length).toBeGreaterThan(0);
      expect(progressUpdates).toBeGreaterThan(0);

      console.log(`✅ Download complete`);
      console.log(`   S-57 files: ${chartFiles.s57Files.join(', ')}`);
      console.log(`   Total files: ${chartFiles.allFiles.length}`);

      // Verify files exist on disk
      const s57FilePath = path.join(chartFiles.basePath, chartFiles.s57Files[0]);
      const fileExists = await fs.access(s57FilePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Verify file size
      const stats = await fs.stat(s57FilePath);
      expect(stats.size).toBeGreaterThan(0);
      console.log(`   S-57 file size: ${(stats.size / 1024).toFixed(2)} KB`);
    }, 120000); // 2 minute timeout

    it('should use cached chart on second request', async () => {
      console.log(`\n🗃️  Testing cache for ${targetChartId}...`);

      // First, verify it's cached
      const isCached = await chartDownloadService.isChartCached(targetChartId);
      expect(isCached).toBe(true);

      // Time the cached retrieval
      const startTime = Date.now();
      const cachedFiles = await chartDownloadService.getCachedChart(targetChartId);
      const retrievalTime = Date.now() - startTime;

      expect(cachedFiles).toBeDefined();
      expect(cachedFiles).not.toBeNull();
      expect(cachedFiles!.chartId).toBe(targetChartId);
      expect(retrievalTime).toBeLessThan(100); // Should be very fast

      console.log(`✅ Retrieved from cache in ${retrievalTime}ms`);
    });

    it('should download multiple charts concurrently', async () => {
      console.log('\n📥 Testing concurrent downloads...');
      
      // Get multiple charts for the area
      const charts = await chartQueryService.queryByCoordinates(
        testCoordinates.lat,
        testCoordinates.lon
      );
      
      // Select up to 3 charts of different scales
      const chartsToDownload = charts
        .sort((a, b) => a.scale - b.scale)
        .slice(0, 3)
        .map(c => c.id);
      
      console.log(`Downloading ${chartsToDownload.length} charts: ${chartsToDownload.join(', ')}`);
      
      const downloadResults = await chartDownloadService.downloadMultipleCharts(
        chartsToDownload,
        (chartId, progress) => {
          if (progress.percentage === 100) {
            console.log(`   ✓ ${chartId} complete`);
          }
        }
      );
      
      expect(downloadResults.size).toBe(chartsToDownload.length);
      
      // Verify all downloads succeeded
      chartsToDownload.forEach(chartId => {
        expect(downloadResults.has(chartId)).toBe(true);
        const files = downloadResults.get(chartId)!;
        expect(files.s57Files.length).toBeGreaterThan(0);
      });
      
      console.log(`✅ All ${chartsToDownload.length} charts downloaded successfully`);
    }, 180000); // 3 minute timeout
  });

  describe('Cache Management', () => {
    it('should track cached charts', async () => {
      const stats = await cacheManager.getStats();
      
      console.log('\n📊 Cache Statistics:');
      console.log(`   Total size: ${stats.totalSizeGB.toFixed(3)} GB`);
      console.log(`   Chart count: ${stats.chartCount}`);
      
      expect(stats.chartCount).toBeGreaterThan(0);
      expect(stats.totalSizeGB).toBeGreaterThan(0);
      expect(stats.totalSizeGB).toBeLessThan(1); // Should be under our 1GB limit
    });

    it('should search cached charts by area', async () => {
      // Search in a box around San Diego
      const searchBounds = {
        minLat: testCoordinates.lat - 0.5,
        maxLat: testCoordinates.lat + 0.5,
        minLon: testCoordinates.lon - 0.5,
        maxLon: testCoordinates.lon + 0.5
      };

      const cachedCharts = await cacheManager.searchCachedCharts(searchBounds);
      
      expect(cachedCharts.length).toBeGreaterThan(0);
      console.log(`\n🔍 Found ${cachedCharts.length} cached charts in search area`);
      
      // Verify the cached chart includes our test location
      const containsTestLocation = cachedCharts.some(chart => 
        chart.bounds &&
        chart.bounds.minLat <= testCoordinates.lat &&
        chart.bounds.maxLat >= testCoordinates.lat &&
        chart.bounds.minLon <= testCoordinates.lon &&
        chart.bounds.maxLon >= testCoordinates.lon
      );
      expect(containsTestLocation).toBe(true);
    });

    it('should respect cache size limits', async () => {
      const stats = await cacheManager.getStats();
      
      // Cache manager should keep size under limit
      expect(stats.totalSizeGB).toBeLessThanOrEqual(1.0);
      
      // If we're close to the limit, eviction should have occurred
      if (stats.totalSizeGB > 0.9) {
        console.log('⚠️  Cache is near limit, eviction may have occurred');
      }
    });
  });

  describe('Integration with MCP handlers', () => {
    it('should work with get_chart by coordinates', async () => {
      // Simulate what the MCP handler would do
      const charts = await chartQueryService.queryByCoordinates(
        testCoordinates.lat,
        testCoordinates.lon
      );
      
      const bestChart = chartQueryService.selectBestChart(
        charts,
        testCoordinates.lat,
        testCoordinates.lon
      );
      
      expect(bestChart).toBeDefined();
      
      // Download if not cached
      const isCached = await chartDownloadService.isChartCached(bestChart!.id);
      if (!isCached) {
        await chartDownloadService.downloadChart(bestChart!.id);
      }
      
      // Get chart files
      const chartFiles = await chartDownloadService.getCachedChart(bestChart!.id);
      expect(chartFiles).toBeDefined();
      expect(chartFiles!.s57Files.length).toBeGreaterThan(0);
      
      console.log(`\n✅ Integration test passed for chart ${bestChart!.id}`);
    });
  });
});