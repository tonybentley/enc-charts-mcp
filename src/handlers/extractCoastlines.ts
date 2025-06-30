import { z } from 'zod';
import { Feature, LineString, Polygon } from 'geojson';
import { 
  ExtractCoastlinesOutput,
  CoastlineFeature,
  SizeLimitError
} from '../types/coastline.js';
import { 
  EXTRACTION_DEFAULTS,
  MAX_RESPONSE_SIZE,
  WARNING_RESPONSE_SIZE,
  DEFAULT_PAGINATION_LIMIT,
  MAX_PAGINATION_LIMIT
} from '../constants/coastline.js';
import { 
  getCacheManager, 
  getChartDownloadService, 
  getChartQueryService,
  getS57DatabaseParser,
  getChartFetcher 
} from '../services/serviceInitializer.js';
import { CoastlineExtractor } from '../services/coastline/CoastlineExtractor.js';
import { CoastlineStitcher } from '../services/coastline/CoastlineStitcher.js';
import { CoastlineProcessor } from '../services/coastline/CoastlineProcessor.js';
import { GeometryUtils } from '../services/geometry/GeometryUtils.js';
import { FEATURE_CATEGORIES } from '../constants/coastline.js';
import path from 'path';

// Helper function to categorize features
function getFeatureCategory(featureType: string): string {
  for (const [category, features] of Object.entries(FEATURE_CATEGORIES)) {
    if ((features as readonly string[]).includes(featureType)) {
      return category;
    }
  }
  
  // Enhanced features
  if (['DEPARE_TIDAL', 'TIDEWY', 'SWPARE', 'VEGATN'].includes(featureType)) {
    return 'tidal';
  }
  if (['SBDARE', 'SNDWAV', 'UNSARE', 'ICEARE'].includes(featureType)) {
    return 'natural';
  }
  if (['OFSPLF', 'PIPARE', 'PIPSOL', 'CBLARE', 'CBLSUB', 'BRIDGE', 'PYLONS', 'CRANES', 'CONVYR'].includes(featureType)) {
    return 'infrastructure';
  }
  if (['COSARE', 'MIPARE', 'ADMARE', 'CONZNE'].includes(featureType)) {
    return 'administrative';
  }
  if (['HRBFAC', 'SMCFAC', 'CHKPNT', 'FORSTC', 'BERTHS', 'TERMNL', 'DRYDOC', 'LOKBSN'].includes(featureType)) {
    return 'port';
  }
  if (['FNCLNE', 'RAILWY', 'DMPGRD'].includes(featureType)) {
    return 'boundary';
  }
  
  return 'original'; // Default for COALNE, SLCONS, etc.
}

const ExtractCoastlinesSchema = z.union([
  z.object({
    chartId: z.string(),
    extractionMethod: z.enum(['explicit', 'derived', 'combined']).optional(),
    featureSources: z.object({
      useCoastlines: z.boolean().optional(),
      useDepthAreas: z.boolean().optional(),
      useDepthContours: z.boolean().optional(),
      useLandAreas: z.boolean().optional(),
      useShorelineConstruction: z.boolean().optional(),
      useHarborFeatures: z.boolean().optional(),
      useMooringFeatures: z.boolean().optional(),
      useSpecialFeatures: z.boolean().optional(),
      // New infrastructure features
      useBridges: z.boolean().optional(),
      usePylons: z.boolean().optional(),
      useCranes: z.boolean().optional(),
      useConveyors: z.boolean().optional(),
      // New port features  
      useBerths: z.boolean().optional(),
      useTerminals: z.boolean().optional(),
      useDryDocks: z.boolean().optional(),
      useLockBasins: z.boolean().optional(),
      // New boundary features
      useFenceLines: z.boolean().optional(),
      useRailways: z.boolean().optional(),
      useDumpingGrounds: z.boolean().optional(),
      // Enhanced features from PRD
      useTidalFeatures: z.boolean().optional(),
      useNaturalBoundaries: z.boolean().optional(),
      useAdditionalInfrastructure: z.boolean().optional(),
      useAdministrativeBoundaries: z.boolean().optional(),
      useSpecializedPortFeatures: z.boolean().optional(),
      useDepthChannels: z.boolean().optional(),
      useRestrictedAreas: z.boolean().optional(),
      useValidationFeatures: z.boolean().optional(),
    }).optional(),
    stitching: z.object({
      enabled: z.boolean().optional(),
      tolerance: z.number().positive().optional(),
      mergeConnected: z.boolean().optional(),
      gapFilling: z.object({
        enabled: z.boolean().optional(),
        maxGapDistance: z.number().positive().optional(),
        method: z.enum(['linear', 'arc', 'coastline-following']).optional(),
        validateWithWaterBodies: z.boolean().optional(),
      }).optional(),
    }).optional(),
    simplification: z.object({
      enabled: z.boolean().optional(),
      tolerance: z.number().positive().optional(),
      preserveTopology: z.boolean().optional(),
    }).optional(),
    classification: z.object({
      separateByType: z.boolean().optional(),
      includeMetadata: z.boolean().optional(),
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
    extractionMethod: z.enum(['explicit', 'derived', 'combined']).optional(),
    featureSources: z.object({
      useCoastlines: z.boolean().optional(),
      useDepthAreas: z.boolean().optional(),
      useDepthContours: z.boolean().optional(),
      useLandAreas: z.boolean().optional(),
      useShorelineConstruction: z.boolean().optional(),
      useHarborFeatures: z.boolean().optional(),
      useMooringFeatures: z.boolean().optional(),
      useSpecialFeatures: z.boolean().optional(),
      // New infrastructure features
      useBridges: z.boolean().optional(),
      usePylons: z.boolean().optional(),
      useCranes: z.boolean().optional(),
      useConveyors: z.boolean().optional(),
      // New port features  
      useBerths: z.boolean().optional(),
      useTerminals: z.boolean().optional(),
      useDryDocks: z.boolean().optional(),
      useLockBasins: z.boolean().optional(),
      // New boundary features
      useFenceLines: z.boolean().optional(),
      useRailways: z.boolean().optional(),
      useDumpingGrounds: z.boolean().optional(),
      // Enhanced features from PRD
      useTidalFeatures: z.boolean().optional(),
      useNaturalBoundaries: z.boolean().optional(),
      useAdditionalInfrastructure: z.boolean().optional(),
      useAdministrativeBoundaries: z.boolean().optional(),
      useSpecializedPortFeatures: z.boolean().optional(),
      useDepthChannels: z.boolean().optional(),
      useRestrictedAreas: z.boolean().optional(),
      useValidationFeatures: z.boolean().optional(),
    }).optional(),
    stitching: z.object({
      enabled: z.boolean().optional(),
      tolerance: z.number().positive().optional(),
      mergeConnected: z.boolean().optional(),
      gapFilling: z.object({
        enabled: z.boolean().optional(),
        maxGapDistance: z.number().positive().optional(),
        method: z.enum(['linear', 'arc', 'coastline-following']).optional(),
        validateWithWaterBodies: z.boolean().optional(),
      }).optional(),
    }).optional(),
    simplification: z.object({
      enabled: z.boolean().optional(),
      tolerance: z.number().positive().optional(),
      preserveTopology: z.boolean().optional(),
    }).optional(),
    classification: z.object({
      separateByType: z.boolean().optional(),
      includeMetadata: z.boolean().optional(),
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

export async function extractCoastlinesHandler(args: unknown): Promise<ExtractCoastlinesOutput | SizeLimitError> {
  const parsed = ExtractCoastlinesSchema.parse(args);
  
  // Merge with defaults
  const options = {
    extractionMethod: parsed.extractionMethod || EXTRACTION_DEFAULTS.extractionMethod,
    featureSources: {
      ...EXTRACTION_DEFAULTS.featureSources,
      ...parsed.featureSources,
    },
    stitching: {
      ...EXTRACTION_DEFAULTS.stitching,
      ...parsed.stitching,
    },
    simplification: {
      ...EXTRACTION_DEFAULTS.simplification,
      ...parsed.simplification,
    },
    classification: {
      ...EXTRACTION_DEFAULTS.classification,
      ...parsed.classification,
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
      chartId = charts.reduce((best, current) => 
        current.scale < best.scale ? current : best
      ).id;
    }

    // Get or download chart
    const cacheManager = await getCacheManager();
    const downloadService = await getChartDownloadService();
    const chartFetcher = await getChartFetcher();
    const dbParser = await getS57DatabaseParser();
    
    if (!dbParser) {
      throw new Error('S57 database parser not available');
    }
    
    let chartFiles;
    
    // Use database-aware fetcher if available
    if (chartFetcher) {
      chartFiles = await chartFetcher.fetchChart(chartId);
    } else {
      // Legacy approach - download if not cached
      const isCached = await cacheManager.isChartCached(chartId);
      if (!isCached) {
        chartFiles = await downloadService.downloadChart(chartId);
      } else {
        chartFiles = await downloadService.getCachedChart(chartId);
      }
    }
    
    // Get the S-57 file path
    if (!chartFiles || !chartFiles.s57Files || chartFiles.s57Files.length === 0) {
      throw new Error(`No S-57 files found for chart ${chartId}`);
    }
    const s57FilePath = path.join(chartFiles.basePath, chartFiles.s57Files[0]);
    
    // Parse the chart to store in database
    await dbParser.parseChartToDatabase(s57FilePath, chartId, {
      clearExisting: false,
      skipExisting: true
    });
    
    // Prepare feature types based on extraction method
    const featureTypes: string[] = [];
    if (options.featureSources.useCoastlines) {
      featureTypes.push('COALNE');
    }
    if (options.featureSources.useShorelineConstruction) {
      featureTypes.push('SLCONS');
    }
    if (options.featureSources.useDepthContours) {
      featureTypes.push('DEPCNT');
    }
    if (options.featureSources.useMooringFeatures) {
      featureTypes.push('MORFAC', 'PONTON', 'FLODOC', 'HULKES');
    }
    if (options.featureSources.useHarborFeatures) {
      featureTypes.push('HRBARE', 'PRYARE', 'ACHARE');
    }
    if (options.featureSources.useSpecialFeatures) {
      featureTypes.push('CAUSWY', 'DAMCON', 'GATCON');
    }
    if (options.featureSources.useDepthAreas) {
      featureTypes.push('DEPARE', 'DRGARE');
    }
    if (options.featureSources.useLandAreas) {
      featureTypes.push('LNDARE', 'BUAARE', 'LNDRGN');
    }
    // Infrastructure features
    if (options.featureSources.useBridges) {
      featureTypes.push('BRIDGE');
    }
    if (options.featureSources.usePylons) {
      featureTypes.push('PYLONS');
    }
    if (options.featureSources.useCranes) {
      featureTypes.push('CRANES');
    }
    if (options.featureSources.useConveyors) {
      featureTypes.push('CONVYR');
    }
    // Port features
    if (options.featureSources.useBerths) {
      featureTypes.push('BERTHS');
    }
    if (options.featureSources.useTerminals) {
      featureTypes.push('TERMNL');
    }
    if (options.featureSources.useDryDocks) {
      featureTypes.push('DRYDOC');
    }
    if (options.featureSources.useLockBasins) {
      featureTypes.push('LOKBSN');
    }
    // Boundary features
    if (options.featureSources.useFenceLines) {
      featureTypes.push('FNCLNE');
    }
    if (options.featureSources.useRailways) {
      featureTypes.push('RAILWY');
    }
    if (options.featureSources.useDumpingGrounds) {
      featureTypes.push('DMPGRD');
    }

    // Query features - need to pass limit to avoid default pagination of 20
    const featuresResult = await dbParser.getChartFeaturesFromDatabase(chartId, {
      featureTypes: featureTypes.length > 0 ? featureTypes : undefined,
      boundingBox: parsed.boundingBox,
      limit: options.limit,
      offset: options.offset,
    });
    const features = featuresResult.features;
    
    // Debug: Log PONTON features found
    const pontonFeatures = features.filter(f => f.properties?.['_featureType'] === 'PONTON');
    console.log(`DEBUG: Found ${pontonFeatures.length} PONTON features in database`);
    if (pontonFeatures.length > 0) {
      console.log(`DEBUG: PONTON geometry types:`, pontonFeatures.map(f => f.geometry?.type).filter(Boolean));
      console.log(`DEBUG: First PONTON feature:`, JSON.stringify(pontonFeatures[0], null, 2));
    }

    // Also get water features for water side detection
    const waterFeaturesResult = await dbParser.getChartFeaturesFromDatabase(chartId, {
      featureTypes: ['DEPARE', 'DRGARE', 'CANALS', 'RIVERS', 'LAKARE'],
      boundingBox: parsed.boundingBox,
    });
    const waterFeatures = waterFeaturesResult.features;

    const waterPolygons = waterFeatures
      .filter((f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon')
      .map((f) => f as Feature<Polygon>);

    // Extract coastlines
    const extractor = new CoastlineExtractor();
    let coastlines: Feature<LineString>[] = [];

    if (options.extractionMethod === 'explicit') {
      coastlines = extractor.extractExplicitCoastlines(features);
    } else if (options.extractionMethod === 'derived') {
      coastlines = [
        ...extractor.extractFromDepthContours(features),
        ...extractor.extractFromDepthAreas(features),
        ...extractor.extractFromLandAreas(features),
      ];
    } else {
      coastlines = extractor.extractAllCoastlines(features, {
        ...options.featureSources,
        useDepthContours: options.featureSources.useDepthContours,
      });
    }
    
    // Debug: Log coastlines from PONTON
    const pontonCoastlines = coastlines.filter(c => 
      Array.isArray(c.properties?.sourceFeatures) && c.properties.sourceFeatures.includes('PONTON')
    );
    console.log(`DEBUG: Extracted ${pontonCoastlines.length} coastlines from PONTON features`);
    if (pontonCoastlines.length > 0) {
      console.log(`DEBUG: First PONTON coastline:`, JSON.stringify(pontonCoastlines[0], null, 2));
    }

    // Stitch segments if enabled
    const stitcher = new CoastlineStitcher();
    if (options.stitching.enabled && coastlines.length > 1) {
      // Debug: Count PONTON before stitching
      const pontonBeforeStitch = coastlines.filter(c => 
        Array.isArray(c.properties?.sourceFeatures) && c.properties.sourceFeatures.includes('PONTON')
      ).length;
      console.log(`DEBUG: PONTON coastlines before stitching: ${pontonBeforeStitch}`);
      
      const gapFillingOptions = options.stitching.gapFilling ? {
        enabled: options.stitching.gapFilling.enabled ?? true,
        maxGapDistance: options.stitching.gapFilling.maxGapDistance ?? 100,
        method: options.stitching.gapFilling.method ?? 'linear' as const,
        validateWithWaterBodies: options.stitching.gapFilling.validateWithWaterBodies ?? true,
        waterFeatures: waterPolygons,
      } : undefined;
      
      coastlines = stitcher.stitchSegments(coastlines, options.stitching.tolerance, gapFillingOptions);
      
      // Debug: Count PONTON after stitching
      const pontonAfterStitch = coastlines.filter(c => 
        Array.isArray(c.properties?.sourceFeatures) && c.properties.sourceFeatures.includes('PONTON')
      ).length;
      console.log(`DEBUG: PONTON coastlines after stitching: ${pontonAfterStitch}`);
      
      // Merge connected segments if requested
      if (options.stitching.mergeConnected) {
        coastlines = stitcher.mergeConnectedSegments(coastlines);
        
        // Debug: Count PONTON after merging
        const pontonAfterMerge = coastlines.filter(c => 
          Array.isArray(c.properties?.sourceFeatures) && c.properties.sourceFeatures.includes('PONTON')
        ).length;
        console.log(`DEBUG: PONTON coastlines after merging: ${pontonAfterMerge}`);
      }
    }

    // Process coastlines
    const processor = new CoastlineProcessor();
    const processedCoastlines: CoastlineFeature[] = coastlines.map(coastline => {
      const processed = processor.processCoastline(coastline, {
        simplify: options.simplification.enabled,
        simplificationTolerance: options.simplification.tolerance,
        waterFeatures: waterPolygons,
        includeMetrics: options.classification.includeMetadata,
      });

      // Classify coastline type - only if it's a LineString
      if (processed.geometry.type === 'LineString') {
        const subType = extractor.classifyCoastlineType(processed as Feature<LineString>, features);
        processed.properties.subType = subType;
      }

      return processed;
    });

    // Debug: Count PONTON after processing
    const pontonAfterProcess = processedCoastlines.filter(c => 
      Array.isArray(c.properties?.sourceFeatures) && c.properties.sourceFeatures.includes('PONTON')
    ).length;
    console.log(`DEBUG: PONTON coastlines after processing: ${pontonAfterProcess}`);

    // Detect gaps - only for LineString features
    const lineStringCoastlines = processedCoastlines.filter(c => 
      c.geometry.type === 'LineString'
    ) as Feature<LineString>[];
    const gaps = stitcher.detectGaps(lineStringCoastlines);
    
    // Calculate gap metrics
    const filledGaps = gaps.filter(g => g.filled);
    const unfilledGaps = gaps.filter(g => !g.filled);
    
    const gapMetrics = gaps.length > 0 ? {
      largestGap_m: Math.max(...gaps.map(g => g.distance_m)),
      smallestGap_m: Math.min(...gaps.map(g => g.distance_m)),
      averageGap_m: gaps.reduce((sum, g) => sum + g.distance_m, 0) / gaps.length,
      gapDistribution: {
        under50m: gaps.filter(g => g.distance_m < 50).length,
        under100m: gaps.filter(g => g.distance_m < 100).length,
        under200m: gaps.filter(g => g.distance_m < 200).length,
        over200m: gaps.filter(g => g.distance_m >= 200).length,
      },
      filledGaps: filledGaps.length,
      unfilledGaps: unfilledGaps.length,
    } : null;

    // Calculate source feature breakdown with enhanced metadata
    const sourceBreakdown: Record<string, { 
      count: number; 
      totalLength_m: number;
      category?: string;
      averageProximityToWater_m?: number;
    }> = {};
    
    processedCoastlines.forEach(coastline => {
      const sources = coastline.properties.sourceFeatures || [];
      sources.forEach(source => {
        if (!sourceBreakdown[source]) {
          sourceBreakdown[source] = { 
            count: 0, 
            totalLength_m: 0,
            category: getFeatureCategory(source),
          };
        }
        sourceBreakdown[source].count++;
        sourceBreakdown[source].totalLength_m += coastline.properties.length_m || 0;
        
        // Add proximity to water if available
        if (coastline.properties.proximityToWater !== undefined) {
          const currentProximity = sourceBreakdown[source].averageProximityToWater_m || 0;
          const currentCount = sourceBreakdown[source].count;
          sourceBreakdown[source].averageProximityToWater_m = 
            (currentProximity * (currentCount - 1) + coastline.properties.proximityToWater) / currentCount;
        }
      });
    });

    // Calculate feature categories summary
    const featureCategories = {
      tidal: { count: 0, length_m: 0 },
      natural: { count: 0, length_m: 0 },
      infrastructure: { count: 0, length_m: 0 },
      administrative: { count: 0, length_m: 0 },
      port: { count: 0, length_m: 0 },
      boundary: { count: 0, length_m: 0 },
      original: { count: 0, length_m: 0 },
    };

    Object.entries(sourceBreakdown).forEach(([_source, data]) => {
      const category = data.category || 'original';
      if (featureCategories[category as keyof typeof featureCategories]) {
        featureCategories[category as keyof typeof featureCategories].count += data.count;
        featureCategories[category as keyof typeof featureCategories].length_m += data.totalLength_m;
      }
    });

    // Calculate statistics
    const bounds = GeometryUtils.boundingBox(processedCoastlines as Feature[]);
    const totalLength = processedCoastlines.reduce((sum, c) => sum + c.properties.length_m, 0);
    
    // Apply pagination
    const totalFeatures = processedCoastlines.length;
    const paginatedCoastlines = processedCoastlines.slice(
      options.offset,
      options.offset + options.limit
    );

    // Estimate response size
    const responseSize = processor.estimateResponseSize(paginatedCoastlines);
    
    // Check size and apply optimizations if needed
    if (responseSize > MAX_RESPONSE_SIZE && !parsed.limit) {
      return createSizeLimitError({
        estimatedSize: responseSize,
        featureCount: totalFeatures,
        suggestions: {
          useLimit: 50,
          useBoundingBox: !parsed.boundingBox,
          enableSimplification: !options.simplification.enabled,
          reduceFeatureSources: Object.keys(options.featureSources).filter(k => 
            options.featureSources[k as keyof typeof options.featureSources]
          ),
        },
      });
    }

    // Apply automatic optimizations if approaching limit
    let finalCoastlines = paginatedCoastlines;
    if (responseSize > WARNING_RESPONSE_SIZE) {
      finalCoastlines = processor.reduceCoordinatePrecision(paginatedCoastlines) as CoastlineFeature[];
    }

    // Build response
    const response: ExtractCoastlinesOutput = {
      type: 'FeatureCollection',
      features: finalCoastlines,
      metadata: {
        chartId,
        processingStats: {
          totalSegments: coastlines.length,
          stitchedSegments: processedCoastlines.length,
          gaps: gaps.length,
          totalLength_m: totalLength,
          ...(gapMetrics && {
            largestGap_m: gapMetrics.largestGap_m,
            averageGap_m: gapMetrics.averageGap_m,
            gapDistribution: gapMetrics.gapDistribution,
            filledGaps: gapMetrics.filledGaps,
          }),
        },
        sources: sourceBreakdown,
        featureCategories,
        coverage: {
          bounds: bounds ? {
            minLat: bounds[1],
            maxLat: bounds[3],
            minLon: bounds[0],
            maxLon: bounds[2],
          } : {
            minLat: -90,
            maxLat: 90,
            minLon: -180,
            maxLon: 180,
          },
          area_km2: 0, // Would need to calculate from bounds
        },
      },
    };

    // Add pagination metadata if applicable
    if (totalFeatures > options.limit) {
      response.metadata.pagination = {
        limit: options.limit,
        offset: options.offset,
        totalFeatures,
        hasMore: options.offset + options.limit < totalFeatures,
        nextOffset: options.offset + options.limit < totalFeatures
          ? options.offset + options.limit
          : undefined,
      };
    }

    return response;

  } catch (error) {
    console.error('Error extracting coastlines:', error);
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