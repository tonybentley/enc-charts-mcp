import { z } from 'zod';
import { Feature, Polygon, MultiPolygon, LineString } from 'geojson';
import { 
  GetWaterLandClassificationOutput,
  WaterLandProperties,
  SizeLimitError
} from '../types/coastline.js';
import { 
  WATER_LAND_DEFAULTS,
  MAX_RESPONSE_SIZE,
  WARNING_RESPONSE_SIZE,
  DEFAULT_PAGINATION_LIMIT,
  MAX_PAGINATION_LIMIT,
  S57_WATER_FEATURES,
  S57_LAND_FEATURES,
  S57_NAVIGATION_FEATURES,
  S57_DANGER_FEATURES
} from '../constants/coastline.js';
import { 
  getCacheManager, 
  getChartDownloadService, 
  getChartQueryService,
  getS57DatabaseParser 
} from '../services/serviceInitializer.js';
import { CoastlineExtractor } from '../services/coastline/CoastlineExtractor.js';
import { CoastlineStitcher } from '../services/coastline/CoastlineStitcher.js';
import { CoastlineProcessor } from '../services/coastline/CoastlineProcessor.js';
import { WaterLandClassifier } from '../services/classification/WaterLandClassifier.js';
import { GeometryUtils } from '../services/geometry/GeometryUtils.js';
import path from 'path';

const GetWaterLandClassificationSchema = z.union([
  z.object({
    chartId: z.string(),
    includeFeatures: z.object({
      waterPolygons: z.boolean().optional(),
      landPolygons: z.boolean().optional(),
      coastlines: z.boolean().optional(),
      navigationAreas: z.boolean().optional(),
      dangers: z.boolean().optional(),
    }).optional(),
    processing: z.object({
      mergeAdjacentWater: z.boolean().optional(),
      fillGaps: z.boolean().optional(),
      smoothing: z.boolean().optional(),
    }).optional(),
    boundingBox: z.object({
      minLat: z.number().min(-90).max(90),
      maxLat: z.number().min(-90).max(90),
      minLon: z.number().min(-180).max(180),
      maxLon: z.number().min(-180).max(180),
    }).optional(),
    limit: z.number().min(1).max(MAX_PAGINATION_LIMIT).optional(),
    offset: z.number().min(0).optional(),
  }),
  z.object({
    coordinates: z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    }),
    includeFeatures: z.object({
      waterPolygons: z.boolean().optional(),
      landPolygons: z.boolean().optional(),
      coastlines: z.boolean().optional(),
      navigationAreas: z.boolean().optional(),
      dangers: z.boolean().optional(),
    }).optional(),
    processing: z.object({
      mergeAdjacentWater: z.boolean().optional(),
      fillGaps: z.boolean().optional(),
      smoothing: z.boolean().optional(),
    }).optional(),
    boundingBox: z.object({
      minLat: z.number().min(-90).max(90),
      maxLat: z.number().min(-90).max(90),
      minLon: z.number().min(-180).max(180),
      maxLon: z.number().min(-180).max(180),
    }).optional(),
    limit: z.number().min(1).max(MAX_PAGINATION_LIMIT).optional(),
    offset: z.number().min(0).optional(),
  }),
]);

export async function getWaterLandClassificationHandler(
  args: unknown
): Promise<GetWaterLandClassificationOutput | SizeLimitError> {
  const parsed = GetWaterLandClassificationSchema.parse(args);
  
  // Merge with defaults
  const options = {
    includeFeatures: {
      ...WATER_LAND_DEFAULTS.includeFeatures,
      ...parsed.includeFeatures,
    },
    processing: {
      ...WATER_LAND_DEFAULTS.processing,
      ...parsed.processing,
    },
    limit: parsed.limit || DEFAULT_PAGINATION_LIMIT,
    offset: parsed.offset || 0,
  };

  try {
    // Get chart ID
    let chartId: string;
    if ('chartId' in parsed) {
      chartId = parsed.chartId;
    } else {
      // Query by coordinates
      const chartQuery = await getChartQueryService();
      const charts = await chartQuery.queryByCoordinates(
        parsed.coordinates.lat,
        parsed.coordinates.lon
      );
      
      if (charts.length === 0) {
        throw new Error(`No charts found for coordinates: ${parsed.coordinates.lat}, ${parsed.coordinates.lon}`);
      }
      
      // Select the most detailed chart (smallest scale number = most detail)
      chartId = charts.reduce((best: any, current: any) => 
        current.scale < best.scale ? current : best
      ).id;
    }

    // Get or download chart
    const cacheManager = await getCacheManager();
    const downloadService = await getChartDownloadService();
    
    const isCached = await cacheManager.isChartCached(chartId);
    if (!isCached) {
      await downloadService.downloadChart(chartId);
    }
    const chartPath = path.join(cacheManager.getCacheDir(), chartId);

    // Get features from database
    const dbParser = await getS57DatabaseParser();
    if (!dbParser) {
      throw new Error('S57 database parser not available');
    }
    
    // Parse chart to database if not already done
    const s57FilePath = path.join(chartPath, `${chartId}.000`);
    
    // Parse the chart to store in database
    await dbParser.parseChartToDatabase(s57FilePath, chartId, {
      clearExisting: false,
      skipExisting: true
    });
    
    // Prepare feature types to query
    const featureTypes: string[] = [];
    if (options.includeFeatures.waterPolygons) {
      featureTypes.push(...S57_WATER_FEATURES);
    }
    if (options.includeFeatures.landPolygons) {
      featureTypes.push(...S57_LAND_FEATURES);
    }
    if (options.includeFeatures.navigationAreas) {
      featureTypes.push(...S57_NAVIGATION_FEATURES);
    }
    if (options.includeFeatures.dangers) {
      featureTypes.push(...S57_DANGER_FEATURES);
    }
    
    // Always include coastline features for coastline extraction
    featureTypes.push('COALNE', 'SLCONS');

    // Query features
    const featuresResult = await dbParser.getChartFeaturesFromDatabase(chartId, {
      featureTypes: featureTypes.length > 0 ? featureTypes : undefined,
      boundingBox: parsed.boundingBox,
    });
    const features = featuresResult.features;

    // Classify features
    const classifier = new WaterLandClassifier();
    const { water, land, navigation, dangers } = classifier.classifyWaterLandFeatures(features, {
      includeNavigation: options.includeFeatures.navigationAreas,
      includeDangers: options.includeFeatures.dangers,
    });

    // Process water polygons
    let processedWater = water as Feature<Polygon | MultiPolygon, WaterLandProperties>[];
    if (options.processing.mergeAdjacentWater && water.length > 1) {
      processedWater = classifier.mergeWaterPolygons(water) as Feature<Polygon | MultiPolygon, WaterLandProperties>[];
    }

    // Derive land polygons if requested
    let processedLand = land as Feature<Polygon | MultiPolygon, WaterLandProperties>[];
    if (options.includeFeatures.landPolygons && land.length === 0) {
      // Calculate bounds
      const bounds = parsed.boundingBox
        ? [parsed.boundingBox.minLon, parsed.boundingBox.minLat, 
           parsed.boundingBox.maxLon, parsed.boundingBox.maxLat] as [number, number, number, number]
        : GeometryUtils.boundingBox(features) || [-180, -90, 180, 90] as [number, number, number, number];
      
      processedLand = classifier.deriveLandPolygons(bounds, processedWater) as Feature<Polygon | MultiPolygon, WaterLandProperties>[];
    }

    // Extract coastlines if requested
    let coastlines: Feature<LineString, WaterLandProperties>[] = [];
    if (options.includeFeatures.coastlines) {
      const extractor = new CoastlineExtractor();
      const stitcher = new CoastlineStitcher();
      const processor = new CoastlineProcessor();
      
      // Extract coastlines
      let extractedCoastlines = extractor.extractAllCoastlines(features, {
        useCoastlines: true,
        useDepthAreas: true,
        useLandAreas: true,
        useShorelineConstruction: true,
      });

      // Stitch if enabled
      if (extractedCoastlines.length > 1) {
        extractedCoastlines = stitcher.stitchSegments(extractedCoastlines);
      }

      // Process and convert to water/land classification format
      coastlines = extractedCoastlines.map(coastline => {
        const processed = processor.processCoastline(coastline, {
          smooth: options.processing.smoothing,
          smoothingIterations: 2,
          waterFeatures: processedWater as Feature<Polygon>[],
        });

        return {
          type: 'Feature',
          geometry: processed.geometry,
          properties: {
            classification: 'coastline',
            subType: processed.properties.type,
            length_km: processed.properties.length_m / 1000,
            source: processed.properties.source === 'explicit' ? 'COALNE' : 'derived',
          },
        } as Feature<LineString, WaterLandProperties>;
      });
    }

    // Combine all features
    const allFeatures: Array<Feature<Polygon | MultiPolygon | LineString, WaterLandProperties>> = [];
    
    if (options.includeFeatures.waterPolygons) {
      allFeatures.push(...processedWater);
    }
    if (options.includeFeatures.landPolygons) {
      allFeatures.push(...processedLand);
    }
    if (options.includeFeatures.coastlines) {
      allFeatures.push(...coastlines);
    }
    if (options.includeFeatures.navigationAreas) {
      allFeatures.push(...navigation.map(nav => ({
        ...nav,
        properties: {
          ...nav.properties,
          classification: 'navigation' as const,
          subType: nav.properties.type,
          source: 'S57',
        },
      })));
    }
    if (options.includeFeatures.dangers) {
      allFeatures.push(...dangers.map(danger => ({
        ...danger,
        properties: {
          classification: 'danger' as const,
          subType: danger.properties?.subType || 'hazard',
          source: danger.properties?.['S57_TYPE'] || 'unknown',
        },
      } as Feature<any, WaterLandProperties>)));
    }

    // Calculate statistics
    const statistics = {
      totalFeatures: allFeatures.length,
      waterFeatures: processedWater.length,
      landFeatures: processedLand.length,
      coastlineFeatures: coastlines.length,
      totalWaterArea_km2: processedWater.reduce((sum, f) => sum + (f.properties.area_km2 || 0), 0),
      totalLandArea_km2: processedLand.reduce((sum, f) => sum + (f.properties.area_km2 || 0), 0),
      totalCoastlineLength_km: coastlines.reduce((sum, f) => sum + (f.properties.length_km || 0), 0),
      navigableArea_km2: navigation.reduce((sum, f) => {
        if (f.properties.navigable && f.geometry.type === 'Polygon') {
          return sum + GeometryUtils.calculatePolygonArea(f.geometry);
        }
        return sum;
      }, 0),
    };

    // Apply pagination
    const totalFeatures = allFeatures.length;
    const paginatedFeatures = allFeatures.slice(
      options.offset,
      options.offset + options.limit
    );

    // Estimate response size
    const processor = new CoastlineProcessor();
    const responseSize = processor.estimateResponseSize(paginatedFeatures);
    
    // Check size and return error if too large
    if (responseSize > MAX_RESPONSE_SIZE && !parsed.limit) {
      return createSizeLimitError({
        estimatedSize: responseSize,
        featureCount: totalFeatures,
        suggestions: {
          useLimit: 50,
          useBoundingBox: !parsed.boundingBox,
          enableSimplification: false,
          reduceFeatureSources: Object.keys(options.includeFeatures).filter(k => 
            options.includeFeatures[k as keyof typeof options.includeFeatures]
          ),
        },
      });
    }

    // Apply automatic optimizations if approaching limit
    let finalFeatures = paginatedFeatures;
    if (responseSize > WARNING_RESPONSE_SIZE) {
      finalFeatures = processor.reduceCoordinatePrecision(paginatedFeatures) as typeof paginatedFeatures;
    }

    // Build response
    const response: GetWaterLandClassificationOutput = {
      type: 'FeatureCollection',
      features: finalFeatures,
      statistics,
    };

    // Add pagination metadata if applicable
    if (totalFeatures > options.limit) {
      response.metadata = {
        pagination: {
          limit: options.limit,
          offset: options.offset,
          totalFeatures,
          hasMore: options.offset + options.limit < totalFeatures,
          nextOffset: options.offset + options.limit < totalFeatures
            ? options.offset + options.limit
            : undefined,
        },
      };
    }

    return response;

  } catch (error) {
    console.error('Error getting water/land classification:', error);
    throw error;
  }
}

function createSizeLimitError(params: {
  estimatedSize: number;
  featureCount: number;
  suggestions: {
    useLimit: number;
    useBoundingBox: boolean;
    enableSimplification: boolean;
    reduceFeatureSources: string[];
  };
}): SizeLimitError {
  return {
    error: "Response too large",
    code: "SIZE_LIMIT_EXCEEDED",
    estimatedSize: params.estimatedSize,
    featureCount: params.featureCount,
    suggestions: params.suggestions,
    example: {
      limit: params.suggestions.useLimit,
      simplification: { 
        enabled: params.suggestions.enableSimplification, 
        tolerance: 10 
      },
      ...(params.suggestions.useBoundingBox ? {
        boundingBox: {
          minLat: 32.5,
          maxLat: 33.0,
          minLon: -117.5,
          maxLon: -117.0,
        }
      } : {}),
    },
  };
}