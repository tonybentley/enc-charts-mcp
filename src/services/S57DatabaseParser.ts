import { S57Parser, S57ParseOptions } from './s57Parser.js';
import { NavigationFeatureRepository } from '../database/repositories/NavigationFeatureRepository.js';
import { ChartFeatureRecord, BoundingBox } from '../database/schemas.js';
import { Feature, FeatureCollection } from 'geojson';
import { S57Properties } from '../types/enc.js';

export interface S57DatabaseParseOptions extends S57ParseOptions {
  batchSize?: number;
  skipExisting?: boolean;
  clearExisting?: boolean;
}

export interface ParseToDbResult {
  chartId: string;
  featuresStored: number;
  totalFeatures: number;
  featureTypes: Record<string, number>;
  parseDuration: number;
  storeDuration: number;
}

export interface PaginatedFeatureCollection extends FeatureCollection {
  totalCount: number;
  hasMore: boolean;
}

/**
 * S57DatabaseParser extends S57Parser to store parsed features in the database
 */
export class S57DatabaseParser extends S57Parser {
  constructor(
    private featureRepository?: NavigationFeatureRepository
  ) {
    super();
  }

  /**
   * Parse an S-57 file and store features directly in database
   * Returns parsing statistics, NOT features (database-first architecture)
   */
  async parseChartToDatabase(
    filePath: string,
    chartId: string,
    options: S57DatabaseParseOptions = {}
  ): Promise<ParseToDbResult> {
    const parseStartTime = Date.now();
    
    // Parse the chart using the base parser
    const featureCollection = await this.parseChart(filePath, options);
    const parseDuration = Date.now() - parseStartTime;
    
    let featuresStored = 0;
    const featureTypes: Record<string, number> = {};
    
    // Count feature types
    for (const feature of featureCollection.features) {
      const featureType = (feature.properties as any)?._featureType || 'UNKNOWN';
      featureTypes[featureType] = (featureTypes[featureType] || 0) + 1;
    }
    
    // Store in database if repository is available
    if (this.featureRepository) {
      const storeStartTime = Date.now();
      await this.storeFeaturesInDatabase(
        featureCollection.features,
        chartId,
        options
      );
      featuresStored = featureCollection.features.length;
      const storeDuration = Date.now() - storeStartTime;
      
      return {
        chartId,
        featuresStored,
        totalFeatures: featureCollection.features.length,
        featureTypes,
        parseDuration,
        storeDuration
      };
    }
    
    // No repository available
    return {
      chartId,
      featuresStored: 0,
      totalFeatures: featureCollection.features.length,
      featureTypes,
      parseDuration,
      storeDuration: 0
    };
  }

  /**
   * DEPRECATED: Parse and return features (use getChartFeaturesFromDatabase instead)
   * This method exists for backward compatibility but should not be used
   */
  async parseChartToMemory(
    filePath: string,
    options: S57DatabaseParseOptions = {}
  ): Promise<FeatureCollection> {
    return this.parseChart(filePath, options);
  }

  /**
   * Parse specific feature types and store in database
   */
  async parseFeatureTypesToDatabase(
    filePath: string,
    chartId: string,
    featureTypes: string[],
    options: Omit<S57DatabaseParseOptions, 'featureTypes'> = {}
  ): Promise<number> {
    let totalStored = 0;
    
    // Process each feature type separately to manage memory
    for (const featureType of featureTypes) {
      const features = await this.parseFeatureType(filePath, featureType, options);
      
      if (this.featureRepository && features.length > 0) {
        await this.storeFeaturesInDatabase(features, chartId, {
          ...options,
          clearExisting: false // Only clear on first batch
        });
        totalStored += features.length;
      }
    }
    
    return totalStored;
  }

  /**
   * Store features in database with batching
   */
  private async storeFeaturesInDatabase(
    features: Feature[],
    chartId: string,
    options: S57DatabaseParseOptions
  ): Promise<void> {
    if (!this.featureRepository) {
      return;
    }
    
    // Clear existing features if requested
    if (options.clearExisting) {
      await this.featureRepository.deleteByChartId(chartId);
    }
    
    // Skip if checking for existing and chart has features
    if (options.skipExisting) {
      const existingCount = await this.featureRepository.countByChartId(chartId);
      if (existingCount > 0) {
        return;
      }
    }
    
    // Convert features to database records
    const records: ChartFeatureRecord[] = features.map(feature => 
      this.convertFeatureToRecord(feature, chartId)
    );
    
    // Batch insert features
    const batchSize = options.batchSize || 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      await this.featureRepository.insertBatch(batch);
    }
  }

  /**
   * Convert GeoJSON feature to database record
   */
  private convertFeatureToRecord(feature: Feature, chartId: string): ChartFeatureRecord {
    const properties = feature.properties as S57Properties;
    
    // Calculate bounding box for the feature
    const bbox = this.calculateFeatureBounds(feature.geometry);
    
    return {
      chart_id: chartId,
      object_class: properties._featureType || 'UNKNOWN',
      object_id: feature.id?.toString(),
      geometry: JSON.stringify(feature.geometry),
      properties: JSON.stringify(properties),
      bbox_minlon: bbox?.minLon,
      bbox_minlat: bbox?.minLat,
      bbox_maxlon: bbox?.maxLon,
      bbox_maxlat: bbox?.maxLat
    };
  }

  /**
   * Calculate bounding box for a geometry
   */
  private calculateFeatureBounds(geometry: GeoJSON.Geometry | GeoJSON.GeometryCollection): BoundingBox | null {
    if (!geometry) {
      return null;
    }
    
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    
    const processCoordinate = (coord: number[]): void => {
      if (coord.length >= 2) {
        minLon = Math.min(minLon, coord[0]);
        maxLon = Math.max(maxLon, coord[0]);
        minLat = Math.min(minLat, coord[1]);
        maxLat = Math.max(maxLat, coord[1]);
      }
    };
    
    switch (geometry.type) {
      case 'Point': {
        const point = geometry as GeoJSON.Point;
        processCoordinate(point.coordinates);
        break;
      }
      case 'MultiPoint': {
        const multiPoint = geometry as GeoJSON.MultiPoint;
        multiPoint.coordinates.forEach(processCoordinate);
        break;
      }
      case 'LineString': {
        const lineString = geometry as GeoJSON.LineString;
        lineString.coordinates.forEach(processCoordinate);
        break;
      }
      case 'MultiLineString': {
        const multiLineString = geometry as GeoJSON.MultiLineString;
        multiLineString.coordinates.forEach((line) => 
          line.forEach(processCoordinate)
        );
        break;
      }
      case 'Polygon': {
        const polygon = geometry as GeoJSON.Polygon;
        polygon.coordinates.forEach((ring) => 
          ring.forEach(processCoordinate)
        );
        break;
      }
      case 'MultiPolygon': {
        const multiPolygon = geometry as GeoJSON.MultiPolygon;
        multiPolygon.coordinates.forEach((polygon) =>
          polygon.forEach((ring) =>
            ring.forEach(processCoordinate)
          )
        );
        break;
      }
      case 'GeometryCollection': {
        const collection = geometry as GeoJSON.GeometryCollection;
        collection.geometries.forEach((g) => {
          const subBounds = this.calculateFeatureBounds(g);
          if (subBounds) {
            minLon = Math.min(minLon, subBounds.minLon);
            maxLon = Math.max(maxLon, subBounds.maxLon);
            minLat = Math.min(minLat, subBounds.minLat);
            maxLat = Math.max(maxLat, subBounds.maxLat);
          }
        });
        break;
      }
    }
    
    if (!isFinite(minLon) || !isFinite(maxLon) || !isFinite(minLat) || !isFinite(maxLat)) {
      return null;
    }
    
    return {
      minLon,
      maxLon,
      minLat,
      maxLat
    };
  }

  /**
   * Get statistics about features in database for a chart
   */
  async getChartFeatureStats(chartId: string): Promise<{
    totalFeatures: number;
    featuresByClass: Record<string, number>;
  } | null> {
    if (!this.featureRepository) {
      return null;
    }
    
    const features = await this.featureRepository.findByChartId(chartId);
    const featuresByClass: Record<string, number> = {};
    
    for (const feature of features) {
      featuresByClass[feature.object_class] = (featuresByClass[feature.object_class] || 0) + 1;
    }
    
    return {
      totalFeatures: features.length,
      featuresByClass
    };
  }

  /**
   * Get chart features from database with proper pagination and filtering
   * This is the PRIMARY method for retrieving features (database-first)
   */
  async getChartFeaturesFromDatabase(
    chartId: string,
    options: S57ParseOptions & { limit?: number; offset?: number } = {}
  ): Promise<PaginatedFeatureCollection> {
    if (!this.featureRepository) {
      throw new Error('Database repository not available');
    }
    
    // Build query based on options
    let features: ChartFeatureRecord[];
    
    if (options.boundingBox) {
      features = await this.featureRepository.findByBounds(
        options.boundingBox,
        options.featureTypes
      );
      // Filter by chart ID
      features = features.filter(f => f.chart_id === chartId);
    } else {
      // Use more efficient query when feature types are specified
      if (options.featureTypes && options.featureTypes.length > 0) {
        features = await this.featureRepository.findByChartIdAndClasses(
          chartId, 
          options.featureTypes,
          { limit: options.limit, offset: options.offset }
        );
      } else {
        features = await this.featureRepository.findByChartId(chartId, { 
          limit: options.limit, 
          offset: options.offset 
        });
      }
    }
    
    // Convert database records back to GeoJSON features
    const geoJsonFeatures: Feature[] = features.map(record => ({
      type: 'Feature',
      id: record.object_id || `${record.object_class}_${record.id}`,
      geometry: JSON.parse(record.geometry) as Feature['geometry'],
      properties: JSON.parse(record.properties || '{}') as Feature['properties']
    }));
    
    // Apply depth filter if needed
    let filteredFeatures = geoJsonFeatures;
    if (options.depthRange) {
      filteredFeatures = geoJsonFeatures.filter(feature => {
        const props = feature.properties as S57Properties;
        return this.passesDepthFilter(props, options.depthRange!);
      });
    }
    
    // For accurate counts, we need to get total without pagination
    // This is a limitation - totalCount may not be accurate when using database pagination
    const totalCount = filteredFeatures.length;
    const hasMore = false; // Can't determine this accurately with database pagination

    return {
      type: 'FeatureCollection',
      features: filteredFeatures,
      totalCount,
      hasMore
    };
  }

  /**
   * Check if depth feature passes filter
   */
  protected override passesDepthFilter(
    properties: S57Properties,
    depthRange: { min: number; max: number }
  ): boolean {
    // Check various depth properties
    const depthValues = [
      properties.DRVAL1,
      properties.DRVAL2,
      properties.VALDCO,
      properties.VALSOU
    ].filter((v): v is number => v !== undefined && v !== null);
    
    if (depthValues.length === 0) {
      return true; // No depth info, include by default
    }
    
    // Check if any depth value is within range
    return depthValues.some(depth => 
      depth >= depthRange.min && depth <= depthRange.max
    );
  }

  /**
   * Check if chart features exist in database
   */
  async hasChartFeatures(chartId: string): Promise<boolean> {
    if (!this.featureRepository) {
      return false;
    }
    
    const count = await this.featureRepository.countByChartId(chartId);
    return count > 0;
  }

  /**
   * Check if feature type represents depth information
   */
  protected override isDepthFeature(featureType: string): boolean {
    const depthTypes = ['DEPARE', 'DEPCNT', 'SOUNDG', 'DRGARE'];
    return depthTypes.includes(featureType);
  }
}