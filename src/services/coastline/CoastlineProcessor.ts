import { Feature, LineString, Polygon, Position } from 'geojson';
import simplify from '@turf/simplify';
import length from '@turf/length';
import bearing from '@turf/bearing';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import * as turf from '@turf/helpers';
import { CoastlineMetrics, WaterSide, CoastlineFeature, CoastlineProperties } from '../../types/coastline.js';
import { GeometryUtils } from '../geometry/GeometryUtils.js';
import { DEFAULT_SIMPLIFICATION_TOLERANCE, COORDINATE_PRECISION } from '../../constants/coastline.js';

export class CoastlineProcessor {
  simplifyCoastline(line: Feature<LineString>, tolerance: number = DEFAULT_SIMPLIFICATION_TOLERANCE): Feature<LineString> {
    try {
      // Use Turf's simplify with high quality settings
      const simplified = simplify(line, {
        tolerance: tolerance / 111320, // Convert meters to degrees (approximate)
        highQuality: true
      });
      
      // Ensure coordinates are properly rounded
      simplified.geometry.coordinates = GeometryUtils.roundCoordinates(simplified.geometry.coordinates);
      
      return simplified as Feature<LineString>;
    } catch (error) {
      console.error('Error simplifying coastline:', error);
      return line;
    }
  }

  smoothCoastline(line: Feature<LineString>, iterations: number = 1): Feature<LineString> {
    let smoothed = line;
    
    for (let i = 0; i < iterations; i++) {
      const coords = smoothed.geometry.coordinates;
      const newCoords: Position[] = [];
      
      // Keep first point
      newCoords.push(coords[0]);
      
      // Apply moving average for interior points
      for (let j = 1; j < coords.length - 1; j++) {
        const prev = coords[j - 1];
        const curr = coords[j];
        const next = coords[j + 1];
        
        const avgLon = (prev[0] + curr[0] * 2 + next[0]) / 4;
        const avgLat = (prev[1] + curr[1] * 2 + next[1]) / 4;
        
        newCoords.push([avgLon, avgLat]);
      }
      
      // Keep last point
      newCoords.push(coords[coords.length - 1]);
      
      smoothed = {
        ...smoothed,
        geometry: {
          type: 'LineString',
          coordinates: GeometryUtils.roundCoordinates(newCoords)
        }
      };
    }
    
    return smoothed;
  }

  determineWaterSide(line: Feature<LineString>, waterFeatures: Feature<Polygon>[]): WaterSide {
    if (waterFeatures.length === 0) return 'unknown';
    
    const coords = line.geometry.coordinates;
    if (coords.length < 2) return 'unknown';
    
    // Sample points along the line
    const sampleIndices = this.getSampleIndices(coords.length, 5); // Sample up to 5 points
    let leftWaterCount = 0;
    let rightWaterCount = 0;
    
    sampleIndices.forEach(index => {
      if (index >= coords.length - 1) return;
      
      const p1 = coords[index];
      const p2 = coords[index + 1];
      
      // Calculate perpendicular points on both sides
      const bearing = GeometryUtils.bearing(p1, p2);
      const leftBearing = (bearing - 90 + 360) % 360;
      const rightBearing = (bearing + 90) % 360;
      
      // Create test points 100m to each side
      const leftPoint = this.destinationPoint(p1, leftBearing, 100);
      const rightPoint = this.destinationPoint(p1, rightBearing, 100);
      
      // Check which side has water
      const leftInWater = this.isPointInWater(leftPoint, waterFeatures);
      const rightInWater = this.isPointInWater(rightPoint, waterFeatures);
      
      if (leftInWater) leftWaterCount++;
      if (rightInWater) rightWaterCount++;
    });
    
    // Determine water side based on majority
    if (leftWaterCount > rightWaterCount) return 'left';
    if (rightWaterCount > leftWaterCount) return 'right';
    return 'unknown';
  }

  calculateMetrics(line: Feature<LineString>): CoastlineMetrics {
    const coords = line.geometry.coordinates;
    
    // Validate coordinates
    if (!coords || coords.length < 2) {
      return {
        length_m: 0,
        length_nm: 0,
        orientation: 0,
        startPoint: coords?.[0] ? [coords[0][0], coords[0][1]] as [number, number] : [0, 0],
        endPoint: coords?.[coords.length - 1] ? [coords[coords.length - 1][0], coords[coords.length - 1][1]] as [number, number] : [0, 0]
      };
    }
    
    // Ensure 2D coordinates for turf - filter out any invalid coordinates
    const validCoords = coords.filter(coord => 
      Array.isArray(coord) && 
      coord.length >= 2 && 
      typeof coord[0] === 'number' && 
      typeof coord[1] === 'number' &&
      !isNaN(coord[0]) &&
      !isNaN(coord[1])
    );
    
    if (validCoords.length < 2) {
      return {
        length_m: 0,
        length_nm: 0,
        orientation: 0,
        startPoint: [coords[0][0], coords[0][1]] as [number, number],
        endPoint: [coords[coords.length - 1][0], coords[coords.length - 1][1]] as [number, number]
      };
    }
    
    const line2D: Feature<LineString> = {
      ...line,
      geometry: {
        type: 'LineString',
        coordinates: validCoords.map(coord => [coord[0], coord[1]] as [number, number])
      }
    };
    
    try {
      const lengthInKm = length(line2D, { units: 'kilometers' });
      const lengthInMeters = lengthInKm * 1000;
      const lengthInNm = GeometryUtils.metersToNauticalMiles(lengthInMeters);
      
      const orientation = validCoords.length >= 2 
        ? GeometryUtils.averageBearing(line2D.geometry)
        : 0;
      
      return {
        length_m: lengthInMeters,
        length_nm: lengthInNm,
        orientation,
        startPoint: [validCoords[0][0], validCoords[0][1]] as [number, number],
        endPoint: [validCoords[validCoords.length - 1][0], validCoords[validCoords.length - 1][1]] as [number, number]
      };
    } catch (error) {
      console.error('Error calculating metrics:', error);
      return {
        length_m: 0,
        length_nm: 0,
        orientation: 0,
        startPoint: [coords[0][0], coords[0][1]] as [number, number],
        endPoint: [coords[coords.length - 1][0], coords[coords.length - 1][1]] as [number, number]
      };
    }
  }

  processCoastline(
    coastline: Feature<LineString>,
    options: {
      simplify?: boolean;
      simplificationTolerance?: number;
      smooth?: boolean;
      smoothingIterations?: number;
      waterFeatures?: Feature<Polygon>[];
      includeMetrics?: boolean;
    } = {}
  ): CoastlineFeature {
    let processed = coastline;
    
    // Apply simplification
    if (options.simplify) {
      processed = this.simplifyCoastline(processed, options.simplificationTolerance);
    }
    
    // Apply smoothing
    if (options.smooth && options.smoothingIterations) {
      processed = this.smoothCoastline(processed, options.smoothingIterations);
    }
    
    // Calculate metrics
    const metrics = this.calculateMetrics(processed);
    
    // Determine water side
    const waterSide = options.waterFeatures 
      ? this.determineWaterSide(processed, options.waterFeatures)
      : 'unknown';
    
    // Build properties
    const properties: CoastlineProperties = {
      type: coastline.properties?.type || 'coastline',
      subType: coastline.properties?.subType || 'mainland',
      source: coastline.properties?.source || 'derived',
      sourceFeatures: coastline.properties?.sourceFeatures || [],
      ...metrics,
      waterSide,
      simplified: options.simplify || false,
      continuous: this.isContinuous(processed),
      gapCount: 0, // Will be updated by stitcher
      stitched: coastline.properties?.stitched || false
    };
    
    return {
      ...processed,
      properties
    } as CoastlineFeature;
  }

  estimateResponseSize(features: Feature[]): number {
    let totalChars = 0;
    
    features.forEach(feature => {
      // Estimate geometry size
      const coordCount = this.countCoordinates(feature.geometry);
      const coordChars = coordCount * 30; // ~30 chars per coordinate pair with precision
      
      // Estimate properties size
      const propsChars = JSON.stringify(feature.properties || {}).length;
      
      // Add feature wrapper overhead
      totalChars += coordChars + propsChars + 100;
    });
    
    // Add collection wrapper overhead
    totalChars += 200;
    
    return totalChars;
  }

  reduceCoordinatePrecision(features: Feature[]): Feature[] {
    return features.map(feature => ({
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: this.reducePrecision((feature.geometry as any).coordinates)
      } as any
    }));
  }

  private getSampleIndices(length: number, maxSamples: number): number[] {
    if (length <= maxSamples) {
      return Array.from({ length: length - 1 }, (_, i) => i);
    }
    
    const step = Math.floor(length / maxSamples);
    return Array.from({ length: maxSamples }, (_, i) => i * step);
  }

  private destinationPoint(start: Position, bearing: number, distance: number): Position {
    const R = 6371000; // Earth radius in meters
    const d = distance / R;
    const θ = bearing * Math.PI / 180;
    const φ1 = start[1] * Math.PI / 180;
    const λ1 = start[0] * Math.PI / 180;
    
    const φ2 = Math.asin(
      Math.sin(φ1) * Math.cos(d) +
      Math.cos(φ1) * Math.sin(d) * Math.cos(θ)
    );
    
    const λ2 = λ1 + Math.atan2(
      Math.sin(θ) * Math.sin(d) * Math.cos(φ1),
      Math.cos(d) - Math.sin(φ1) * Math.sin(φ2)
    );
    
    return [
      λ2 * 180 / Math.PI,
      φ2 * 180 / Math.PI
    ];
  }

  private isPointInWater(point: Position, waterFeatures: Feature<Polygon>[]): boolean {
    // Ensure 2D coordinates and validate
    if (!Array.isArray(point) || point.length < 2 || 
        typeof point[0] !== 'number' || typeof point[1] !== 'number' ||
        isNaN(point[0]) || isNaN(point[1])) {
      return false;
    }
    
    const point2D: [number, number] = [point[0], point[1]];
    const testPoint = turf.point(point2D);
    
    return waterFeatures.some(waterFeature => {
      try {
        // Handle both Polygon and MultiPolygon water features
        if (waterFeature.geometry.type === 'Polygon' || waterFeature.geometry.type === 'MultiPolygon') {
          return booleanPointInPolygon(testPoint, waterFeature);
        }
        return false;
      } catch {
        return false;
      }
    });
  }

  private isContinuous(line: Feature<LineString>): boolean {
    const coords = line.geometry.coordinates;
    if (coords.length < 2) return true;
    
    // Check if it's a closed loop
    return GeometryUtils.pointsEqual(
      coords[0],
      coords[coords.length - 1],
      0.0001
    );
  }

  private countCoordinates(geometry: any): number {
    if (!geometry) return 0;
    
    if ('coordinates' in geometry) {
      const coords = geometry.coordinates;
      if (geometry.type === 'Point') return 1;
      if (geometry.type === 'LineString') return coords.length;
      if (geometry.type === 'Polygon') return coords.reduce((sum: number, ring: any) => sum + ring.length, 0);
      if (geometry.type === 'MultiLineString') return coords.reduce((sum: number, line: any) => sum + line.length, 0);
      if (geometry.type === 'MultiPolygon') {
        return coords.reduce((sum: number, poly: any) => 
          sum + poly.reduce((pSum: number, ring: any) => pSum + ring.length, 0), 0
        );
      }
    }
    
    return 0;
  }

  private reducePrecision(coords: any): any {
    if (Array.isArray(coords)) {
      if (typeof coords[0] === 'number') {
        // Single coordinate
        return [
          Math.round(coords[0] * Math.pow(10, COORDINATE_PRECISION)) / Math.pow(10, COORDINATE_PRECISION),
          Math.round(coords[1] * Math.pow(10, COORDINATE_PRECISION)) / Math.pow(10, COORDINATE_PRECISION),
          ...(coords.length > 2 ? [coords[2]] : [])
        ];
      } else {
        // Nested coordinates
        return coords.map((c: any) => this.reducePrecision(c));
      }
    }
    return coords;
  }
}