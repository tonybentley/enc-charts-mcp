import { Feature, FeatureCollection, LineString, MultiLineString, Polygon, MultiPolygon, BBox } from 'geojson';

export type CoastlineType = 'coastline' | 'shoreline' | 'constructed';
export type CoastlineSubType = 'mainland' | 'island' | 'pier' | 'wharf' | 'seawall';
export type WaterSide = 'left' | 'right' | 'unknown';
export type ExtractionMethod = 'explicit' | 'derived' | 'combined';
export type ClassificationType = 'water' | 'land' | 'coastline' | 'navigation' | 'danger';

export interface CoastlineProperties {
  type: CoastlineType;
  subType: CoastlineSubType;
  source: 'explicit' | 'derived';
  sourceFeatures: string[];
  length_m: number;
  length_nm: number;
  orientation: number;
  continuous: boolean;
  gapCount: number;
  stitched: boolean;
  simplified: boolean;
  waterSide: WaterSide;
  // Enhanced properties for new feature types
  tidalLevel?: number;
  vegetationType?: string;
  infrastructureType?: string;
  administrativeType?: string;
  naturalFeatureType?: string;
  proximityToWater?: number;
  validationMethod?: string;
}

export interface CoastlineFeature extends Feature<LineString | MultiLineString> {
  properties: CoastlineProperties;
}

export interface ExtractCoastlinesInput {
  chartId?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
  extractionMethod?: ExtractionMethod;
  featureSources?: {
    useCoastlines?: boolean;
    useDepthAreas?: boolean;
    useLandAreas?: boolean;
    useShorelineConstruction?: boolean;
    useHarborFeatures?: boolean;
    useMooringFeatures?: boolean;
    useSpecialFeatures?: boolean;
  };
  stitching?: {
    enabled?: boolean;
    tolerance?: number;
    mergeConnected?: boolean;
    gapFilling?: {
      enabled?: boolean;
      maxGapDistance?: number;
      method?: 'linear' | 'arc' | 'coastline-following';
      validateWithWaterBodies?: boolean;
    };
  };
  simplification?: {
    enabled?: boolean;
    tolerance?: number;
    preserveTopology?: boolean;
  };
  classification?: {
    separateByType?: boolean;
    includeMetadata?: boolean;
  };
  boundingBox?: BoundingBox;
  limit?: number;
  offset?: number;
}

export interface ExtractCoastlinesOutput {
  type: 'FeatureCollection';
  features: CoastlineFeature[];
  metadata: {
    chartId: string;
    processingStats: {
      totalSegments: number;
      stitchedSegments: number;
      gaps: number;
      totalLength_m: number;
      largestGap_m?: number;
      averageGap_m?: number;
      gapDistribution?: {
        under50m: number;
        under100m: number;
        under200m: number;
        over200m: number;
      };
      filledGaps?: number;
    };
    sources?: Record<string, {
      count: number;
      totalLength_m: number;
      category?: string;
      averageProximityToWater_m?: number;
    }>;
    featureCategories?: {
      tidal: { count: number; length_m: number };
      natural: { count: number; length_m: number };
      infrastructure: { count: number; length_m: number };
      administrative: { count: number; length_m: number };
      port: { count: number; length_m: number };
      boundary: { count: number; length_m: number };
      original: { count: number; length_m: number };
    };
    coverage: {
      bounds: BoundingBox;
      area_km2: number;
    };
    pagination?: {
      limit: number;
      offset: number;
      totalFeatures: number;
      hasMore: boolean;
      nextOffset?: number;
    };
  };
}

export interface WaterLandProperties {
  classification: ClassificationType;
  subType?: string;
  area_km2?: number;
  length_km?: number;
  depth_range?: { min: number; max: number };
  navigable?: boolean;
  source: string;
}

export interface GetWaterLandClassificationInput {
  chartId?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
  includeFeatures?: {
    waterPolygons?: boolean;
    landPolygons?: boolean;
    coastlines?: boolean;
    navigationAreas?: boolean;
    dangers?: boolean;
  };
  processing?: {
    mergeAdjacentWater?: boolean;
    fillGaps?: boolean;
    smoothing?: boolean;
  };
  boundingBox?: BoundingBox;
  limit?: number;
  offset?: number;
}

export interface GetWaterLandClassificationOutput {
  type: 'FeatureCollection';
  features: Array<Feature<Polygon | MultiPolygon | LineString, WaterLandProperties>>;
  statistics: {
    totalFeatures: number;
    waterFeatures: number;
    landFeatures: number;
    coastlineFeatures: number;
    totalWaterArea_km2: number;
    totalLandArea_km2: number;
    totalCoastlineLength_km: number;
    navigableArea_km2?: number;
  };
  metadata?: {
    pagination?: {
      limit: number;
      offset: number;
      totalFeatures: number;
      hasMore: boolean;
      nextOffset?: number;
    };
  };
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface CoastlineMetrics {
  length_m: number;
  length_nm: number;
  orientation: number;
  startPoint: [number, number];
  endPoint: [number, number];
}

export interface Gap {
  start: [number, number];
  end: [number, number];
  distance_m: number;
  filled?: boolean;
  fillMethod?: 'linear' | 'arc' | 'coastline-following';
}

export interface ConnectionMap {
  [segmentId: number]: {
    connectsTo: number[];
    endpoints: {
      start: [number, number];
      end: [number, number];
    };
  };
}

export interface NavigationArea extends Feature<Polygon | MultiPolygon> {
  properties: {
    type: 'fairway' | 'channel' | 'anchorage' | 'restricted';
    name?: string;
    depth_min?: number;
    depth_max?: number;
    navigable: boolean;
  };
}

export interface ClassifiedFeature extends Feature {
  properties: {
    classification: ClassificationType;
    originalType: string;
    [key: string]: any;
  };
}

export interface SizeEstimation {
  estimatedFeatures: number;
  estimatedSize: number;
  exceedsLimit: boolean;
  suggestions?: {
    recommendedLimit: number;
    recommendedSimplification: boolean;
    recommendedBoundingBox?: BoundingBox;
  };
}

export interface ResponseMetrics {
  characterCount: number;
  featureCount: number;
  estimatedSize: number;
  warnings: string[];
}

export interface SizeLimitError {
  error: "Response too large";
  code: "SIZE_LIMIT_EXCEEDED";
  estimatedSize: number;
  featureCount: number;
  suggestions: {
    useLimit: number;
    useBoundingBox: boolean;
    enableSimplification: boolean;
    reduceFeatureSources: string[];
  };
  example: {
    limit: number;
    simplification: { enabled: boolean; tolerance: number };
    boundingBox?: BoundingBox;
  };
}