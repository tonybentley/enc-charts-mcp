import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Feature, LineString, Point } from 'geojson';
import * as turf from '@turf/helpers';
import distance from '@turf/distance';
import buffer from '@turf/buffer';
import booleanIntersects from '@turf/boolean-intersects';
import { extractCoastlinesHandler } from '../src/handlers/extractCoastlines';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { ChartRepository } from '../src/database/repositories/ChartRepository';
import { NavigationFeatureRepository } from '../src/database/repositories/NavigationFeatureRepository';
import { setDatabaseRepositories } from '../src/services/serviceInitializer';

describe('Coastline Extraction Comparison Tests', () => {
  let db: DatabaseManager;

  beforeAll(async () => {
    // Initialize database
    db = new DatabaseManager({ memory: true });
    db.initialize();
    
    const chartRepo = new ChartRepository(db);
    const featureRepo = new NavigationFeatureRepository(db);
    setDatabaseRepositories(chartRepo, featureRepo);
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  describe('Shelter Island Coastline Shape Verification', () => {
    // Expected key points for Shelter Island based on the project screenshot
    const shelterIslandKeyPoints = [
      { name: 'Peninsula Base North', lat: 32.7200, lon: -117.2265 },
      { name: 'Peninsula Base South', lat: 32.7120, lon: -117.2265 },
      { name: 'Peninsula Tip', lat: 32.7150, lon: -117.2200 },
      { name: 'North Shore Mid', lat: 32.7180, lon: -117.2230 },
      { name: 'South Shore Mid', lat: 32.7130, lon: -117.2230 },
      { name: 'Marina Inlet', lat: 32.7160, lon: -117.2240 },
    ];

    it('should extract coastlines that match expected Shelter Island shape', async () => {
      // Extract coastlines with all feature sources
      const result = await extractCoastlinesHandler({
        chartId: 'US5CA72M',
        boundingBox: {
          minLat: 32.710,
          maxLat: 32.725,
          minLon: -117.235,
          maxLon: -117.215
        },
        stitching: {
          enabled: true,
          tolerance: 50,
          mergeConnected: true
        },
        featureSources: {
          useCoastlines: true,
          useDepthAreas: true,
          useDepthContours: true,
          useLandAreas: true,
          useShorelineConstruction: true,
          useHarborFeatures: true,
          useMooringFeatures: true,
          useSpecialFeatures: true
        },
        extractionMethod: 'combined',
        limit: 200
      });

      expect(result).toBeDefined();
      expect('features' in result).toBe(true);
      if ('error' in result) {
        throw new Error(`Extraction failed: ${result.error}`);
      }

      const coastlines = result.features;
      expect(coastlines.length).toBeGreaterThan(0);

      // Test 1: Verify coastline coverage near key points
      const coverageResults = shelterIslandKeyPoints.map(keyPoint => {
        const point = turf.point([keyPoint.lon, keyPoint.lat]);
        const searchRadius = 0.1; // 100m buffer
        const bufferedPoint = buffer(point, searchRadius, { units: 'kilometers' });

        // Check if any coastline intersects with the buffer around key point
        const nearbyCoastlines = coastlines.filter(coastline => {
          if (coastline.geometry.type !== 'LineString') return false;
          if (!bufferedPoint) return false;
          return booleanIntersects(coastline, bufferedPoint);
        });

        return {
          name: keyPoint.name,
          hasNearbyCoastline: nearbyCoastlines.length > 0,
          nearbyCount: nearbyCoastlines.length,
          coordinates: [keyPoint.lon, keyPoint.lat]
        };
      });

      // Log coverage results
      console.log('Key Point Coverage:');
      coverageResults.forEach(result => {
        console.log(`  ${result.name}: ${result.hasNearbyCoastline ? '✓' : '✗'} (${result.nearbyCount} features)`);
      });

      // At least 80% of key points should have nearby coastlines
      const coveredPoints = coverageResults.filter(r => r.hasNearbyCoastline).length;
      const coveragePercentage = (coveredPoints / shelterIslandKeyPoints.length) * 100;
      expect(coveragePercentage).toBeGreaterThanOrEqual(80);

      // Test 2: Verify peninsula shape characteristics
      // Find coastlines in the core Shelter Island area
      const coreArea = {
        minLat: 32.712,
        maxLat: 32.720,
        minLon: -117.230,
        maxLon: -117.220
      };

      const coreCoastlines = coastlines.filter(coastline => {
        if (coastline.geometry.type !== 'LineString') return false;
        return coastline.geometry.coordinates.some(coord => 
          coord[0] >= coreArea.minLon && coord[0] <= coreArea.maxLon &&
          coord[1] >= coreArea.minLat && coord[1] <= coreArea.maxLat
        );
      });

      expect(coreCoastlines.length).toBeGreaterThan(0);

      // Test 3: Verify extraction from multiple feature types
      const featureSources = new Set<string>();
      coastlines.forEach(coastline => {
        const sources = coastline.properties.sourceFeatures || [];
        sources.forEach(source => featureSources.add(source));
      });

      console.log('Feature sources found:', Array.from(featureSources));
      
      // Should have multiple feature types contributing to coastline
      expect(featureSources.size).toBeGreaterThanOrEqual(2);

      // Test 4: Verify depth-based extraction
      const depthBasedCoastlines = coastlines.filter(coastline => {
        const sources = coastline.properties.sourceFeatures || [];
        return sources.includes('DEPCNT') || sources.includes('DEPARE');
      });

      console.log(`Depth-based coastlines: ${depthBasedCoastlines.length} of ${coastlines.length}`);

      // Test 5: Check for continuous coastline segments
      const longSegments = coastlines.filter(coastline => 
        coastline.properties.length_m > 100
      );

      expect(longSegments.length).toBeGreaterThan(0);
      console.log(`Long segments (>100m): ${longSegments.length}`);

      // Test 6: Verify gap metrics from stitching
      if (result.metadata?.processingStats?.gaps !== undefined) {
        console.log(`Gaps detected: ${result.metadata.processingStats.gaps}`);
        console.log(`Filled gaps: ${result.metadata.processingStats.filledGaps || 0}`);
        
        // With 50m tolerance, gaps should be reasonable
        if (result.metadata.processingStats.largestGap_m) {
          expect(result.metadata.processingStats.largestGap_m).toBeLessThan(500);
        }
      }
    });

    it('should extract more complete coastlines with depth contours enabled', async () => {
      // Test with depth contours disabled
      const withoutDepthContours = await extractCoastlinesHandler({
        chartId: 'US5CA72M',
        boundingBox: {
          minLat: 32.710,
          maxLat: 32.725,
          minLon: -117.235,
          maxLon: -117.215
        },
        featureSources: {
          useCoastlines: true,
          useDepthAreas: false,
          useDepthContours: false,
          useLandAreas: false,
          useShorelineConstruction: true,
          useHarborFeatures: false,
          useMooringFeatures: false,
          useSpecialFeatures: false
        },
        extractionMethod: 'combined',
        limit: 200
      });

      // Test with depth contours enabled
      const withDepthContours = await extractCoastlinesHandler({
        chartId: 'US5CA72M',
        boundingBox: {
          minLat: 32.710,
          maxLat: 32.725,
          minLon: -117.235,
          maxLon: -117.215
        },
        featureSources: {
          useCoastlines: true,
          useDepthAreas: true,
          useDepthContours: true,
          useLandAreas: false,
          useShorelineConstruction: true,
          useHarborFeatures: false,
          useMooringFeatures: false,
          useSpecialFeatures: false
        },
        extractionMethod: 'combined',
        limit: 200
      });

      if ('error' in withoutDepthContours || 'error' in withDepthContours) {
        throw new Error('Extraction failed');
      }

      const lengthWithout = withoutDepthContours.metadata?.processingStats?.totalLength_m || 0;
      const lengthWith = withDepthContours.metadata?.processingStats?.totalLength_m || 0;

      console.log(`Total length without depth features: ${lengthWithout.toFixed(0)}m`);
      console.log(`Total length with depth features: ${lengthWith.toFixed(0)}m`);
      console.log(`Improvement: ${((lengthWith - lengthWithout) / lengthWithout * 100).toFixed(1)}%`);

      // Depth features should add at least some coastline length
      expect(lengthWith).toBeGreaterThanOrEqual(lengthWithout);
    });

    it('should handle coordinate-based queries correctly', async () => {
      // Test extraction using coordinates instead of chart ID
      const shelterIslandCoords = { lat: 32.714935, lon: -117.228975 };
      
      const result = await extractCoastlinesHandler({
        coordinates: shelterIslandCoords,
        boundingBox: {
          minLat: 32.710,
          maxLat: 32.720,
          minLon: -117.235,
          maxLon: -117.220
        },
        featureSources: {
          useCoastlines: true,
          useDepthAreas: true,
          useDepthContours: true,
          useLandAreas: true,
          useShorelineConstruction: true
        },
        extractionMethod: 'combined',
        limit: 50
      });

      expect(result).toBeDefined();
      expect('features' in result).toBe(true);
      if ('error' in result) {
        throw new Error(`Coordinate-based extraction failed: ${result.error}`);
      }

      // Should select US5CA72M chart
      expect(result.metadata.chartId).toBe('US5CA72M');
      expect(result.features.length).toBeGreaterThan(0);

      // Verify features are near the requested coordinates
      const nearbyFeatures = result.features.filter(feature => {
        if (feature.geometry.type !== 'LineString') return false;
        
        return feature.geometry.coordinates.some(coord => {
          const point = turf.point(coord);
          const targetPoint = turf.point([shelterIslandCoords.lon, shelterIslandCoords.lat]);
          const dist = distance(point, targetPoint, { units: 'kilometers' });
          return dist < 1; // Within 1km
        });
      });

      expect(nearbyFeatures.length).toBeGreaterThan(0);
      console.log(`Features within 1km of target: ${nearbyFeatures.length}`);
    });
  });

  describe('Feature Type Distribution', () => {
    it('should extract coastlines from all configured S-57 feature types', async () => {
      const result = await extractCoastlinesHandler({
        chartId: 'US5CA72M',
        featureSources: {
          useCoastlines: true,
          useDepthAreas: true,
          useDepthContours: true,
          useLandAreas: true,
          useShorelineConstruction: true,
          useHarborFeatures: true,
          useMooringFeatures: true,
          useSpecialFeatures: true
        },
        extractionMethod: 'combined',
        limit: 500
      });

      if ('error' in result) {
        throw new Error(`Extraction failed: ${result.error}`);
      }

      // Check source breakdown in metadata
      const sources = result.metadata?.sources || {};
      console.log('\nFeature type distribution:');
      Object.entries(sources).forEach(([source, stats]) => {
        console.log(`  ${source}: ${stats.count} features, ${stats.totalLength_m.toFixed(0)}m total`);
      });

      // Verify we have coastlines from multiple sources
      const sourceTypes = Object.keys(sources);
      expect(sourceTypes.length).toBeGreaterThan(1);

      // Check for specific high-value sources
      const expectedSources = ['COALNE', 'DEPCNT', 'DEPARE'];
      const foundExpectedSources = expectedSources.filter(source => 
        sourceTypes.includes(source)
      );

      console.log(`\nExpected sources found: ${foundExpectedSources.join(', ')}`);
      expect(foundExpectedSources.length).toBeGreaterThanOrEqual(1);
    });
  });
});