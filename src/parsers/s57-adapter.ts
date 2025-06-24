/**
 * S57 Adapter - Drop-in replacement for gdal-async
 * Provides gdal-async compatible API using subprocess-based implementation
 */

import { GdalBridge, SubprocessDataset, SubprocessLayer, SubprocessFeature } from './gdal-bridge.js';
import { EventEmitter } from 'events';

// Create a singleton bridge instance
const bridge = new GdalBridge();

// Cleanup on process exit
process.on('exit', () => bridge.cleanup());
process.on('SIGINT', () => {
  bridge.cleanup();
  process.exit();
});
process.on('SIGTERM', () => {
  bridge.cleanup();
  process.exit();
});

/**
 * Drop-in replacement for gdal-async Dataset
 */
class DatasetAdapter {
  private dataset: SubprocessDataset;
  public layers: LayersAdapter;

  constructor(dataset: SubprocessDataset) {
    this.dataset = dataset;
    this.layers = new LayersAdapter(dataset);
  }

  async close(): Promise<void> {
    await this.dataset.close();
  }

  getMetadata(): Record<string, string> {
    // Mock metadata - in a real implementation this would come from the Python parser
    return {};
  }
}

/**
 * Drop-in replacement for gdal-async Layers collection
 */
class LayersAdapter {
  private dataset: SubprocessDataset;
  private layerCache: SubprocessLayer[] | null = null;

  constructor(dataset: SubprocessDataset) {
    this.dataset = dataset;
  }

  count(): number {
    // Synchronous count is tricky - we'll need to cache layers
    if (!this.layerCache) {
      throw new Error('Layer count not available - use await on dataset.layers first');
    }
    return this.layerCache.length;
  }

  async get(index: number): Promise<LayerAdapter> {
    const layer = await this.dataset.getLayer(index);
    return new LayerAdapter(layer);
  }

  // Support for iteration
  async *[Symbol.asyncIterator]() {
    const layers = await this.dataset.layers();
    this.layerCache = layers; // Cache for count()
    for (const layer of layers) {
      yield new LayerAdapter(layer);
    }
  }

  // Alternative synchronous access after initial load
  async ensureLoaded(): Promise<void> {
    if (!this.layerCache && this.dataset) {
      this.layerCache = await this.dataset.layers();
    }
  }
}

/**
 * Drop-in replacement for gdal-async Layer
 */
class LayerAdapter {
  private layer: SubprocessLayer;
  public name: string;
  public features: FeaturesAdapter;

  constructor(layer: SubprocessLayer) {
    this.layer = layer;
    this.name = layer.name;
    this.features = new FeaturesAdapter(layer);
  }

  setSpatialFilter(minX: number, minY: number, maxX: number, maxY: number): void {
    // Note: Our subprocess implementation doesn't support dynamic spatial filters
    // This would need to be implemented in the Python parser
    // Silently ignore for now to avoid console output in JSON responses
  }

  async getExtent(): Promise<{ minX: number; maxX: number; minY: number; maxY: number }> {
    return await this.layer.getExtent();
  }
}

/**
 * Drop-in replacement for gdal-async Features collection
 */
class FeaturesAdapter {
  private layer: SubprocessLayer;

  constructor(layer: SubprocessLayer) {
    this.layer = layer;
  }

  async count(): Promise<number> {
    const features = await this.layer.getFeatures();
    return features.length;
  }

  async get(fid: string): Promise<FeatureAdapter> {
    const feature = await this.layer.getFeature(fid);
    return new FeatureAdapter(feature);
  }

  // Support for async iteration
  async *[Symbol.asyncIterator]() {
    const features = await this.layer.getFeatures();
    for (const feature of features) {
      yield new FeatureAdapter(feature);
    }
  }
}

/**
 * Drop-in replacement for gdal-async Feature
 */
class FeatureAdapter {
  private feature: SubprocessFeature;

  constructor(feature: SubprocessFeature) {
    this.feature = feature;
  }

  get fid(): string {
    return this.feature.fid;
  }

  getGeometry(): GeometryAdapter | null {
    if (!this.feature.geometry) return null;
    return new GeometryAdapter(this.feature.geometry);
  }

  get fields() {
    return new FieldsAdapter(this.feature.fields);
  }
}

/**
 * Drop-in replacement for gdal-async Fields
 */
class FieldsAdapter {
  private fields: Record<string, any>;

  constructor(fields: Record<string, any>) {
    this.fields = fields;
  }

  get(key: string): any {
    return this.fields[key];
  }

  toObject(): Record<string, any> {
    return { ...this.fields };
  }
}

/**
 * Drop-in replacement for gdal-async Geometry
 */
class GeometryAdapter {
  private geometry: any;
  public wkbType: number;

  constructor(geometry: any) {
    this.geometry = geometry;
    
    // Map GeoJSON types to WKB type constants
    const typeMap: Record<string, number> = {
      'Point': 1, // wkbPoint
      'LineString': 2, // wkbLineString
      'Polygon': 3, // wkbPolygon
      'MultiPoint': 4, // wkbMultiPoint
      'MultiLineString': 5, // wkbMultiLineString
      'MultiPolygon': 6 // wkbMultiPolygon
    };
    this.wkbType = typeMap[this.geometry.type] || 0;
  }

  toObject(): any {
    // Return GeoJSON-compatible geometry
    return this.geometry;
  }

  wkbTypeStr(): string {
    // Map GeoJSON types to WKB type names
    const typeMap: Record<string, string> = {
      'Point': 'Point',
      'LineString': 'LineString',
      'Polygon': 'Polygon',
      'MultiPoint': 'MultiPoint',
      'MultiLineString': 'MultiLineString',
      'MultiPolygon': 'MultiPolygon'
    };
    return typeMap[this.geometry.type] || 'Unknown';
  }
}

/**
 * Main export - drop-in replacement for gdal-async
 */
const gdal = {
  /**
   * Open a dataset asynchronously
   */
  async openAsync(filePath: string): Promise<DatasetAdapter> {
    const dataset = await bridge.openDataset(filePath);
    const adapter = new DatasetAdapter(dataset);
    
    // Pre-load layers for synchronous count() support
    await adapter.layers.ensureLoaded();
    
    return adapter;
  },

  /**
   * Open a dataset synchronously (not supported in subprocess implementation)
   */
  open(filePath: string): never {
    throw new Error('Synchronous open() is not supported in subprocess adapter. Use openAsync() instead.');
  },

  // WKB type constants for compatibility
  wkbPoint: 1,
  wkbPoint25D: 0x80000001,
  wkbLineString: 2,
  wkbLineString25D: 0x80000002,
  wkbPolygon: 3,
  wkbPolygon25D: 0x80000003,
  wkbMultiPoint: 4,
  wkbMultiPoint25D: 0x80000004,
  wkbMultiLineString: 5,
  wkbMultiLineString25D: 0x80000005,
  wkbMultiPolygon: 6,
  wkbMultiPolygon25D: 0x80000006,

  // Spatial reference utilities
  SpatialReference: {
    fromEPSG: (epsg: number) => ({
      // Mock spatial reference object
      toWKT: () => `EPSG:${epsg}`
    })
  },

  // Coordinate transformation mock
  CoordinateTransformation: class {
    constructor(source: any, target: any) {
      // Mock implementation
    }
    transform(geometry: any): any {
      // In a real implementation, this would transform coordinates
      return geometry;
    }
  }
};

export default gdal;
export { DatasetAdapter, LayerAdapter, FeatureAdapter, GeometryAdapter };