import { Position, LineString, Polygon, Feature } from 'geojson';
import { COORDINATE_PRECISION } from '../../constants/coastline.js';

export class GeometryUtils {
  static pointsEqual(p1: Position, p2: Position, tolerance: number = 0.0001): boolean {
    const [lon1, lat1] = p1;
    const [lon2, lat2] = p2;
    return Math.abs(lon1 - lon2) < tolerance && Math.abs(lat1 - lat2) < tolerance;
  }

  static distance(p1: Position, p2: Position): number {
    const [lon1, lat1] = p1;
    const [lon2, lat2] = p2;
    const R = 6371000; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  static bearing(p1: Position, p2: Position): number {
    const [lon1, lat1] = p1;
    const [lon2, lat2] = p2;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
      Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

    const θ = Math.atan2(y, x);
    return (θ * 180 / Math.PI + 360) % 360;
  }

  static lineLength(line: LineString): number {
    const coords = line.coordinates;
    let length = 0;
    for (let i = 1; i < coords.length; i++) {
      length += this.distance(coords[i - 1], coords[i]);
    }
    return length;
  }

  static averageBearing(line: LineString): number {
    const coords = line.coordinates;
    if (coords.length < 2) return 0;

    let totalX = 0;
    let totalY = 0;
    
    for (let i = 1; i < coords.length; i++) {
      const bearing = this.bearing(coords[i - 1], coords[i]);
      const radians = bearing * Math.PI / 180;
      totalX += Math.cos(radians);
      totalY += Math.sin(radians);
    }

    const avgRadians = Math.atan2(totalY, totalX);
    return (avgRadians * 180 / Math.PI + 360) % 360;
  }

  static isClockwise(polygon: Polygon): boolean {
    const coords = polygon.coordinates[0];
    let sum = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const [x1, y1] = coords[i];
      const [x2, y2] = coords[i + 1];
      sum += (x2 - x1) * (y2 + y1);
    }
    return sum > 0;
  }

  static reverseLineString(line: LineString): LineString {
    return {
      type: 'LineString',
      coordinates: [...line.coordinates].reverse()
    };
  }

  static roundCoordinates(coords: Position[]): Position[] {
    return coords.map(coord => [
      Math.round(coord[0] * Math.pow(10, COORDINATE_PRECISION)) / Math.pow(10, COORDINATE_PRECISION),
      Math.round(coord[1] * Math.pow(10, COORDINATE_PRECISION)) / Math.pow(10, COORDINATE_PRECISION),
      ...(coord.length > 2 ? [coord[2]] : [])
    ]);
  }

  static boundingBox(features: Feature[]): [number, number, number, number] | null {
    if (features.length === 0) return null;

    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;

    features.forEach(feature => {
      if (!feature.geometry) return;

      const processCoords = (coords: any) => {
        if (Array.isArray(coords[0])) {
          if (Array.isArray(coords[0][0])) {
            coords.forEach(processCoords);
          } else {
            coords.forEach((coord: Position) => {
              minLon = Math.min(minLon, coord[0]);
              maxLon = Math.max(maxLon, coord[0]);
              minLat = Math.min(minLat, coord[1]);
              maxLat = Math.max(maxLat, coord[1]);
            });
          }
        } else {
          minLon = Math.min(minLon, coords[0]);
          maxLon = Math.max(maxLon, coords[0]);
          minLat = Math.min(minLat, coords[1]);
          maxLat = Math.max(maxLat, coords[1]);
        }
      };

      if ('coordinates' in feature.geometry) {
        processCoords((feature.geometry as any).coordinates);
      }
    });

    return [minLon, minLat, maxLon, maxLat];
  }

  static metersToNauticalMiles(meters: number): number {
    return meters / 1852;
  }

  static kilometersToSquareKilometers(km: number): number {
    return km * km;
  }

  static calculatePolygonArea(polygon: Polygon): number {
    const coords = polygon.coordinates[0];
    let area = 0;
    
    for (let i = 0; i < coords.length - 1; i++) {
      const [lon1, lat1] = coords[i];
      const [lon2, lat2] = coords[i + 1];
      
      // Convert to radians
      const φ1 = lat1 * Math.PI / 180;
      const φ2 = lat2 * Math.PI / 180;
      const Δλ = (lon2 - lon1) * Math.PI / 180;
      
      // Spherical excess formula
      area += Δλ * (2 + Math.sin(φ1) + Math.sin(φ2));
    }
    
    // Earth radius squared in km²
    const R2 = 6371 * 6371;
    return Math.abs(area) * R2 / 2;
  }

  static isPointInPolygon(point: [number, number], polygon: Polygon): boolean {
    const [x, y] = point;
    const coords = polygon.coordinates[0]; // Outer ring only for now
    
    let inside = false;
    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      const [xi, yi] = coords[i];
      const [xj, yj] = coords[j];
      
      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }
}