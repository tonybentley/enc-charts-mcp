import { describe, it, expect, beforeEach } from '@jest/globals';
import { CoastlineExtractor } from './CoastlineExtractor.js';
import { Feature, LineString, Polygon } from 'geojson';

describe('CoastlineExtractor', () => {
  let extractor: CoastlineExtractor;

  beforeEach(() => {
    extractor = new CoastlineExtractor();
  });

  describe('extractFromDepthAreas', () => {
    it('should extract coastline from 0-depth DEPARE features', () => {
      const depthArea: Feature<Polygon> = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-122.5, 47.5],
            [-122.4, 47.5],
            [-122.4, 47.6],
            [-122.5, 47.6],
            [-122.5, 47.5]
          ]]
        },
        properties: {
          _featureType: 'DEPARE',
          DRVAL1: 0,
          DRVAL2: 10
        }
      };

      const result = extractor.extractFromDepthAreas([depthArea]);
      
      expect(result).toHaveLength(1);
      expect(result[0].geometry.type).toBe('LineString');
      expect(result[0].properties?.source).toBe('derived');
      expect(result[0].properties?.sourceFeatures).toContain('DEPARE');
    });

    it('should ignore non-zero depth areas', () => {
      const depthArea: Feature<Polygon> = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-122.5, 47.5],
            [-122.4, 47.5],
            [-122.4, 47.6],
            [-122.5, 47.6],
            [-122.5, 47.5]
          ]]
        },
        properties: {
          _featureType: 'DEPARE',
          DRVAL1: 10,
          DRVAL2: 20
        }
      };

      const result = extractor.extractFromDepthAreas([depthArea]);
      expect(result).toHaveLength(0);
    });
  });

  describe('extractFromLandAreas', () => {
    it('should extract coastline from LNDARE features', () => {
      const landArea: Feature<Polygon> = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-122.5, 47.5],
            [-122.4, 47.5],
            [-122.4, 47.6],
            [-122.5, 47.6],
            [-122.5, 47.5]
          ]]
        },
        properties: {
          _featureType: 'LNDARE',
          OBJNAM: 'Harbor Island'
        }
      };

      const result = extractor.extractFromLandAreas([landArea]);
      
      expect(result).toHaveLength(1);
      expect(result[0].geometry.type).toBe('LineString');
      expect(result[0].properties?.source).toBe('derived');
      expect(result[0].properties?.sourceFeatures).toContain('LNDARE');
    });
  });

  describe('extractExplicitCoastlines', () => {
    it('should extract explicit COALNE features', () => {
      const coastline: Feature<LineString> = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.5, 47.5],
            [-122.4, 47.5],
            [-122.4, 47.6]
          ]
        },
        properties: {
          _featureType: 'COALNE'
        }
      };

      const result = extractor.extractExplicitCoastlines([coastline]);
      
      expect(result).toHaveLength(1);
      expect(result[0].properties?.source).toBe('explicit');
      expect(result[0].properties?.type).toBe('coastline');
    });

    it('should identify shoreline construction', () => {
      const slcons: Feature<LineString> = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.5, 47.5],
            [-122.4, 47.5]
          ]
        },
        properties: {
          _featureType: 'SLCONS',
          CATSLC: 6 // Pier
        }
      };

      const result = extractor.extractExplicitCoastlines([slcons]);
      
      expect(result).toHaveLength(1);
      expect(result[0].properties?.source).toBe('explicit');
      expect(result[0].properties?.type).toBe('constructed');
    });
  });

  describe('classifyCoastlineType', () => {
    it('should classify closed loops as islands', () => {
      const closedLine: Feature<LineString> = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.5, 47.5],
            [-122.4, 47.5],
            [-122.4, 47.6],
            [-122.5, 47.6],
            [-122.5, 47.5]
          ]
        },
        properties: {}
      };

      const result = extractor.classifyCoastlineType(closedLine, []);
      expect(result).toBe('island');
    });

    it('should classify open lines as mainland', () => {
      const openLine: Feature<LineString> = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.5, 47.5],
            [-122.4, 47.5],
            [-122.3, 47.6],
            [-122.2, 47.7]
          ]
        },
        properties: {}
      };

      const result = extractor.classifyCoastlineType(openLine, []);
      expect(result).toBe('mainland');
    });

    it('should classify based on SLCONS category', () => {
      const pier: Feature<LineString> = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.5, 47.5],
            [-122.4, 47.5]
          ]
        },
        properties: {
          sourceFeatures: ['SLCONS'],
          originalProperties: {
            CATSLC: 6
          }
        }
      };

      const result = extractor.classifyCoastlineType(pier, []);
      expect(result).toBe('pier');
    });
  });

  describe('extractAllCoastlines', () => {
    it('should combine coastlines from multiple sources', () => {
      const features: Feature[] = [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[-122.5, 47.5], [-122.4, 47.5]]
          },
          properties: { _featureType: 'COALNE' }
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-122.3, 47.3],
              [-122.2, 47.3],
              [-122.2, 47.4],
              [-122.3, 47.4],
              [-122.3, 47.3]
            ]]
          },
          properties: { _featureType: 'DEPARE', DRVAL1: 0 }
        }
      ];

      const result = extractor.extractAllCoastlines(features, {
        useCoastlines: true,
        useDepthAreas: true,
        useLandAreas: false,
        useShorelineConstruction: false
      });

      expect(result).toHaveLength(2);
      expect(result.find(f => f.properties?.source === 'explicit')).toBeDefined();
      expect(result.find(f => f.properties?.source === 'derived')).toBeDefined();
    });

    it('should deduplicate identical coastlines', () => {
      const line: Feature<LineString> = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[-122.5, 47.5], [-122.4, 47.5]]
        },
        properties: { _featureType: 'COALNE' }
      };

      const result = extractor.extractAllCoastlines([line, line], {
        useCoastlines: true,
        useDepthAreas: false,
        useLandAreas: false,
        useShorelineConstruction: false
      });

      expect(result).toHaveLength(1);
    });
  });
});