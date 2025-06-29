import { S57DatabaseParser } from './S57DatabaseParser.js';
import { NavigationFeatureRepository } from '../database/repositories/NavigationFeatureRepository.js';
import { ChartRepository } from '../database/repositories/ChartRepository.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { Feature, FeatureCollection } from 'geojson';
import { S57Properties } from '../types/enc.js';

// Mock the base S57Parser
jest.mock('./s57Parser.js', () => {
  return {
    S57Parser: class MockS57Parser {
      async parseChart(filePath: string, options: any): Promise<FeatureCollection> {
        // Return mock features based on options
        const features: Feature[] = [
          {
            type: 'Feature',
            id: 'LIGHTS_001',
            geometry: {
              type: 'Point',
              coordinates: [-122.4, 37.8]
            },
            properties: {
              _featureType: 'LIGHTS',
              OBJNAM: 'Test Light',
              COLOUR: '1,3',
              HEIGHT: 25
            }
          },
          {
            type: 'Feature',
            id: 'DEPARE_001',
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-122.5, 37.7],
                [-122.4, 37.7],
                [-122.4, 37.8],
                [-122.5, 37.8],
                [-122.5, 37.7]
              ]]
            },
            properties: {
              _featureType: 'DEPARE',
              DRVAL1: 5,
              DRVAL2: 10
            }
          }
        ];
        
        // Filter by feature types if specified
        let filteredFeatures = features;
        if (options.featureTypes) {
          filteredFeatures = features.filter(f => 
            options.featureTypes.includes((f.properties as any)._featureType)
          );
        }
        
        // Filter by depth range if specified
        if (options.depthRange) {
          filteredFeatures = filteredFeatures.filter(f => {
            const props = f.properties as any;
            if (props.DRVAL1 !== undefined || props.DRVAL2 !== undefined) {
              return props.DRVAL1 >= options.depthRange.min || 
                     props.DRVAL2 <= options.depthRange.max;
            }
            return true;
          });
        }
        
        return {
          type: 'FeatureCollection',
          features: filteredFeatures
        };
      }
      
      async parseFeatureType(filePath: string, featureType: string, options: any): Promise<Feature[]> {
        const result = await this.parseChart(filePath, { ...options, featureTypes: [featureType] });
        return result.features;
      }
      
      protected passesDepthFilter(properties: S57Properties, depthRange: { min: number; max: number }): boolean {
        const depthValues = [
          properties.DRVAL1,
          properties.DRVAL2,
          properties.VALDCO,
          properties.VALSOU
        ].filter((v): v is number => v !== undefined && v !== null);
        
        if (depthValues.length === 0) {
          return true;
        }
        
        return depthValues.some(depth => 
          depth >= depthRange.min && depth <= depthRange.max
        );
      }
      
      protected isDepthFeature(featureType: string): boolean {
        const depthTypes = ['DEPARE', 'DEPCNT', 'SOUNDG', 'DRGARE'];
        return depthTypes.includes(featureType);
      }
    }
  };
});

describe('S57DatabaseParser', () => {
  let dbManager: DatabaseManager;
  let featureRepository: NavigationFeatureRepository;
  let chartRepository: ChartRepository;
  let parser: S57DatabaseParser;

  beforeEach(() => {
    dbManager = new DatabaseManager({ memory: true });
    dbManager.initialize();
    featureRepository = new NavigationFeatureRepository(dbManager);
    chartRepository = new ChartRepository(dbManager);
    parser = new S57DatabaseParser(featureRepository);
  });

  afterEach(() => {
    if (dbManager.isOpen()) {
      dbManager.close();
    }
  });

  // Helper to create test chart in database
  const createTestChart = async (chartId: string) => {
    await chartRepository.insert({
      chart_id: chartId,
      chart_name: `Test Chart ${chartId}`,
      scale: 50000,
      bbox_minlon: -123,
      bbox_minlat: 37,
      bbox_maxlon: -122,
      bbox_maxlat: 38
    });
  };

  describe('parseChartToDatabase', () => {
    it('should parse chart and store features in database', async () => {
      await createTestChart('US5CA12M');
      
      const result = await parser.parseChartToDatabase(
        '/test/chart.000',
        'US5CA12M'
      );
      
      // Verify parse result statistics
      expect(result.chartId).toBe('US5CA12M');
      expect(result.featuresStored).toBe(2);
      expect(result.totalFeatures).toBe(2);
      
      // Verify features were stored in database
      const dbFeatures = await featureRepository.findByChartId('US5CA12M');
      expect(dbFeatures).toHaveLength(2);
      
      // Check LIGHTS feature
      const lightsFeature = dbFeatures.find(f => f.object_class === 'LIGHTS');
      expect(lightsFeature).toBeDefined();
      expect(lightsFeature?.object_id).toBe('LIGHTS_001');
      expect(lightsFeature?.bbox_minlon).toBe(-122.4);
      expect(lightsFeature?.bbox_maxlon).toBe(-122.4);
      
      // Check DEPARE feature
      const depareFeature = dbFeatures.find(f => f.object_class === 'DEPARE');
      expect(depareFeature).toBeDefined();
      expect(depareFeature?.bbox_minlon).toBe(-122.5);
      expect(depareFeature?.bbox_maxlon).toBe(-122.4);
    });

    it('should clear existing features when clearExisting is true', async () => {
      await createTestChart('US5CA12M');
      
      // First parse
      await parser.parseChartToDatabase('/test/chart.000', 'US5CA12M');
      
      // Parse again with clearExisting
      await parser.parseChartToDatabase(
        '/test/chart.000',
        'US5CA12M',
        { clearExisting: true }
      );
      
      // Should still have 2 features (not 4)
      const dbFeatures = await featureRepository.findByChartId('US5CA12M');
      expect(dbFeatures).toHaveLength(2);
    });

    it('should skip parsing when skipExisting is true and features exist', async () => {
      await createTestChart('US5CA12M');
      
      // First parse
      await parser.parseChartToDatabase('/test/chart.000', 'US5CA12M');
      
      // Mark the existing features to check they weren't replaced
      const originalFeatures = await featureRepository.findByChartId('US5CA12M');
      const originalIds = originalFeatures.map(f => f.id);
      
      // Parse again with skipExisting
      await parser.parseChartToDatabase(
        '/test/chart.000',
        'US5CA12M',
        { skipExisting: true }
      );
      
      // Should have same features with same IDs
      const dbFeatures = await featureRepository.findByChartId('US5CA12M');
      expect(dbFeatures).toHaveLength(2);
      expect(dbFeatures.map(f => f.id)).toEqual(originalIds);
    });

    it('should handle batch size option', async () => {
      await createTestChart('US5CA12M');
      
      // Spy on insertBatch to verify it's called with correct batch sizes
      const insertBatchSpy = jest.spyOn(featureRepository, 'insertBatch');
      
      await parser.parseChartToDatabase(
        '/test/chart.000',
        'US5CA12M',
        { batchSize: 1 }
      );
      
      // With batchSize=1, should be called twice (once for each feature)
      expect(insertBatchSpy).toHaveBeenCalledTimes(2);
      expect(insertBatchSpy).toHaveBeenNthCalledWith(1, 
        expect.arrayContaining([expect.objectContaining({ object_class: 'LIGHTS' })])
      );
    });
  });

  describe('parseFeatureTypesToDatabase', () => {
    it('should parse specific feature types to database', async () => {
      await createTestChart('US5CA13M');
      
      const count = await parser.parseFeatureTypesToDatabase(
        '/test/chart.000',
        'US5CA13M',
        ['LIGHTS', 'BOYLAT'] // BOYLAT won't be found in mock data
      );
      
      // Should only store LIGHTS feature
      expect(count).toBe(1);
      
      const dbFeatures = await featureRepository.findByChartId('US5CA13M');
      expect(dbFeatures).toHaveLength(1);
      expect(dbFeatures[0].object_class).toBe('LIGHTS');
    });
  });

  describe('getChartFeaturesFromDatabase', () => {
    beforeEach(async () => {
      await createTestChart('US5CA12M');
      
      // Parse features into database first
      await parser.parseChartToDatabase('/test/chart.000', 'US5CA12M');
    });

    it('should retrieve all features from database', async () => {
      const result = await parser.getChartFeaturesFromDatabase('US5CA12M');
      
      expect(result.type).toBe('FeatureCollection');
      expect(result.features).toHaveLength(2);
      
      // Verify feature structure
      const lightsFeature = result.features.find(f => 
        (f.properties as any)._featureType === 'LIGHTS'
      );
      expect(lightsFeature).toBeDefined();
      expect(lightsFeature?.geometry.type).toBe('Point');
    });

    it('should filter by feature types', async () => {
      const result = await parser.getChartFeaturesFromDatabase(
        'US5CA12M',
        { featureTypes: ['DEPARE'] }
      );
      
      expect(result.features).toHaveLength(1);
      expect((result.features[0].properties as any)._featureType).toBe('DEPARE');
    });

    it('should filter by bounding box', async () => {
      // Test 1: Query box that overlaps with both features
      const result1 = await parser.getChartFeaturesFromDatabase(
        'US5CA12M',
        {
          boundingBox: {
            minLat: 37.75,
            maxLat: 37.85,
            minLon: -122.45,
            maxLon: -122.35
          }
        }
      );
      
      // Both features should be returned as their bboxes overlap
      expect(result1.features).toHaveLength(2);
      
      // Test 2: Query box north of all features
      const result2 = await parser.getChartFeaturesFromDatabase(
        'US5CA12M',
        {
          boundingBox: {
            minLat: 37.81,  // North of both features
            maxLat: 37.82,
            minLon: -122.45,
            maxLon: -122.35
          }
        }
      );
      
      // No features should be returned
      expect(result2.features).toHaveLength(0);
      
      // Test 3: Query box east of all features
      const result3 = await parser.getChartFeaturesFromDatabase(
        'US5CA12M',
        {
          boundingBox: {
            minLat: 37.7,
            maxLat: 37.9,
            minLon: -122.3,  // East of both features
            maxLon: -122.2
          }
        }
      );
      
      // No features should be returned
      expect(result3.features).toHaveLength(0);
    });

    it('should filter by depth range', async () => {
      const result = await parser.getChartFeaturesFromDatabase(
        'US5CA12M',
        {
          depthRange: { min: 0, max: 8 }
        }
      );
      
      // DEPARE feature has DRVAL1=5, DRVAL2=10, so it passes
      const depareFeatures = result.features.filter(f => 
        (f.properties as any)._featureType === 'DEPARE'
      );
      expect(depareFeatures).toHaveLength(1);
    });

    it('should throw error if no repository available', async () => {
      const parserNoDb = new S57DatabaseParser();
      
      await expect(parserNoDb.getChartFeaturesFromDatabase('US5CA12M'))
        .rejects.toThrow('Database repository not available');
    });
  });

  describe('getChartFeatureStats', () => {
    it('should return feature statistics', async () => {
      await createTestChart('US5CA12M');
      
      await parser.parseChartToDatabase('/test/chart.000', 'US5CA12M');
      
      const stats = await parser.getChartFeatureStats('US5CA12M');
      
      expect(stats).toBeDefined();
      expect(stats?.totalFeatures).toBe(2);
      expect(stats?.featuresByClass).toEqual({
        'LIGHTS': 1,
        'DEPARE': 1
      });
    });

    it('should return null if no repository', async () => {
      const parserNoDb = new S57DatabaseParser();
      const stats = await parserNoDb.getChartFeatureStats('US5CA12M');
      expect(stats).toBeNull();
    });
  });

  describe('calculateFeatureBounds', () => {
    it('should calculate bounds for different geometry types', async () => {
      await createTestChart('US5CA12M');
      
      // Parse to trigger bounds calculation
      await parser.parseChartToDatabase('/test/chart.000', 'US5CA12M');
      
      const features = await featureRepository.findByChartId('US5CA12M');
      
      // Point geometry
      const pointFeature = features.find(f => f.object_class === 'LIGHTS');
      expect(pointFeature?.bbox_minlon).toBe(-122.4);
      expect(pointFeature?.bbox_maxlon).toBe(-122.4);
      expect(pointFeature?.bbox_minlat).toBe(37.8);
      expect(pointFeature?.bbox_maxlat).toBe(37.8);
      
      // Polygon geometry
      const polygonFeature = features.find(f => f.object_class === 'DEPARE');
      expect(polygonFeature?.bbox_minlon).toBe(-122.5);
      expect(polygonFeature?.bbox_maxlon).toBe(-122.4);
      expect(polygonFeature?.bbox_minlat).toBe(37.7);
      expect(polygonFeature?.bbox_maxlat).toBe(37.8);
    });
  });
});