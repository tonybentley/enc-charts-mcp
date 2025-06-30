import { describe, it, expect, beforeEach } from '@jest/globals';
import { CoastlineStitcher } from './CoastlineStitcher.js';
import { Feature, LineString } from 'geojson';
import { DEFAULT_STITCHING_TOLERANCE } from '../../constants/coastline.js';

describe('CoastlineStitcher', () => {
  let stitcher: CoastlineStitcher;

  beforeEach(() => {
    stitcher = new CoastlineStitcher();
  });

  const createLineString = (coords: number[][]): Feature<LineString> => ({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords
    },
    properties: {}
  });

  describe('findConnectableEndpoints', () => {
    it('should find segments that can be connected', () => {
      const segments = [
        createLineString([[-122.5, 47.5], [-122.4, 47.5]]),
        createLineString([[-122.4, 47.5], [-122.3, 47.5]]), // Connects to first
        createLineString([[-122.2, 47.6], [-122.1, 47.6]])  // Isolated
      ];

      const connections = stitcher.findConnectableEndpoints(segments, 10);

      expect(connections[0].connectsTo).toContain(1);
      expect(connections[1].connectsTo).toContain(0);
      expect(connections[2].connectsTo).toHaveLength(0);
    });

    it('should respect tolerance when finding connections', () => {
      const segments = [
        createLineString([[-122.5, 47.5], [-122.4, 47.5]]),
        createLineString([[-122.4, 47.50001], [-122.3, 47.5]]) // Very close but not exact
      ];

      const strictConnections = stitcher.findConnectableEndpoints(segments, 1); // 1 meter
      expect(strictConnections[0].connectsTo).toHaveLength(0);

      const lenientConnections = stitcher.findConnectableEndpoints(segments, 20); // 20 meters
      expect(lenientConnections[0].connectsTo).toContain(1);
    });
  });

  describe('stitchSegments', () => {
    it('should stitch connectable segments', () => {
      const segments = [
        createLineString([[-122.5, 47.5], [-122.4, 47.5]]),
        createLineString([[-122.4, 47.5], [-122.3, 47.5]]),
        createLineString([[-122.3, 47.5], [-122.2, 47.5]])
      ];

      const stitched = stitcher.stitchSegments(segments, 10);

      expect(stitched).toHaveLength(1);
      expect(stitched[0].geometry.coordinates).toHaveLength(4);
      expect(stitched[0].properties?.stitched).toBe(true);
    });

    it('should handle segments that need reversal', () => {
      const segments = [
        createLineString([[-122.5, 47.5], [-122.4, 47.5]]),
        createLineString([[-122.3, 47.5], [-122.4, 47.5]]) // Reversed direction
      ];

      const stitched = stitcher.stitchSegments(segments, 10);

      expect(stitched).toHaveLength(1);
      expect(stitched[0].geometry.coordinates).toHaveLength(3);
    });

    it('should keep isolated segments separate', () => {
      const segments = [
        createLineString([[-122.5, 47.5], [-122.4, 47.5]]),
        createLineString([[-122.2, 47.6], [-122.1, 47.6]]) // Far away
      ];

      const stitched = stitcher.stitchSegments(segments, 10);

      expect(stitched).toHaveLength(2);
    });
  });

  describe('detectGaps', () => {
    it('should detect gaps between unconnected segments', () => {
      const segments = [
        createLineString([[-122.5, 47.5], [-122.4, 47.5]]),
        createLineString([[-122.39, 47.5], [-122.3, 47.5]]) // Small gap
      ];

      const gaps = stitcher.detectGaps(segments);

      expect(gaps.length).toBeGreaterThan(0);
      // Should have at least one gap that's reasonable for stitching
      const smallGaps = gaps.filter(g => g.distance_m < 2000);
      expect(smallGaps.length).toBeGreaterThan(0);
    });

    it('should not detect gaps for connected segments', () => {
      const segments = [
        createLineString([[-122.5, 47.5], [-122.4, 47.5]]),
        createLineString([[-122.4, 47.5], [-122.3, 47.5]])
      ];

      const gaps = stitcher.detectGaps(segments);

      // Connected segments shouldn't have small gaps
      const smallGaps = gaps.filter(g => g.distance_m < DEFAULT_STITCHING_TOLERANCE);
      expect(smallGaps).toHaveLength(0);
    });

    it('should sort gaps by distance', () => {
      const segments = [
        createLineString([[-122.5, 47.5], [-122.4, 47.5]]),    // End: -122.4
        createLineString([[-122.3, 47.5], [-122.2, 47.5]]),    // Start: -122.3, gap ~7km
        createLineString([[-122.05, 47.5], [-121.95, 47.5]])   // Start: -122.05, gap ~11km
      ];

      const gaps = stitcher.detectGaps(segments);

      expect(gaps.length).toBeGreaterThan(0);
      for (let i = 1; i < gaps.length; i++) {
        expect(gaps[i].distance_m).toBeGreaterThanOrEqual(gaps[i - 1].distance_m);
      }
    });
  });

  describe('mergeConnectedSegments', () => {
    it('should merge all connected segments', () => {
      const segments = [
        createLineString([[-122.5, 47.5], [-122.4, 47.5]]),
        createLineString([[-122.4, 47.5], [-122.3, 47.5]]),
        createLineString([[-122.2, 47.6], [-122.1, 47.6]]),
        createLineString([[-122.3, 47.5], [-122.25, 47.5]])
      ];

      const merged = stitcher.mergeConnectedSegments(segments);

      // Should have groups based on actual connections
      expect(merged.length).toBeGreaterThan(0);
      
      // Each segment should have stitched property
      merged.forEach(segment => {
        expect(segment.properties?.stitched).toBe(true);
      });
    });

    it('should handle empty input', () => {
      const merged = stitcher.mergeConnectedSegments([]);
      expect(merged).toHaveLength(0);
    });

    it('should handle single segment', () => {
      const segments = [
        createLineString([[-122.5, 47.5], [-122.4, 47.5]])
      ];

      const merged = stitcher.mergeConnectedSegments(segments);
      expect(merged).toHaveLength(1);
      expect(merged[0].geometry).toEqual(segments[0].geometry);
      expect(merged[0].properties?.stitched).toBe(true);
    });
  });
});