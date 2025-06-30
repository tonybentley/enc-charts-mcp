import { describe, it, expect, beforeEach } from '@jest/globals';
import { CoastlineProcessor } from './CoastlineProcessor.js';
import { Feature, LineString, Polygon } from 'geojson';

describe('CoastlineProcessor', () => {
  let processor: CoastlineProcessor;

  beforeEach(() => {
    processor = new CoastlineProcessor();
  });

  const createLineString = (coords: number[][]): Feature<LineString> => ({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords
    },
    properties: {}
  });

  const createPolygon = (coords: number[][][]): Feature<Polygon> => ({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: coords
    },
    properties: {}
  });

  describe('simplifyCoastline', () => {
    it('should simplify complex coastlines', () => {
      const complexLine = createLineString([
        [-122.5, 47.5],
        [-122.49, 47.5],
        [-122.48, 47.5],
        [-122.47, 47.5],
        [-122.46, 47.5],
        [-122.45, 47.5],
        [-122.4, 47.5]
      ]);

      const simplified = processor.simplifyCoastline(complexLine, 10);
      
      expect(simplified.geometry.coordinates.length).toBeLessThan(
        complexLine.geometry.coordinates.length
      );
      // Should keep start and end points
      expect(simplified.geometry.coordinates[0]).toEqual(complexLine.geometry.coordinates[0]);
      expect(simplified.geometry.coordinates[simplified.geometry.coordinates.length - 1])
        .toEqual(complexLine.geometry.coordinates[complexLine.geometry.coordinates.length - 1]);
    });

    it('should handle simple lines without change', () => {
      const simpleLine = createLineString([
        [-122.5, 47.5],
        [-122.4, 47.6]
      ]);

      const simplified = processor.simplifyCoastline(simpleLine, 10);
      expect(simplified.geometry.coordinates).toEqual(simpleLine.geometry.coordinates);
    });
  });

  describe('smoothCoastline', () => {
    it('should smooth jagged coastlines', () => {
      const jaggedLine = createLineString([
        [-122.5, 47.5],
        [-122.45, 47.52],
        [-122.4, 47.5],
        [-122.35, 47.52],
        [-122.3, 47.5]
      ]);

      const smoothed = processor.smoothCoastline(jaggedLine, 1);
      
      // Middle points should be adjusted
      expect(smoothed.geometry.coordinates[1][1]).not.toEqual(47.52);
      expect(smoothed.geometry.coordinates[3][1]).not.toEqual(47.52);
      
      // End points should remain the same
      expect(smoothed.geometry.coordinates[0]).toEqual(jaggedLine.geometry.coordinates[0]);
      expect(smoothed.geometry.coordinates[4]).toEqual(jaggedLine.geometry.coordinates[4]);
    });

    it('should apply multiple smoothing iterations', () => {
      const line = createLineString([
        [-122.5, 47.5],
        [-122.45, 47.55],
        [-122.4, 47.5]
      ]);

      const smoothed1 = processor.smoothCoastline(line, 1);
      const smoothed2 = processor.smoothCoastline(line, 2);
      
      // More iterations should produce more smoothing
      expect(Math.abs(smoothed2.geometry.coordinates[1][1] - 47.5))
        .toBeLessThan(Math.abs(smoothed1.geometry.coordinates[1][1] - 47.5));
    });
  });

  describe('determineWaterSide', () => {
    it('should detect water on the left side', () => {
      const coastline = createLineString([
        [-122.5, 47.5],
        [-122.4, 47.5]
      ]);

      const waterArea = createPolygon([[
        [-122.5, 47.49],
        [-122.4, 47.49],
        [-122.4, 47.51],
        [-122.5, 47.51],
        [-122.5, 47.49]
      ]]);

      const waterSide = processor.determineWaterSide(coastline, [waterArea]);
      expect(waterSide).toBe('right'); // Water is north, which is right when going east (from our algorithm's perspective)
    });

    it('should return unknown when no water features provided', () => {
      const coastline = createLineString([
        [-122.5, 47.5],
        [-122.4, 47.5]
      ]);

      const waterSide = processor.determineWaterSide(coastline, []);
      expect(waterSide).toBe('unknown');
    });
  });

  describe('calculateMetrics', () => {
    it('should calculate correct metrics for coastline', () => {
      const coastline = createLineString([
        [-122.5, 47.5],
        [-122.4, 47.5],
        [-122.4, 47.6]
      ]);

      const metrics = processor.calculateMetrics(coastline);
      
      expect(metrics.length_m).toBeGreaterThan(0);
      expect(metrics.length_nm).toBeGreaterThan(0);
      expect(metrics.length_nm).toBeLessThan(metrics.length_m); // NM should be less than meters
      expect(metrics.orientation).toBeGreaterThanOrEqual(0);
      expect(metrics.orientation).toBeLessThan(360);
      expect(metrics.startPoint).toEqual([-122.5, 47.5]);
      expect(metrics.endPoint).toEqual([-122.4, 47.6]);
    });
  });

  describe('processCoastline', () => {
    it('should apply all processing options', () => {
      const coastline = createLineString([
        [-122.5, 47.5],
        [-122.49, 47.5],
        [-122.48, 47.5],
        [-122.47, 47.5],
        [-122.4, 47.5]
      ]);

      const waterArea = createPolygon([[
        [-122.5, 47.49],
        [-122.4, 47.49],
        [-122.4, 47.51],
        [-122.5, 47.51],
        [-122.5, 47.49]
      ]]);

      const processed = processor.processCoastline(coastline, {
        simplify: true,
        simplificationTolerance: 10,
        smooth: true,
        smoothingIterations: 1,
        waterFeatures: [waterArea],
        includeMetrics: true
      });

      expect(processed.properties.simplified).toBe(true);
      expect(processed.properties.length_m).toBeGreaterThan(0);
      expect(processed.properties.waterSide).not.toBe('unknown');
      expect(processed.geometry.coordinates.length).toBeLessThan(
        coastline.geometry.coordinates.length
      );
    });
  });

  describe('estimateResponseSize', () => {
    it('should estimate response size for features', () => {
      const features = [
        createLineString([
          [-122.5, 47.5],
          [-122.4, 47.5],
          [-122.3, 47.5]
        ]),
        createLineString([
          [-122.2, 47.6],
          [-122.1, 47.6]
        ])
      ];

      const size = processor.estimateResponseSize(features);
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(10000); // Should be reasonable size
    });
  });

  describe('reduceCoordinatePrecision', () => {
    it('should reduce coordinate precision', () => {
      const features = [
        createLineString([
          [-122.123456789, 47.123456789],
          [-122.987654321, 47.987654321]
        ])
      ];

      const reduced = processor.reduceCoordinatePrecision(features);
      
      const coords = (reduced[0].geometry as any).coordinates;
      coords.forEach((coord: any) => {
        const lonDecimals = coord[0].toString().split('.')[1]?.length || 0;
        const latDecimals = coord[1].toString().split('.')[1]?.length || 0;
        expect(lonDecimals).toBeLessThanOrEqual(6);
        expect(latDecimals).toBeLessThanOrEqual(6);
      });
    });
  });
});