import gdal from '../parsers/s57-adapter.js';
import path from 'path';
import { S57Properties } from '../types/enc.js';
import { Feature, FeatureCollection, Geometry, Point, LineString, Polygon } from 'geojson';

// Type definitions for GDAL geometry objects
interface GDALGeometry {
  wkbType?: number;
  x?: number;
  y?: number;
  z?: number;
}

interface GDALGeometryWithSRS extends GDALGeometry {
  srs: GDALSpatialReference;
}

interface GDALGeometryWithTransform extends GDALGeometry {
  transform(transformation: unknown): void;
}

interface GDALGeometryWithType extends GDALGeometry {
  wkbType: number;
}

interface GDALSpatialReference {
  isSame(other: unknown): boolean;
}

interface GDALPoint extends GDALGeometry {
  x: number;
  y: number;
  z?: number;
}

interface GDALLineString extends GDALGeometry {
  points: {
    toArray(): Array<{ x: number; y: number; z?: number }>;
  };
}

interface GDALPolygon extends GDALGeometry {
  rings: {
    count(): number;
    get(index: number): {
      points: {
        toArray(): Array<{ x: number; y: number; z?: number }>;
      };
    };
  };
}

interface GDALMultiGeometry extends GDALGeometry {
  children: GDALGeometry[];
}

export interface S57ParseOptions {
  featureTypes?: string[];
  boundingBox?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  depthRange?: {
    min: number;
    max: number;
  };
}

export class S57Parser {
  /**
   * Parse an S-57 file and extract features
   */
  async parseChart(filePath: string, options: S57ParseOptions = {}): Promise<FeatureCollection> {
    try {
      // Open the S-57 file using GDAL
      const dataset = await gdal.openAsync(filePath);
      
      const features: Feature[] = [];
      
      // Iterate through all layers in the dataset
      const layerCount = dataset.layers.count();
      
      for (let i = 0; i < layerCount; i++) {
        const layer = await dataset.layers.get(i);
        const layerName = layer.name;
        
        // Skip if feature type filtering is requested and this layer doesn't match
        if (options.featureTypes && !options.featureTypes.includes(layerName)) {
          continue;
        }
        
        // Apply spatial filter if bounding box is provided
        if (options.boundingBox) {
          const { minLon, minLat, maxLon, maxLat } = options.boundingBox;
          layer.setSpatialFilter(minLon, minLat, maxLon, maxLat);
        }
        
        // Process features in the layer using async iterator
        for await (const feature of layer.features) {
          const geoJsonFeature = await this.convertFeatureToGeoJSON(feature, layerName);
          
          if (geoJsonFeature) {
            // Apply depth range filter if specified
            if (options.depthRange && this.isDepthFeature(layerName)) {
              if (!this.passesDepthFilter(geoJsonFeature.properties as S57Properties, options.depthRange)) {
                continue;
              }
            }
            
            features.push(geoJsonFeature);
          }
        }
      }
      
      return {
        type: 'FeatureCollection',
        features
      };
    } catch (error) {
      throw new Error(`Failed to parse S-57 file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get available feature types in an S-57 file
   */
  async getAvailableFeatureTypes(filePath: string): Promise<string[]> {
    try {
      const dataset = await gdal.openAsync(filePath);
      const featureTypes: string[] = [];
      
      const layerCount = dataset.layers.count();
      for (let i = 0; i < layerCount; i++) {
        const layer = await dataset.layers.get(i);
        featureTypes.push(layer.name);
      }
      
      return featureTypes;
    } catch (error) {
      throw new Error(`Failed to read feature types: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse a specific feature type from an S-57 file
   */
  async parseFeatureType(
    filePath: string,
    featureType: string,
    options: Omit<S57ParseOptions, 'featureTypes'> = {}
  ): Promise<Feature[]> {
    const result = await this.parseChart(filePath, {
      ...options,
      featureTypes: [featureType]
    });
    
    return result.features;
  }

  /**
   * Convert GDAL feature to GeoJSON
   */
  private async convertFeatureToGeoJSON(
    gdalFeature: { getGeometry(): unknown; fields: { toObject(): Record<string, unknown> } },
    layerName: string
  ): Promise<Feature | null> {
    try {
      const geometry = gdalFeature.getGeometry() as GDALGeometry | null;
      if (!geometry) return null;
      
      // Convert GDAL geometry to GeoJSON
      const geoJsonGeometry = this.convertGeometry(geometry);
      if (!geoJsonGeometry) return null;
      
      // Extract properties
      const properties: S57Properties = {
        _featureType: layerName
      };
      
      // Get all field values
      const fields = gdalFeature.fields.toObject();
      for (const [key, value] of Object.entries(fields)) {
        if (value !== null && value !== undefined) {
          properties[key] = value;
        }
      }
      
      // Create feature ID
      const id = properties.LNAM || `${layerName}_${Date.now()}_${Math.random()}`;
      
      const feature: Feature = {
        type: 'Feature',
        id,
        geometry: geoJsonGeometry,
        properties
      };
      
      return feature;
    } catch (error) {
      // Error converting feature - silently return null
      return null;
    }
  }

  /**
   * Convert GDAL geometry to GeoJSON geometry
   */
  private convertGeometry(gdalGeometry: GDALGeometry): Geometry | null {
    try {
      // Transform to WGS84 if needed
      const srs = (gdalGeometry as GDALGeometryWithSRS).srs;
      if (srs && !srs.isSame(gdal.SpatialReference.fromEPSG(4326))) {
        const transformation = new gdal.CoordinateTransformation(
          srs,
          gdal.SpatialReference.fromEPSG(4326)
        );
        (gdalGeometry as GDALGeometryWithTransform).transform(transformation);
      }
      
      // Convert based on geometry type
      const wkbType = (gdalGeometry as GDALGeometryWithType).wkbType;
      
      switch (wkbType) {
        case gdal.wkbPoint:
        case gdal.wkbPoint25D:
          return this.convertPoint(gdalGeometry as GDALPoint);
          
        case gdal.wkbLineString:
        case gdal.wkbLineString25D:
          return this.convertLineString(gdalGeometry as GDALLineString);
          
        case gdal.wkbPolygon:
        case gdal.wkbPolygon25D:
          return this.convertPolygon(gdalGeometry as GDALPolygon);
          
        case gdal.wkbMultiPoint:
        case gdal.wkbMultiPoint25D:
          return this.convertMultiPoint(gdalGeometry as GDALMultiGeometry);
          
        case gdal.wkbMultiLineString:
        case gdal.wkbMultiLineString25D:
          return this.convertMultiLineString(gdalGeometry as GDALMultiGeometry);
          
        case gdal.wkbMultiPolygon:
        case gdal.wkbMultiPolygon25D:
          return this.convertMultiPolygon(gdalGeometry as GDALMultiGeometry);
          
        default:
          // Unsupported geometry type - silently return null
          return null;
      }
    } catch (error) {
      // Error converting geometry - silently return null
      return null;
    }
  }

  private convertPoint(geom: GDALPoint): Point {
    // Cast to gdal Point type which has x, y, z properties
    const coords = [geom.x, geom.y];
    if (geom.z !== undefined) coords.push(geom.z);
    return {
      type: 'Point',
      coordinates: coords
    };
  }

  private convertLineString(geom: GDALLineString): LineString {
    const points = geom.points;
    return {
      type: 'LineString',
      coordinates: points.toArray().map((pt) => {
        const coords: number[] = [pt.x, pt.y];
        if (pt.z !== undefined) coords.push(pt.z);
        return coords;
      })
    };
  }

  private convertPolygon(geom: GDALPolygon): Polygon {
    const rings: number[][][] = [];
    const gdalRings = geom.rings;
    const ringCount = gdalRings.count();
    
    for (let i = 0; i < ringCount; i++) {
      const ring = gdalRings.get(i);
      const points = ring.points.toArray();
      rings.push(points.map((pt) => {
        const coords: number[] = [pt.x, pt.y];
        if (pt.z !== undefined) coords.push(pt.z);
        return coords;
      }));
    }
    
    return {
      type: 'Polygon',
      coordinates: rings
    };
  }

  private convertMultiPoint(geom: GDALMultiGeometry): Geometry {
    const points: number[][] = [];
    const children = geom.children || [];
    
    children.forEach((child) => {
      if ((child as GDALGeometryWithType).wkbType === gdal.wkbPoint || (child as GDALGeometryWithType).wkbType === gdal.wkbPoint25D) {
        const coords: number[] = [(child as GDALPoint).x, (child as GDALPoint).y];
        if ((child as GDALPoint).z !== undefined) coords.push((child as GDALPoint).z as number);
        points.push(coords);
      }
    });
    
    return {
      type: 'MultiPoint',
      coordinates: points
    };
  }

  private convertMultiLineString(geom: GDALMultiGeometry): Geometry {
    const lines: number[][][] = [];
    const children = geom.children || [];
    
    children.forEach((child) => {
      if ((child as GDALGeometryWithType).wkbType === gdal.wkbLineString || (child as GDALGeometryWithType).wkbType === gdal.wkbLineString25D) {
        const lineString = this.convertLineString(child as GDALLineString);
        lines.push(lineString.coordinates);
      }
    });
    
    return {
      type: 'MultiLineString',
      coordinates: lines
    };
  }

  private convertMultiPolygon(geom: GDALMultiGeometry): Geometry {
    const polygons: number[][][][] = [];
    const children = geom.children || [];
    
    children.forEach((child) => {
      if ((child as GDALGeometryWithType).wkbType === gdal.wkbPolygon || (child as GDALGeometryWithType).wkbType === gdal.wkbPolygon25D) {
        const polygon = this.convertPolygon(child as GDALPolygon);
        polygons.push(polygon.coordinates);
      }
    });
    
    return {
      type: 'MultiPolygon',
      coordinates: polygons
    };
  }

  /**
   * Check if a feature type represents depth information
   */
  protected isDepthFeature(featureType: string): boolean {
    const depthFeatures = ['DEPARE', 'DEPCNT', 'SOUNDG', 'DRGARE'];
    return depthFeatures.includes(featureType);
  }

  /**
   * Check if a feature passes depth filter
   */
  protected passesDepthFilter(
    properties: S57Properties,
    depthRange: { min: number; max: number }
  ): boolean {
    // For depth areas
    if (properties.DRVAL1 !== undefined || properties.DRVAL2 !== undefined) {
      const minDepth = properties.DRVAL1 || 0;
      const maxDepth = properties.DRVAL2 || Number.MAX_VALUE;
      
      // Check if depth area overlaps with requested range
      return !(maxDepth < depthRange.min || minDepth > depthRange.max);
    }
    
    // For depth contours
    if (properties.VALDCO !== undefined) {
      return properties.VALDCO >= depthRange.min && properties.VALDCO <= depthRange.max;
    }
    
    // For soundings
    if (properties.VALSOU !== undefined) {
      return properties.VALSOU >= depthRange.min && properties.VALSOU <= depthRange.max;
    }
    
    return true;
  }

  /**
   * Extract chart metadata from S-57 file
   */
  async getChartMetadata(filePath: string): Promise<{
    name: string;
    scale?: number;
    issueDate?: string;
    updateDate?: string;
    bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  }> {
    try {
      const dataset = await gdal.openAsync(filePath);
      
      // Get dataset metadata
      const metadata = dataset.getMetadata();
      
      // Get bounds from layers
      let bounds;
      try {
        // Try to get extent from the first layer with valid extent
        const layerCount = dataset.layers.count();
        for (let i = 0; i < layerCount; i++) {
          const layer = await dataset.layers.get(i);
          try {
            const extent = await layer.getExtent(); // Our adapter returns Promise
            if (extent) {
              bounds = {
                minLon: extent.minX,
                maxLon: extent.maxX,
                minLat: extent.minY,
                maxLat: extent.maxY
              };
              break;
            }
          } catch (e) {
            // Continue to next layer
          }
        }
      } catch (e) {
        // No bounds available
      }
      
      return {
        name: path.basename(filePath, '.000'),
        scale: metadata.SCALE ? parseInt(metadata.SCALE) : undefined,
        issueDate: metadata.ISDT,
        updateDate: metadata.UADT,
        bounds
      };
    } catch (error) {
      throw new Error(`Failed to read chart metadata: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const s57Parser = new S57Parser();