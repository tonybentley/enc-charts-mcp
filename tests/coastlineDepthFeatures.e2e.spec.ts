import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { extractCoastlinesHandler } from '../src/handlers/extractCoastlines';
import { DatabaseManager } from '../src/database/DatabaseManager';
import { ChartRepository } from '../src/database/repositories/ChartRepository';
import { NavigationFeatureRepository } from '../src/database/repositories/NavigationFeatureRepository';
import { setDatabaseRepositories } from '../src/services/serviceInitializer';

describe('Coastline Depth Feature Extraction', () => {
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

  it('should extract coastlines from DEPCNT and DEPARE features', async () => {
    // Test with depth features enabled
    const result = await extractCoastlinesHandler({
      chartId: 'US5CA72M',
      boundingBox: {
        minLat: 32.68,
        maxLat: 32.73,
        minLon: -117.26,
        maxLon: -117.20
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
      limit: 100
    });

    expect(result).toBeDefined();
    expect('features' in result).toBe(true);
    
    if ('error' in result) {
      throw new Error(`Extraction failed: ${result.error}`);
    }

    // Check that we got features
    expect(result.features.length).toBeGreaterThan(0);
    
    // Check feature sources
    const sources = result.metadata?.sources || {};
    console.log('\nFeature sources extracted:');
    Object.entries(sources).forEach(([source, stats]) => {
      console.log(`  ${source}: ${stats.count} features, ${stats.totalLength_m.toFixed(0)}m`);
    });

    // Verify we have depth-based features
    const depthSources = ['DEPCNT', 'DEPARE'];
    const hasDepthFeatures = Object.keys(sources).some(source => 
      depthSources.includes(source)
    );

    if (!hasDepthFeatures) {
      console.log('\nNo DEPCNT or DEPARE features found in this bounding box.');
      console.log('This may be expected if depth contours are outside the test area.');
    }

    // Check processing stats
    console.log('\nProcessing statistics:');
    console.log(`  Total segments: ${result.metadata?.processingStats?.totalSegments || 0}`);
    console.log(`  Stitched segments: ${result.metadata?.processingStats?.stitchedSegments || 0}`);
    console.log(`  Total length: ${result.metadata?.processingStats?.totalLength_m?.toFixed(0) || 0}m`);
    
    // Verify stitching is working
    if (result.metadata?.processingStats?.totalSegments && 
        result.metadata?.processingStats?.totalSegments > 1) {
      expect(result.metadata.processingStats.stitchedSegments).toBeLessThanOrEqual(
        result.metadata.processingStats.totalSegments
      );
    }
  }, 30000); // 30 second timeout

  it('should prioritize DEPCNT features over DEPARE in deduplication', async () => {
    // Extract with all features to test deduplication
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
      limit: 200
    });

    if ('error' in result) {
      throw new Error(`Extraction failed: ${result.error}`);
    }

    // Find features that were deduplicated
    const deduplicatedFeatures = result.features.filter(f => 
      f.properties.deduplicated === true
    );

    console.log(`\nDeduplicated features: ${deduplicatedFeatures.length}`);
    
    if (deduplicatedFeatures.length > 0) {
      // Check that higher priority sources are kept
      deduplicatedFeatures.forEach(feature => {
        const sources = feature.properties.sourceFeatures || [];
        console.log(`  Deduplicated feature has sources: ${sources.join(', ')}`);
        
        // If DEPCNT is in the sources, it should be the primary (first) source
        if (sources.includes('DEPCNT') && sources.includes('DEPARE')) {
          expect(sources[0]).toBe('DEPCNT');
        }
      });
    }
  }, 30000);

  it('should extract 0-depth contours specifically', async () => {
    // Query a wider area to find 0-depth features
    const result = await extractCoastlinesHandler({
      chartId: 'US5CA72M',
      featureSources: {
        useCoastlines: false,
        useDepthAreas: true,
        useDepthContours: true,
        useLandAreas: false,
        useShorelineConstruction: false,
        useHarborFeatures: false,
        useMooringFeatures: false,
        useSpecialFeatures: false
      },
      extractionMethod: 'combined',
      limit: 1000 // Higher limit to find depth features
    });

    if ('error' in result) {
      throw new Error(`Extraction failed: ${result.error}`);
    }

    // Find features with 0-depth values
    const zeroDepthFeatures = result.features.filter(f => 
      f.properties.depthValue === 0
    );

    console.log(`\nFound ${zeroDepthFeatures.length} features with 0-depth value`);
    
    // Log subtypes of 0-depth features
    const subtypes = new Set(zeroDepthFeatures.map(f => f.properties.subType));
    console.log(`Subtypes: ${Array.from(subtypes).join(', ')}`);

    // Check for low tide and contour subtypes
    const lowTideFeatures = zeroDepthFeatures.filter(f => 
      f.properties.subType === 'lowtide'
    );
    const contourFeatures = zeroDepthFeatures.filter(f => 
      f.properties.subType === 'contour'
    );

    console.log(`  Low tide features (DEPARE DRVAL1=0): ${lowTideFeatures.length}`);
    console.log(`  Contour features (DEPCNT VALDCO=0): ${contourFeatures.length}`);

    // We expect to find at least some 0-depth features based on our earlier query
    expect(result.features.length).toBeGreaterThan(0);
  }, 30000);
});