import { DatabaseManager } from '../DatabaseManager.js';
import { NavigationFeatureRepository } from './NavigationFeatureRepository.js';
import { ChartRepository } from './ChartRepository.js';
import type { ChartFeatureRecord, BoundingBox, ChartRecord } from '../schemas.js';

describe('NavigationFeatureRepository', () => {
  let dbManager: DatabaseManager;
  let featureRepo: NavigationFeatureRepository;
  let chartRepo: ChartRepository;

  beforeEach(() => {
    dbManager = new DatabaseManager({ memory: true });
    dbManager.initialize();
    featureRepo = new NavigationFeatureRepository(dbManager);
    chartRepo = new ChartRepository(dbManager);
  });

  afterEach(() => {
    if (dbManager.isOpen()) {
      dbManager.close();
    }
  });

  const createTestChart = (chartId: string): ChartRecord => ({
    chart_id: chartId,
    chart_name: `Test Chart ${chartId}`,
    scale: 50000
  });

  const createTestFeature = (chartId: string, objectClass: string, overrides?: Partial<ChartFeatureRecord>): ChartFeatureRecord => ({
    chart_id: chartId,
    object_class: objectClass,
    object_id: `${objectClass}_${Date.now()}_${Math.random()}`,
    geometry: JSON.stringify({
      type: 'Point',
      coordinates: [-122.4, 37.8]
    }),
    properties: JSON.stringify({
      OBJNAM: `Test ${objectClass}`,
      COLOUR: '1,3',
      HEIGHT: 25
    }),
    bbox_minlon: -122.41,
    bbox_minlat: 37.79,
    bbox_maxlon: -122.39,
    bbox_maxlat: 37.81,
    ...overrides
  });

  describe('insert operations', () => {
    beforeEach(async () => {
      // Create a chart for foreign key constraint
      await chartRepo.insert(createTestChart('US5CA12M'));
    });

    it('should insert a single feature', async () => {
      const feature = createTestFeature('US5CA12M', 'LIGHTS');
      await featureRepo.insert(feature);
      
      const features = await featureRepo.findByChartId('US5CA12M');
      expect(features).toHaveLength(1);
      expect(features[0].object_class).toBe('LIGHTS');
    });

    it('should insert multiple features in batch', async () => {
      const features = [
        createTestFeature('US5CA12M', 'LIGHTS'),
        createTestFeature('US5CA12M', 'BOYLAT'),
        createTestFeature('US5CA12M', 'DEPARE')
      ];
      
      await featureRepo.insertBatch(features);
      
      const count = await featureRepo.countByChartId('US5CA12M');
      expect(count).toBe(3);
    });

    it('should handle geometry types correctly', async () => {
      const pointFeature = createTestFeature('US5CA12M', 'LIGHTS', {
        geometry: JSON.stringify({ type: 'Point', coordinates: [-122.4, 37.8] })
      });
      
      const lineFeature = createTestFeature('US5CA12M', 'DEPCNT', {
        geometry: JSON.stringify({ 
          type: 'LineString', 
          coordinates: [[-122.4, 37.8], [-122.3, 37.9]] 
        })
      });
      
      const polygonFeature = createTestFeature('US5CA12M', 'DEPARE', {
        geometry: JSON.stringify({ 
          type: 'Polygon', 
          coordinates: [[[-122.4, 37.8], [-122.3, 37.8], [-122.3, 37.9], [-122.4, 37.9], [-122.4, 37.8]]] 
        })
      });
      
      await featureRepo.insertBatch([pointFeature, lineFeature, polygonFeature]);
      
      const features = await featureRepo.findByChartId('US5CA12M');
      expect(features).toHaveLength(3);
      
      const geometries = features.map(f => JSON.parse(f.geometry));
      expect(geometries.some(g => g.type === 'Point')).toBe(true);
      expect(geometries.some(g => g.type === 'LineString')).toBe(true);
      expect(geometries.some(g => g.type === 'Polygon')).toBe(true);
    });
  });

  describe('query operations', () => {
    beforeEach(async () => {
      // Create charts
      await chartRepo.insert(createTestChart('US5CA12M'));
      await chartRepo.insert(createTestChart('US5CA13M'));
      
      // Insert test features
      await featureRepo.insertBatch([
        createTestFeature('US5CA12M', 'LIGHTS', {
          bbox_minlon: -122.5, bbox_minlat: 37.7,
          bbox_maxlon: -122.3, bbox_maxlat: 37.9
        }),
        createTestFeature('US5CA12M', 'BOYLAT', {
          bbox_minlon: -122.4, bbox_minlat: 37.75,
          bbox_maxlon: -122.2, bbox_maxlat: 37.85
        }),
        createTestFeature('US5CA12M', 'DEPARE', {
          bbox_minlon: -122.6, bbox_minlat: 37.6,
          bbox_maxlon: -122.1, bbox_maxlat: 38.0
        }),
        createTestFeature('US5CA13M', 'LIGHTS', {
          bbox_minlon: -122.3, bbox_minlat: 37.8,
          bbox_maxlon: -122.1, bbox_maxlat: 38.0
        })
      ]);
    });

    it('should find features by bounding box', async () => {
      const bounds: BoundingBox = {
        minLat: 37.75,
        maxLat: 37.85,
        minLon: -122.4,
        maxLon: -122.2
      };
      
      const features = await featureRepo.findByBounds(bounds);
      expect(features.length).toBeGreaterThanOrEqual(2);
      expect(features.some(f => f.object_class === 'BOYLAT')).toBe(true);
    });

    it('should find features by bounding box and object classes', async () => {
      const bounds: BoundingBox = {
        minLat: 37.6,
        maxLat: 38.0,
        minLon: -122.6,
        maxLon: -122.0
      };
      
      const features = await featureRepo.findByBounds(bounds, ['LIGHTS', 'BOYLAT']);
      expect(features.every(f => ['LIGHTS', 'BOYLAT'].includes(f.object_class))).toBe(true);
      expect(features.some(f => f.object_class === 'DEPARE')).toBe(false);
    });

    it('should find features by chart ID', async () => {
      const features = await featureRepo.findByChartId('US5CA12M');
      expect(features).toHaveLength(3);
      expect(features.every(f => f.chart_id === 'US5CA12M')).toBe(true);
    });

    it('should find features by object class', async () => {
      const lights = await featureRepo.findByObjectClass('LIGHTS');
      expect(lights).toHaveLength(2);
      expect(lights.every(f => f.object_class === 'LIGHTS')).toBe(true);
    });

    it('should paginate results', async () => {
      const page1 = await featureRepo.findByChartId('US5CA12M', { limit: 2, offset: 0 });
      expect(page1).toHaveLength(2);
      
      const page2 = await featureRepo.findByChartId('US5CA12M', { limit: 2, offset: 2 });
      expect(page2).toHaveLength(1);
    });
  });

  describe('delete operations', () => {
    beforeEach(async () => {
      await chartRepo.insert(createTestChart('US5CA12M'));
      await featureRepo.insertBatch([
        createTestFeature('US5CA12M', 'LIGHTS'),
        createTestFeature('US5CA12M', 'BOYLAT'),
        createTestFeature('US5CA12M', 'DEPARE')
      ]);
    });

    it('should delete features by chart ID', async () => {
      const deleted = await featureRepo.deleteByChartId('US5CA12M');
      expect(deleted).toBe(3);
      
      const remaining = await featureRepo.findByChartId('US5CA12M');
      expect(remaining).toHaveLength(0);
    });

    it('should delete features by object class', async () => {
      const deleted = await featureRepo.deleteByObjectClass('US5CA12M', 'LIGHTS');
      expect(deleted).toBe(1);
      
      const remaining = await featureRepo.findByChartId('US5CA12M');
      expect(remaining).toHaveLength(2);
      expect(remaining.some(f => f.object_class === 'LIGHTS')).toBe(false);
    });

    it('should handle cascade delete when chart is deleted', async () => {
      // This tests the foreign key constraint
      await chartRepo.delete('US5CA12M');
      
      const features = await featureRepo.findByChartId('US5CA12M');
      expect(features).toHaveLength(0);
    });
  });

  describe('statistics and aggregation', () => {
    beforeEach(async () => {
      await chartRepo.insert(createTestChart('US5CA12M'));
      await chartRepo.insert(createTestChart('US5CA13M'));
      
      await featureRepo.insertBatch([
        createTestFeature('US5CA12M', 'LIGHTS'),
        createTestFeature('US5CA12M', 'LIGHTS'),
        createTestFeature('US5CA12M', 'BOYLAT'),
        createTestFeature('US5CA13M', 'LIGHTS'),
        createTestFeature('US5CA13M', 'DEPARE')
      ]);
    });

    it('should count features by chart ID', async () => {
      const count = await featureRepo.countByChartId('US5CA12M');
      expect(count).toBe(3);
    });

    it('should get object class statistics', async () => {
      const stats = await featureRepo.getObjectClassStats();
      expect(stats).toHaveLength(3);
      
      const lightsStats = stats.find(s => s.object_class === 'LIGHTS');
      expect(lightsStats?.count).toBe(3);
      
      const boylatStats = stats.find(s => s.object_class === 'BOYLAT');
      expect(boylatStats?.count).toBe(1);
    });

    it('should get feature count by chart', async () => {
      const chartStats = await featureRepo.getFeatureCountByChart();
      expect(chartStats).toHaveLength(2);
      
      const us5ca12m = chartStats.find(s => s.chart_id === 'US5CA12M');
      expect(us5ca12m?.feature_count).toBe(3);
      
      const us5ca13m = chartStats.find(s => s.chart_id === 'US5CA13M');
      expect(us5ca13m?.feature_count).toBe(2);
    });
  });

  describe('search operations', () => {
    beforeEach(async () => {
      await chartRepo.insert(createTestChart('US5CA12M'));
      
      await featureRepo.insertBatch([
        createTestFeature('US5CA12M', 'LIGHTS', {
          properties: JSON.stringify({
            OBJNAM: 'Golden Gate Bridge Light',
            LITCHR: '1',
            COLOUR: '1'
          })
        }),
        createTestFeature('US5CA12M', 'LIGHTS', {
          properties: JSON.stringify({
            OBJNAM: 'Alcatraz Light',
            LITCHR: '2',
            COLOUR: '3'
          })
        }),
        createTestFeature('US5CA12M', 'BOYLAT', {
          properties: JSON.stringify({
            OBJNAM: 'Channel Marker 1',
            COLOUR: '3',
            BOYSHP: 1
          })
        })
      ]);
    });

    it('should search features by property value', async () => {
      const features = await featureRepo.searchByProperty('COLOUR', '3');
      expect(features).toHaveLength(2);
      expect(features.every(f => {
        const props = JSON.parse(f.properties || '{}');
        return props.COLOUR === '3';
      })).toBe(true);
    });

    it('should search features by object name', async () => {
      const features = await featureRepo.searchByObjectName('Gate');
      expect(features).toHaveLength(1);
      expect(JSON.parse(features[0].properties || '{}').OBJNAM).toContain('Golden Gate');
    });
  });
});