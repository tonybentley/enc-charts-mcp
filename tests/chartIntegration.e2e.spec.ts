import { ChartDownloadService } from '../src/services/chartDownload';
import { S57Parser } from '../src/services/s57Parser';
import { ChartQueryService } from '../src/services/chartQuery';
import { XMLCatalogService } from '../src/services/xmlCatalog';
import { CacheManager } from '../src/utils/cache';
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Helper to check if GDAL is available
function isGdalAvailable(): boolean {
  try {
    execSync('python3 -c "from osgeo import gdal"', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('Chart Download and S-57 Parser Integration', () => {
  let downloadService: ChartDownloadService;
  let parser: S57Parser;
  let queryService: ChartQueryService;
  let cacheManager: CacheManager;
  let testCacheDir: string;
  const gdalAvailable = isGdalAvailable();

  beforeAll(async () => {
    if (!gdalAvailable) {
      console.log('WARNING: GDAL not available - S-57 parsing tests will be skipped');
    }
    // Use existing cache directory
    testCacheDir = path.join(process.cwd(), 'cache');

    // Initialize services with existing cache
    cacheManager = new CacheManager({ cacheDir: path.join(testCacheDir, 'charts') });
    await cacheManager.initialize();
    
    // Initialize queryService with XMLCatalogService
    const xmlCatalogService = new XMLCatalogService(path.join(testCacheDir, 'catalog'));
    queryService = new ChartQueryService(xmlCatalogService);
    
    downloadService = new ChartDownloadService(
      path.join(testCacheDir, 'charts'),
      cacheManager,
      queryService
    );
    parser = new S57Parser();
  });

  afterAll(async () => {
    // Don't delete the cache - it's the real cache
  });

  describe('Download and Parse San Diego Chart', () => {
    const testChartId = 'US5CA72M'; // San Diego Bay chart (verified from catalog)
    let downloadedFiles: any;

    it('should download a real chart from NOAA', async () => {
      // Check if chart is already cached
      const isCached = await cacheManager.isChartCached(testChartId);
      
      if (isCached) {
        // Get cached chart info
        downloadedFiles = await downloadService.getCachedChart(testChartId);
        expect(downloadedFiles).toBeDefined();
        expect(downloadedFiles.chartId).toBe(testChartId);
        expect(downloadedFiles.s57Files.length).toBeGreaterThan(0);
      } else {
        const progressUpdates: any[] = [];
        
        downloadedFiles = await downloadService.downloadChart(testChartId, (progress: any) => {
          progressUpdates.push(progress);
        });

        expect(downloadedFiles).toBeDefined();
        expect(downloadedFiles.chartId).toBe(testChartId);
        expect(downloadedFiles.s57Files.length).toBeGreaterThan(0);
        expect(progressUpdates.length).toBeGreaterThan(0);
        expect(progressUpdates[progressUpdates.length - 1].percentage).toBe(100);
      }
    }, 30000); // 30 second timeout for download

    (gdalAvailable ? it : it.skip)('should parse the downloaded S-57 file', async () => {
      expect(downloadedFiles).toBeDefined();
      expect(downloadedFiles.s57Files.length).toBeGreaterThan(0);

      const s57FilePath = path.join(downloadedFiles.basePath, downloadedFiles.s57Files[0]);
      const features = await parser.parseChart(s57FilePath);

      expect(features).toBeDefined();
      expect(features.type).toBe('FeatureCollection');
      expect(features.features).toBeDefined();
      expect(Array.isArray(features.features)).toBe(true);
      
      // San Diego chart should have features
      expect(features.features.length).toBeGreaterThan(0);
      
      // Log some feature types found
      const featureTypes = new Set<string>(
        features.features.map((f: any) => f.properties?._featureType as string).filter(Boolean)
      );
      console.log('Found feature types:', Array.from(featureTypes));
    });

    (gdalAvailable ? it : it.skip)('should extract chart metadata', async () => {
      const s57FilePath = path.join(downloadedFiles.basePath, downloadedFiles.s57Files[0]);
      const metadata = await parser.getChartMetadata(s57FilePath);

      expect(metadata).toBeDefined();
      expect(metadata.name).toBeDefined();
      expect(metadata.bounds).toBeDefined();
      expect(metadata.bounds?.minLat).toBeLessThan(metadata.bounds?.maxLat as number);
      expect(metadata.bounds?.minLon).toBeLessThan(metadata.bounds?.maxLon as number);
      
      console.log('Chart metadata:', metadata);
    });

    (gdalAvailable ? it : it.skip)('should filter features by type', async () => {
      const s57FilePath = path.join(downloadedFiles.basePath, downloadedFiles.s57Files[0]);
      
      // Get available feature types
      const availableTypes = await parser.getAvailableFeatureTypes(s57FilePath);
      expect(availableTypes.length).toBeGreaterThan(0);
      console.log('Available feature types:', availableTypes);

      // Parse only depth-related features
      const depthFeatures = await parser.parseChart(s57FilePath, {
        featureTypes: ['DEPARE', 'DEPCNT', 'SOUNDG']
      });

      const foundTypes = new Set<string | undefined>(
        depthFeatures.features.map((f: any) => f.properties?._featureType as string | undefined)
      );
      
      // Should only contain requested types
      foundTypes.forEach(type => {
        expect(['DEPARE', 'DEPCNT', 'SOUNDG']).toContain(type);
      });
    });

    (gdalAvailable ? it : it.skip)('should filter features by bounding box', async () => {
      const s57FilePath = path.join(downloadedFiles.basePath, downloadedFiles.s57Files[0]);
      
      // Get chart bounds first
      const metadata = await parser.getChartMetadata(s57FilePath);
      expect(metadata.bounds).toBeDefined();

      // Create a small bounding box in the center of the chart
      const centerLat = (metadata.bounds!.minLat + metadata.bounds!.maxLat) / 2;
      const centerLon = (metadata.bounds!.minLon + metadata.bounds!.maxLon) / 2;
      const delta = 0.01; // Small area

      const boundingBox = {
        minLat: centerLat - delta,
        maxLat: centerLat + delta,
        minLon: centerLon - delta,
        maxLon: centerLon + delta
      };

      const allFeatures = await parser.parseChart(s57FilePath);
      const filteredFeatures = await parser.parseChart(s57FilePath, { boundingBox });

      expect(filteredFeatures.features.length).toBeLessThan(allFeatures.features.length);
      
      // Verify all returned features are within bounds
      filteredFeatures.features.forEach((feature: any) => {
        if (feature.geometry.type === 'Point') {
          const [lon, lat] = feature.geometry.coordinates as [number, number];
          expect(lat).toBeGreaterThanOrEqual(boundingBox.minLat);
          expect(lat).toBeLessThanOrEqual(boundingBox.maxLat);
          expect(lon).toBeGreaterThanOrEqual(boundingBox.minLon);
          expect(lon).toBeLessThanOrEqual(boundingBox.maxLon);
        }
      });
    });

    (gdalAvailable ? it : it.skip)('should filter depth features by depth range', async () => {
      const s57FilePath = path.join(downloadedFiles.basePath, downloadedFiles.s57Files[0]);
      
      // Parse depth features with specific range
      const shallowFeatures = await parser.parseChart(s57FilePath, {
        featureTypes: ['DEPARE', 'SOUNDG'],
        depthRange: { min: 0, max: 10 }
      });

      const deepFeatures = await parser.parseChart(s57FilePath, {
        featureTypes: ['DEPARE', 'SOUNDG'],
        depthRange: { min: 20, max: 100 }
      });

      // Verify depth filtering
      shallowFeatures.features.forEach((feature: any) => {
        const props = feature.properties;
        if (props?.DRVAL1 !== undefined || props?.DRVAL2 !== undefined) {
          // For depth areas, at least part should be in range
          const maxDepth = props.DRVAL2 || Number.MAX_VALUE;
          expect(maxDepth).toBeGreaterThanOrEqual(0);
        }
        if (props?.VALSOU !== undefined) {
          expect(props.VALSOU).toBeLessThanOrEqual(10);
        }
      });

      console.log(`Found ${shallowFeatures.features.length} shallow features`);
      console.log(`Found ${deepFeatures.features.length} deep features`);
    });
  });

  describe('Coordinate-based Chart Discovery and Parsing', () => {
    (gdalAvailable ? it : it.skip)('should find and parse chart for San Diego coordinates', async () => {
      const coords = { lat: 32.7157, lon: -117.1611 }; // San Diego coordinates
      
      // Query for charts at this location
      const charts = await queryService.queryByCoordinates(coords.lat, coords.lon);
      expect(charts.length).toBeGreaterThan(0);
      
      // Find a suitable chart (prefer larger scale)
      const chart = charts.sort((a, b) => b.scale - a.scale)[0];
      console.log(`Selected chart: ${chart.id} at scale 1:${chart.scale}`);

      // Download the chart
      const files = await downloadService.downloadChart(chart.id);
      expect(files.s57Files.length).toBeGreaterThan(0);

      // Parse features around the coordinate
      const s57FilePath = path.join(files.basePath, files.s57Files[0]);
      const delta = 0.005; // Small area around point
      
      const features = await parser.parseChart(s57FilePath, {
        boundingBox: {
          minLat: coords.lat - delta,
          maxLat: coords.lat + delta,
          minLon: coords.lon - delta,
          maxLon: coords.lon + delta
        }
      });

      expect(features.features.length).toBeGreaterThan(0);
      
      // Look for navigation aids near the coordinate
      const navAids = features.features.filter(f => 
        ['BOYLAT', 'BOYSAW', 'LIGHTS', 'BCNLAT'].includes(f.properties?._featureType || '')
      );
      
      console.log(`Found ${navAids.length} navigation aids near coordinate`);
      
      // Look for depth information
      const depthFeatures = features.features.filter(f =>
        ['DEPARE', 'DEPCNT', 'SOUNDG'].includes(f.properties?._featureType || '')
      );
      
      console.log(`Found ${depthFeatures.length} depth features near coordinate`);
    }, 60000); // 60 second timeout for full workflow
  });

  describe('Cache Integration', () => {
    it('should use cached chart on second request', async () => {
      const chartId = 'US5CA72M';
      
      // First download
      const firstDownloadStart = Date.now();
      await downloadService.downloadChart(chartId);
      const firstDownloadTime = Date.now() - firstDownloadStart;

      // Second request should use cache
      const secondDownloadStart = Date.now();
      const cachedFiles = await downloadService.downloadChart(chartId);
      const secondDownloadTime = Date.now() - secondDownloadStart;

      expect(cachedFiles).toBeDefined();
      expect(cachedFiles.s57Files.length).toBeGreaterThan(0);
      
      // Cached request should be much faster
      expect(secondDownloadTime).toBeLessThan(firstDownloadTime / 10);
      console.log(`First download: ${firstDownloadTime}ms, Cached: ${secondDownloadTime}ms`);
    });

    it('should track downloaded charts in cache manager', async () => {
      const cachedChart = await cacheManager.getChart('US5CA72M');
      
      expect(cachedChart).toBeDefined();
      expect(cachedChart?.chartId).toBe('US5CA72M');
      expect(cachedChart?.downloadDate).toBeDefined();
      expect(cachedChart?.metadata).toBeDefined();
      
      // Check cache stats
      const stats = await cacheManager.getStats();
      expect(stats.chartCount).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid chart ID gracefully', async () => {
      await expect(downloadService.downloadChart('INVALID123')).rejects.toThrow(
        'Chart INVALID123 not found'
      );
    });

    it('should handle corrupt S-57 file gracefully', async () => {
      const invalidPath = path.join(testCacheDir, 'invalid.000');
      await fs.writeFile(invalidPath, 'not a valid S-57 file');

      await expect(parser.parseChart(invalidPath)).rejects.toThrow(
        'Failed to parse S-57 file'
      );

      await fs.unlink(invalidPath);
    });
  });

  describe('Performance', () => {
    it('should handle large charts efficiently', async () => {
      const chartId = 'US5CA52M';
      const files = await downloadService.getCachedChart(chartId);
      
      if (!files) {
        console.log('Chart not in cache, skipping performance test');
        return;
      }

      const s57FilePath = path.join(files.basePath, files.s57Files[0]);
      
      // Measure parsing time
      const startTime = Date.now();
      const features = await parser.parseChart(s57FilePath);
      const parseTime = Date.now() - startTime;

      console.log(`Parsed ${features.features.length} features in ${parseTime}ms`);
      console.log(`Average: ${(parseTime / features.features.length).toFixed(2)}ms per feature`);

      // Should parse reasonably fast
      expect(parseTime).toBeLessThan(10000); // Less than 10 seconds
    });
  });
});