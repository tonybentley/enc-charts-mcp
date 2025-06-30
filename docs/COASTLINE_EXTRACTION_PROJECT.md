# ENC Coastline Extraction Project Outline

## Project Goal
Add coastline extraction capabilities to enc-charts-mcp to provide geospatial awareness of water/land boundaries from single ENC charts, delivering processed, ready-to-use coastline data without requiring client-side calculations.

## New Tool Specifications

### 1. `extract_coastlines`
Extract and process coastlines from a single ENC chart with automatic stitching and classification.

```typescript
interface ExtractCoastlinesInput {
  // Chart selection: either chartId or coordinates is required
  chartId?: string;                // Direct chart identifier (e.g., "US5CA72M")
  coordinates?: {                   // GPS coordinates for automatic chart selection
    lat: number;                    // Latitude (-90 to 90)
    lon: number;                    // Longitude (-180 to 180)
  };
  // When coordinates are provided, the system will:
  // 1. Query NOAA catalog for charts containing this location
  // 2. Select the most detailed chart available
  // 3. Use that chart for coastline extraction
  
  // Feature extraction options
  extractionMethod?: 'explicit' | 'derived' | 'combined'; // default: 'combined'
  featureSources?: {
    // Original features
    useCoastlines?: boolean;      // COALNE features (default: true)
    useDepthAreas?: boolean;      // DEPARE boundaries (default: true)
    useLandAreas?: boolean;       // LNDARE boundaries (default: true)
    useShorelineConstruction?: boolean; // SLCONS features (default: true)
    useDepthContours?: boolean;   // DEPCNT 0m contours (default: true)
    useHarborFeatures?: boolean;  // HRBARE, PRYARE, ACHARE (default: true)
    useMooringFeatures?: boolean; // MORFAC, PONTON, FLODOC, HULKES (default: true)
    useSpecialFeatures?: boolean; // CAUSWY, DAMCON, GATCON (default: true)
    
    // Infrastructure features (default: false)
    useBridges?: boolean;         // BRIDGE structures
    usePylons?: boolean;          // PYLONS/pillars
    useCranes?: boolean;          // CRANES structures
    useConveyors?: boolean;       // CONVYR systems
    
    // Port features (default: false)
    useBerths?: boolean;          // BERTHS structures
    useTerminals?: boolean;       // TERMNL boundaries
    useDryDocks?: boolean;        // DRYDOC
    useLockBasins?: boolean;      // LOKBSN
    
    // Boundary features (default: false)
    useFenceLines?: boolean;      // FNCLNE
    useRailways?: boolean;        // RAILWY
    useDumpingGrounds?: boolean;  // DMPGRD
    
    // Enhanced features (default: false)
    useTidalFeatures?: boolean;   // DEPARE with DRVAL1 < 0, TIDEWY, SWPARE, VEGATN
    useNaturalBoundaries?: boolean; // SBDARE, SNDWAV, UNSARE, ICEARE
    useAdditionalInfrastructure?: boolean; // OFSPLF, PIPARE, PIPSOL, CBLARE, CBLSUB
    useAdministrativeBoundaries?: boolean; // COSARE, MIPARE, ADMARE, CONZNE
    useSpecializedPortFeatures?: boolean; // HRBFAC, SMCFAC, CHKPNT, FORSTC
    useDepthChannels?: boolean;   // DWRTCL, DWRTPT
    useRestrictedAreas?: boolean; // CTNARE, RESARE
    useValidationFeatures?: boolean; // CURENT, WATTUR, STSLNE
  };
  
  // Processing options
  stitching?: {
    enabled?: boolean;            // Connect segments (default: true)
    tolerance?: number;           // Connection tolerance in meters (default: 50)
    mergeConnected?: boolean;     // Merge connected segments (default: true)
    gapFilling?: {
      enabled?: boolean;          // Fill gaps between segments (default: true)
      maxGapDistance?: number;    // Maximum gap to fill in meters (default: 100)
      method?: 'linear' | 'arc' | 'coastline-following'; // default: 'linear'
      validateWithWaterBodies?: boolean; // Validate filled gaps (default: true)
    };
  };
  
  // Simplification
  simplification?: {
    enabled?: boolean;            // Apply simplification (default: false)
    tolerance?: number;           // Douglas-Peucker tolerance in meters
    preserveTopology?: boolean;   // Maintain connectivity (default: true)
  };
  
  // Output options
  classification?: {
    separateByType?: boolean;     // Separate mainland/island (default: true)
    includeMetadata?: boolean;    // Add length, orientation, etc. (default: true)
  };
  
  // Area filtering
  boundingBox?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  
  // Pagination
  limit?: number;   // Max features per response (default: 100, max: 1000)
  offset?: number;  // Skip N features for pagination (default: 0)
}

interface ExtractCoastlinesOutput {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'LineString' | 'MultiLineString';
      coordinates: number[][];
    };
    properties: {
      // Classification
      type: 'coastline' | 'shoreline' | 'constructed';
      subType: 'mainland' | 'island' | 'pier' | 'wharf' | 'seawall' | 
               'intertidal' | 'vegetation' | 'platform' | 'berth' | 
               'terminal' | 'drydock' | 'bridge' | 'fence' | 'railway' |
               'administrative' | 'natural' | string; // Extended subtypes
      
      // Source information
      source: 'explicit' | 'derived';
      sourceFeatures: string[]; // Original S-57 feature types
      
      // Metrics
      length_m: number;
      length_nm: number;
      orientation: number; // Average bearing in degrees
      
      // Quality indicators
      continuous: boolean;
      gapCount: number;
      stitched: boolean;
      simplified: boolean;
      
      // Water side indication
      waterSide: 'left' | 'right' | 'unknown';
      
      // Enhanced properties for new features
      tidalLevel?: number; // For tidal features (DRVAL1 value)
      vegetationType?: string; // For VEGATN features
      infrastructureType?: string; // For OFSPLF, PIPARE, etc.
      administrativeType?: string; // For COSARE, MIPARE, etc.
      naturalFeatureType?: string; // For SBDARE, SNDWAV, etc.
      
      // Validation metadata
      proximityToWater?: number; // Distance to nearest water feature
      validationMethod?: string; // How the feature was validated
    };
    id: string;
  }>;
  
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
    sources?: {
      [featureType: string]: {
        count: number;
        totalLength_m: number;
        category?: 'tidal' | 'natural' | 'infrastructure' | 'administrative' | 
                   'port' | 'boundary' | 'original';
        averageProximityToWater_m?: number;
      };
    };
    featureCategories?: {
      tidal?: { count: number; length_m: number };
      natural?: { count: number; length_m: number };
      infrastructure?: { count: number; length_m: number };
      administrative?: { count: number; length_m: number };
      port?: { count: number; length_m: number };
      boundary?: { count: number; length_m: number };
      original?: { count: number; length_m: number };
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
```

### 2. `get_water_land_classification`
Get comprehensive water/land classification with boundaries (similar to OpenMapTiles).

```typescript
interface GetWaterLandClassificationInput {
  // Chart selection: either chartId or coordinates is required
  chartId?: string;                // Direct chart identifier (e.g., "US5CA72M")
  coordinates?: {                   // GPS coordinates for automatic chart selection
    lat: number;                    // Latitude (-90 to 90)
    lon: number;                    // Longitude (-180 to 180)
  };
  // When coordinates are provided, the system will:
  // 1. Query NOAA catalog for charts containing this location
  // 2. Select the most detailed chart available
  // 3. Use that chart for water/land classification
  
  // Feature types to include
  includeFeatures?: {
    waterPolygons?: boolean;      // default: true
    landPolygons?: boolean;       // default: true
    coastlines?: boolean;         // default: true
    navigationAreas?: boolean;    // fairways, channels (default: false)
    dangers?: boolean;            // rocks, wrecks above water (default: false)
  };
  
  // Processing options
  processing?: {
    mergeAdjacentWater?: boolean; // Merge touching water polygons (default: true)
    fillGaps?: boolean;           // Fill small gaps in coastlines (default: true)
    smoothing?: boolean;          // Apply smoothing to boundaries (default: false)
  };
  
  // Bounding box filter
  boundingBox?: BoundingBox;
  
  // Pagination
  limit?: number;   // Max features per response (default: 100, max: 1000)
  offset?: number;  // Skip N features for pagination (default: 0)
}

interface GetWaterLandClassificationOutput {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: Polygon | MultiPolygon | LineString;
    properties: {
      classification: 'water' | 'land' | 'coastline' | 'navigation' | 'danger';
      subType?: string; // ocean, lake, island, mainland, fairway, etc.
      area_km2?: number; // for polygons
      length_km?: number; // for lines
      depth_range?: { min: number; max: number }; // for water areas
      navigable?: boolean;
      source: string; // S-57 feature type
    };
  }>;
  
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
```

## Enhanced S-57 Feature Support

### Original Feature Types
- **COALNE**: Natural coastline
- **SLCONS**: Shoreline construction
- **DEPARE**: Depth areas (0m boundaries)
- **DEPCNT**: Depth contours (0m)
- **LNDARE**: Land areas
- **BUAARE**: Built-up areas
- **LNDRGN**: Land regions
- **HRBARE**: Harbor areas
- **PRYARE**: Pilot boarding areas
- **ACHARE**: Anchorage areas
- **MORFAC**: Mooring facilities
- **PONTON**: Pontoons
- **FLODOC**: Floating docks
- **HULKES**: Hulks
- **CAUSWY**: Causeways
- **DAMCON**: Dams
- **GATCON**: Gates

### Infrastructure Features
- **BRIDGE**: Bridge structures
- **PYLONS**: Pylons/pillars
- **CRANES**: Crane structures
- **CONVYR**: Conveyor systems

### Port Features
- **BERTHS**: Berth structures
- **TERMNL**: Terminal boundaries
- **DRYDOC**: Dry dock
- **LOKBSN**: Lock basin

### Boundary Features
- **FNCLNE**: Fence line
- **RAILWY**: Railway
- **DMPGRD**: Dumping ground

### Enhanced Feature Categories

#### Tidal Features
- **DEPARE with DRVAL1 < 0**: Areas exposed at low tide
- **TIDEWY**: Tideway (tidal channels)
- **SWPARE**: Swept area
- **VEGATN**: Vegetation (mangroves, marshes)

#### Natural Boundaries
- **SBDARE**: Seabed area
- **SNDWAV**: Sand waves
- **UNSARE**: Unsurveyed area
- **ICEARE**: Ice area

#### Additional Infrastructure
- **OFSPLF**: Offshore platform
- **PIPARE**: Pipeline area
- **PIPSOL**: Pipeline submarine/on land
- **CBLARE**: Cable area
- **CBLSUB**: Cable submarine

#### Administrative Boundaries
- **COSARE**: Continental shelf area
- **MIPARE**: Military practice area
- **ADMARE**: Administration area
- **CONZNE**: Contiguous zone

#### Specialized Port Features
- **HRBFAC**: Harbor facility
- **SMCFAC**: Small craft facility
- **CHKPNT**: Checkpoint
- **FORSTC**: Fortified structure

#### Depth Channels
- **DWRTCL**: Deep water route centerline
- **DWRTPT**: Deep water route part

#### Restricted Areas
- **CTNARE**: Caution area
- **RESARE**: Restricted area

#### Validation Features
- **CURENT**: Current
- **WATTUR**: Water turbulence
- **STSLNE**: Shoreline stabilization line

## Payload Size Management

### MCP Constraints
- **Maximum response size**: 90KB (hard limit)
- **Warning threshold**: 75KB (suggest optimization)
- **Target response size**: <50KB for optimal performance

### Size Management Strategies

#### 1. Pre-flight Size Estimation
Before processing, estimate response size:
```typescript
interface SizeEstimation {
  estimatedFeatures: number;
  estimatedSize: number;
  exceedsLimit: boolean;
  suggestions?: {
    recommendedLimit: number;
    recommendedSimplification: boolean;
    recommendedBoundingBox?: BoundingBox;
  };
}
```

#### 2. Automatic Optimizations
When approaching size limits:
- **Progressive simplification**: Automatically increase tolerance
- **Feature reduction**: Prioritize most important features
- **Property trimming**: Remove non-essential metadata
- **Coordinate precision**: Reduce decimal places (6 decimals = ~10cm accuracy)

#### 3. Error Responses for Size Issues
```typescript
interface SizeLimitError {
  error: "Response too large";
  code: "SIZE_LIMIT_EXCEEDED";
  estimatedSize: number;
  featureCount: number;
  suggestions: {
    useLimit: number;        // Suggested limit parameter
    useBoundingBox: boolean; // Reduce geographic area
    enableSimplification: boolean;
    reduceFeatureSources: string[]; // Which sources to disable
  };
  example: {               // Example request with suggestions applied
    limit: number;
    simplification: { enabled: true, tolerance: number };
    boundingBox?: BoundingBox;
  };
}
```

#### 4. Response Validation
```typescript
// ResponseValidator from OpenMapTiles pattern
class ResponseValidator {
  static validate(response: any): ResponseMetrics {
    return {
      characterCount: number;
      featureCount: number;
      estimatedSize: number;
      warnings: string[];
    };
  }
  
  static estimateSize(
    featureCount: number,
    avgCoordsPerFeature: number
  ): number;
}
```

#### 5. Implementation Pattern
```typescript
async function handleWithSizeManagement(params: any) {
  // 1. Estimate size before processing
  const estimation = await estimateResponseSize(params);
  
  if (estimation.exceedsLimit && !params.limit) {
    return createSizeLimitError(estimation);
  }
  
  // 2. Process with constraints
  let result = await processFeatures(params);
  
  // 3. Validate response size
  const metrics = ResponseValidator.validate(result);
  
  // 4. Apply automatic optimizations if needed
  if (metrics.estimatedSize > 75000) {
    result = applyAutoOptimizations(result, params);
  }
  
  // 5. Add warnings to metadata
  if (metrics.warnings.length > 0) {
    result.metadata.warnings = metrics.warnings;
  }
  
  return result;
}
```

### User Guidance
When size limits are approached, provide clear guidance:

1. **Use pagination**: "Response contains 500+ features. Use limit=100 for better performance."
2. **Enable simplification**: "Large coordinate count detected. Enable simplification to reduce size."
3. **Reduce area**: "Area too large for detail level. Use bounding box or reduce area."
4. **Filter features**: "Many feature types selected. Consider filtering to essential types only."

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

#### 1.1 Dependencies to Add
```json
{
  "dependencies": {
    "@turf/helpers": "^7.0.0",
    "@turf/line-merge": "^7.0.0",
    "@turf/line-split": "^7.0.0",
    "@turf/boolean-point-in-polygon": "^7.0.0",
    "@turf/buffer": "^7.0.0",
    "@turf/simplify": "^7.0.0",
    "@turf/length": "^7.0.0",
    "@turf/bearing": "^7.0.0",
    "@turf/polygon-to-line": "^7.0.0",
    "@turf/difference": "^7.0.0",
    "@turf/union": "^7.0.0",
    "@turf/nearest-point-on-line": "^7.0.0"
  }
}
```

#### 1.2 New Service Classes
Create in `src/services/`:

```typescript
// src/services/coastline/CoastlineExtractor.ts
export class CoastlineExtractor {
  extractFromDepthAreas(features: Feature[]): LineString[]
  extractFromLandAreas(features: Feature[]): LineString[]
  extractExplicitCoastlines(features: Feature[]): LineString[]
  extractFromDepthContours(features: Feature[]): LineString[]
  extractFromHarborFeatures(features: Feature[]): LineString[]
  extractFromMooringFeatures(features: Feature[]): LineString[]
  extractFromSpecialFeatures(features: Feature[]): LineString[]
  // Infrastructure methods
  extractFromBridges(features: Feature[]): LineString[]
  extractFromPylons(features: Feature[]): LineString[]
  extractFromCranes(features: Feature[]): LineString[]
  extractFromConveyors(features: Feature[]): LineString[]
  // Port methods
  extractFromBerths(features: Feature[]): LineString[]
  extractFromTerminals(features: Feature[]): LineString[]
  extractFromDryDocks(features: Feature[]): LineString[]
  extractFromLockBasins(features: Feature[]): LineString[]
  // Boundary methods
  extractFromFenceLines(features: Feature[]): LineString[]
  extractFromRailways(features: Feature[]): LineString[]
  extractFromDumpingGrounds(features: Feature[]): LineString[]
  // Enhanced methods
  extractFromTidalFeatures(features: Feature[]): LineString[]
  extractFromNaturalBoundaries(features: Feature[]): LineString[]
  extractFromAdditionalInfrastructure(features: Feature[]): LineString[]
  extractFromAdministrativeBoundaries(features: Feature[]): LineString[]
  extractFromSpecializedPortFeatures(features: Feature[]): LineString[]
  extractFromDepthChannels(features: Feature[]): LineString[]
  extractFromRestrictedAreas(features: Feature[]): LineString[]
  extractFromValidationFeatures(features: Feature[]): LineString[]
  // Utility methods
  classifyCoastlineType(line: LineString, context: Feature[]): CoastlineType
  extractAllCoastlines(features: Feature[], options: any): LineString[]
}

// src/services/coastline/CoastlineStitcher.ts
export class CoastlineStitcher {
  stitchSegments(segments: LineString[], tolerance: number, gapFilling?: GapFillingOptions): LineString[]
  findConnectableEndpoints(segments: LineString[]): ConnectionMap
  mergeConnectedSegments(segments: LineString[]): LineString[]
  detectGaps(segments: LineString[]): Gap[]
  fillGaps(segments: LineString[], options: GapFillingOptions): LineString[]
}

// src/services/coastline/CoastlineProcessor.ts
export class CoastlineProcessor {
  simplifyCoastline(line: LineString, tolerance: number): LineString
  smoothCoastline(line: LineString, iterations: number): LineString
  determineWaterSide(line: LineString, waterFeatures: Polygon[]): 'left' | 'right'
  calculateMetrics(line: LineString): CoastlineMetrics
  processCoastline(coastline: Feature, options: ProcessingOptions): CoastlineFeature
  estimateResponseSize(features: Feature[]): number
  reduceCoordinatePrecision(features: Feature[]): Feature[]
}

// src/services/classification/WaterLandClassifier.ts
export class WaterLandClassifier {
  classifyFeatures(features: Feature[]): ClassifiedFeature[]
  mergeWaterPolygons(features: Feature[]): Polygon[]
  deriveLandPolygons(bounds: BBox, waterPolygons: Polygon[]): Polygon[]
  extractNavigationAreas(features: Feature[]): NavigationArea[]
}
```

### Phase 2: Pattern Reuse from OpenMapTiles (Week 2)

#### 2.1 Adapt Core Algorithms
From `openmaptiles-mcp/src/services/coastlineExtractor.ts`:
- `extractFromPolygon()` - Extract exterior/interior rings
- `mergeCoastlines()` - Connect adjacent segments
- `pointsEqual()` - Endpoint comparison with tolerance

From `openmaptiles-mcp/src/services/polygonMerger.ts`:
- `mergeWaterFeatures()` - Merge adjacent water polygons
- `findConnectedComponents()` - Group connected features
- Buffer and union operations

From `openmaptiles-mcp/src/handlers/getLandWaterClassification.ts`:
- Land polygon generation via subtraction
- Feature classification logic
- Statistics calculation

#### 2.2 Database Schema Extensions
```sql
-- Add coastline cache table
CREATE TABLE IF NOT EXISTS coastline_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chart_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  coastline_type TEXT NOT NULL,
  geometry TEXT NOT NULL,
  properties TEXT,
  length_m REAL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(chart_id, cache_key),
  FOREIGN KEY (chart_id) REFERENCES charts(chart_id) ON DELETE CASCADE
);

CREATE INDEX idx_coastline_cache_chart ON coastline_cache(chart_id);
CREATE INDEX idx_coastline_type ON coastline_cache(coastline_type);
```

### Phase 3: S-57 Specific Adaptations (Week 3)

#### 3.1 Feature Mapping
```typescript
// Map S-57 features to water/land classification
const S57_WATER_FEATURES = [
  'DEPARE', // Depth areas with DRVAL1 >= 0
  'DRGARE', // Dredged areas
  'CANALS', // Canals
  'RIVERS', // Rivers
  'LAKARE', // Lakes
];

const S57_LAND_FEATURES = [
  'LNDARE', // Land areas
  'BUAARE', // Built-up areas
  'LNDRGN', // Land regions
];

const S57_COASTLINE_FEATURES = [
  'COALNE', // Coastline
  'SLCONS', // Shoreline construction
];

const S57_NAVIGATION_FEATURES = [
  'FAIRWY', // Fairways
  'DWRTCL', // Deep water route centerline
  'NAVLNE', // Navigation line
  'RECTRC', // Recommended track
];

// Enhanced feature categories
const S57_TIDAL_FEATURES = [
  'DEPARE_TIDAL', // Special handling for DEPARE with DRVAL1 < 0
  'TIDEWY',
  'SWPARE',
  'VEGATN'
];

const S57_NATURAL_BOUNDARY_FEATURES = [
  'SBDARE',
  'SNDWAV',
  'UNSARE',
  'ICEARE'
];

// ... etc for all new categories
```

#### 3.2 Depth-Based Extraction
```typescript
// Extract coastline from depth areas
function extractCoastlineFromDepthArea(depthArea: Feature): LineString[] {
  // Process 0-depth boundaries
  if (depthArea.properties.DRVAL1 === 0) {
    // Standard coastline extraction
  }
  
  // Process tidal areas (negative depths)
  if (depthArea.properties.DRVAL1 < 0) {
    // Tidal zone extraction with special metadata
  }
  
  // Convert polygon to lines
  const lines = polygonToLine(depthArea);
  
  // Classify as coastline
  return lines.map(line => ({
    ...line,
    properties: {
      ...line.properties,
      source: 'DEPARE',
      type: 'coastline',
      tidalLevel: depthArea.properties.DRVAL1
    }
  }));
}
```

### Phase 4: Handler Implementation (Week 4)

#### 4.1 Handler Structure
```typescript
// src/handlers/extractCoastlines.ts
export async function extractCoastlinesHandler(args: unknown) {
  // 1. Validate input
  // 2. Get chart features
  // 3. Extract coastlines by method
  // 4. Stitch segments
  // 5. Classify and add metadata
  // 6. Apply simplification
  // 7. Return processed coastlines
}

// src/handlers/getWaterLandClassification.ts
export async function getWaterLandClassificationHandler(args: unknown) {
  // 1. Validate input
  // 2. Get chart features
  // 3. Classify water/land features
  // 4. Merge adjacent polygons
  // 5. Extract coastlines
  // 6. Calculate statistics
  // 7. Return classification
}
```

#### 4.2 Integration Points
- Reuse existing `getChartHandler` for feature fetching
- Extend `S57DatabaseParser` for coastline-specific queries
- Add caching using existing `CacheManager`
- Store processed coastlines in database

### Phase 5: Testing & Optimization (Week 5)

#### 5.1 Test Cases
- Single chart coastline extraction (San Diego Bay)
- Island detection and classification
- Gap detection and reporting
- Performance with large charts
- Accuracy of water-side detection
- Tidal feature extraction
- Natural boundary validation
- Infrastructure coastline detection
- Administrative boundary filtering

#### 5.2 Performance Optimizations
- Cache processed coastlines
- Use spatial indexing for connectivity checks
- Batch process features
- Progressive simplification based on zoom
- Feature-level caching for complex calculations
- Parallel processing for enhanced features

## File Structure

```
enc-charts-mcp/
├── src/
│   ├── services/
│   │   ├── coastline/
│   │   │   ├── CoastlineExtractor.ts
│   │   │   ├── CoastlineStitcher.ts
│   │   │   ├── CoastlineProcessor.ts
│   │   │   └── index.ts
│   │   ├── classification/
│   │   │   ├── WaterLandClassifier.ts
│   │   │   └── index.ts
│   │   └── geometry/
│   │       ├── GeometryUtils.ts
│   │       └── index.ts
│   ├── handlers/
│   │   ├── extractCoastlines.ts
│   │   ├── extractCoastlines.spec.ts
│   │   ├── getWaterLandClassification.ts
│   │   └── getWaterLandClassification.spec.ts
│   ├── types/
│   │   └── coastline.ts
│   └── constants/
│       └── coastline.ts
```

## Success Criteria

1. **Completeness**: Extract all coastline segments from a single chart
2. **Connectivity**: Successfully stitch >90% of connectable segments
3. **Classification**: Correctly identify mainland vs island coastlines
4. **Performance**: Process typical chart in <5 seconds
5. **Accuracy**: Water-side detection >95% accurate
6. **Usability**: AI can use output directly without post-processing
7. **Enhanced Coverage**: Successfully extract coastlines from 50+ S-57 feature types
8. **Tidal Accuracy**: Correctly identify and classify tidal features
9. **Validation**: Natural features validated for water proximity

## Example Usage

```typescript
// Extract coastlines from San Diego Bay chart using chart ID
const coastlines = await extractCoastlines({
  chartId: 'US5CA72M',  // San Diego Bay chart
  extractionMethod: 'combined',
  featureSources: {
    // Original features
    useCoastlines: true,
    useDepthAreas: true,
    useLandAreas: true,
    useShorelineConstruction: true,
    // Enhanced features
    useTidalFeatures: true,
    useNaturalBoundaries: true,
    useAdditionalInfrastructure: true,
    // ... etc
  },
  stitching: {
    enabled: true,
    tolerance: 50,
    mergeConnected: true,
    gapFilling: {
      enabled: true,
      maxGapDistance: 100,
      method: 'linear',
      validateWithWaterBodies: true
    }
  },
  classification: {
    separateByType: true,
    includeMetadata: true
  }
});

// Extract coastlines using GPS coordinates (automatic chart selection)
const coastlinesByCoords = await extractCoastlines({
  coordinates: { lat: 32.714935, lon: -117.228975 }, // Shelter Island, San Diego
  extractionMethod: 'combined',
  featureSources: {
    // Enable all enhanced features
    useTidalFeatures: true,
    useNaturalBoundaries: true,
    useAdditionalInfrastructure: true,
    useAdministrativeBoundaries: true,
    useSpecializedPortFeatures: true,
    useDepthChannels: true,
    useRestrictedAreas: true,
    useValidationFeatures: true
  },
  stitching: {
    enabled: true,
    tolerance: 50,
    mergeConnected: true
  }
});
// The system will automatically find and use the most detailed chart
// covering this location (likely US5CA72M)

// Get water/land classification
const classification = await getWaterLandClassification({
  chartId: 'US5CA72M',
  includeFeatures: {
    waterPolygons: true,
    landPolygons: true,
    coastlines: true,
    navigationAreas: true
  },
  processing: {
    mergeAdjacentWater: true,
    fillGaps: true
  }
});
```

## Timeline

- **Week 1**: Core infrastructure and dependencies
- **Week 2**: Port algorithms from OpenMapTiles
- **Week 3**: S-57 specific adaptations (including enhanced features)
- **Week 4**: Handler implementation
- **Week 5**: Testing and optimization
- **Total**: 5 weeks to production-ready

## Test Validation Pattern

### Overview
The San Diego coastline tests demonstrate a critical pattern for validating coastline extraction functionality through simple canvas-based visualizations. These tests extract data directly from the MCP handlers and render it without any external map tiles or dependencies.

**Key Test Location**: Shelter Island, San Diego (32.714935, -117.228975)
**Chart Used**: US5CA72M (San Diego Bay)
**Bounding Box**: 32.70-32.73°N, 117.20-117.25°W

### Test Implementation Pattern

#### 1. Direct Handler Testing
Tests bypass the MCP server protocol and directly call handlers:
```javascript
// Initialize database
const dbInit = initializeDatabase({
  memory: false,
  dataDir: './test-cache/database',
  verbose: false
});
setDatabaseRepositories(dbInit.chartRepository, dbInit.featureRepository);

// Call handler directly
const coastlineResult = await extractCoastlinesHandler(coastlineArgs);
```

#### 2. Simple Canvas Rendering
Visualizations use HTML5 Canvas with direct coordinate transformation:
```javascript
// Fixed bounds for consistent rendering
const BOUNDS = {
  minLat: 32.70,
  maxLat: 32.73,
  minLon: -117.25,
  maxLon: -117.20
};

// Coordinate transformation
function toCanvas(lon, lat) {
    const x = ((lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * width;
    const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * height;
    return { x, y };
}

// Render coastlines
ctx.strokeStyle = color;
ctx.lineWidth = 2;
ctx.beginPath();
coords.forEach((coord, index) => {
    const { x, y } = toCanvas(coord[0], coord[1]);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
});
ctx.stroke();
```

#### 3. Visual Validation
- **Light blue background** represents water
- **Colored lines** represent different coastline sources (COALNE, BUAARE, etc.)
- **Red dot** marks the test location (Shelter Island)
- **No map tiles** - only raw vector data from MCP tools

### Test Execution Steps

1. **Run the test script**:
   ```bash
   cd docs/tests/san-diego-coastline-test
   node test-simple-render.js
   ```

2. **Open the generated HTML**:
   ```bash
   open simple-coastline-render.html
   ```

3. **Take a screenshot** using MCP Playwright tools:
   ```javascript
   // Use MCP Playwright browser tools
   await mcp__playwright__browser_navigate('file:///path/to/simple-coastline-render.html');
   await mcp__playwright__browser_take_screenshot({ filename: 'screenshot.png' });
   ```

4. **Validate the results**:
   - Shelter Island should appear as a **peninsula** (connected to mainland)
   - Coastlines should form continuous features
   - Different source types should be distinguishable by color
   - Screenshot MUST show visible coastline features

### Enhanced Feature Test Validation

For enhanced features, additional validation includes:

```javascript
// Validate metadata structure
console.log('\n=== Feature Source Analysis ===');
const sources = coastlineData.metadata?.sources || {};
console.log('Feature sources found:');
Object.entries(sources).forEach(([source, data]) => {
  console.log(`  ${source}: ${data.count} features, ${(data.totalLength_m / 1000).toFixed(2)} km`);
  
  // Validate enhanced metadata fields
  if (data.category) {
    console.log(`    Category: ${data.category}`);
  }
});

// Check for feature categories
if (coastlineData.metadata?.featureCategories) {
  console.log('\n=== Feature Category Summary ===');
  Object.entries(coastlineData.metadata.featureCategories).forEach(([category, stats]) => {
    console.log(`${category}: ${stats.count} features, ${(stats.length_m / 1000).toFixed(2)} km`);
  });
}

// Validate individual features
coastlineData.features.forEach((feature, index) => {
  const sources = feature.properties?.sourceFeatures || [];
  
  // Check for tidal features
  if (sources.includes('DEPARE') && feature.properties.tidalLevel < 0) {
    console.log(`Feature ${index}: Tidal DEPARE at level ${feature.properties.tidalLevel}m`);
  }
  
  // Check for vegetation
  if (sources.includes('VEGATN') && feature.properties.vegetationType) {
    console.log(`Feature ${index}: Vegetation type ${feature.properties.vegetationType}`);
  }
});
```

### Artifact Creation Process

ALL TESTS MUST HAVE COASTLINE FEATURES. If the render is missing coastline features then the test is not valid and must be iterated on until coastline features are rendered.

After successful test execution, create permanent artifacts for documentation:

1. **Create a descriptive subfolder** in `docs/renders/`:
   ```bash
   mkdir -p docs/renders/enhanced-coastline-[category]
   ```
   
   Name should indicate the test purpose (e.g., `enhanced-coastline-tidal`, `enhanced-coastline-infrastructure`)

2. **Create or use a test script** that:
   - Initializes the database properly
   - Uses fixed bounds for consistent rendering
   - Extracts coastlines with the desired configuration
   - Generates HTML visualization with canvas rendering
   - Saves all artifacts

3. **Generate artifacts using the test script**:
   ```javascript
   // Example from render-fixed.js
   const BOUNDS = {
     minLat: 32.70,
     maxLat: 32.73,
     minLon: -117.25,
     maxLon: -117.20
   };
   
   // Extract coastlines
   const result = await extractCoastlinesHandler(coastlineArgs);
   
   // Create visualization
   await createComparisonVisualization(baselineData, enhancedData);
   ```

4. **Take screenshot using MCP Playwright**:
   ```javascript
   await mcp__playwright__browser_navigate(`file://${__dirname}/render.html`);
   await mcp__playwright__browser_take_screenshot({ filename: 'screenshot.png' });
   ```

5. **Create a README.md** documenting:
   - Test purpose and what's being validated
   - Chart information (ID, location, coordinates)
   - Features extracted (count, types, total length)
   - Implementation status
   - Visualization notes explaining what's visible

6. **Standard artifact structure**:
   ```
   docs/renders/[test-purpose-name]/
   ├── README.md             # Test description and results
   ├── render-fixed.js       # The test script (or test-script.js)
   ├── coastline-data.json   # Raw extracted GeoJSON data
   ├── render.html          # Visualization HTML
   └── screenshot.png       # Visual proof with VISIBLE coastlines
   ```

### Color Scheme for Enhanced Features

```javascript
// Extended color scheme for all features
const colors = {
  // Original features
  'COALNE': '#0000ff',    // Blue - natural coastline
  'SLCONS': '#ff0000',    // Red - constructed
  'DEPARE': '#00ff00',    // Green - depth-based
  'LNDARE': '#ffff00',    // Yellow - land areas
  'BUAARE': '#ff00ff',    // Magenta - built-up areas
  'MORFAC': '#00ffff',    // Cyan - mooring facilities
  'PONTON': '#ffa500',    // Orange - pontoons
  'FLODOC': '#800080',    // Purple - floating docks
  
  // Infrastructure features
  'BRIDGE': '#8B4513',    // Brown
  'PYLONS': '#FF6347',    // Tomato
  'CRANES': '#FF1493',    // Deep pink
  'CONVYR': '#FF69B4',    // Hot pink
  
  // Port features
  'BERTHS': '#4B0082',    // Indigo
  'TERMNL': '#9370DB',    // Medium purple
  'DRYDOC': '#8A2BE2',    // Blue violet
  'LOKBSN': '#9932CC',    // Dark orchid
  
  // Boundary features
  'FNCLNE': '#D2691E',    // Chocolate
  'RAILWY': '#A0522D',    // Sienna
  'DMPGRD': '#8B7355',    // Burlywood
  
  // Tidal features
  'DEPARE_TIDAL': '#FF6600', // Orange - tidal zones
  'TIDEWY': '#FF9933',       // Light orange
  'VEGATN': '#006400',       // Dark green - vegetation
  'SWPARE': '#228B22',       // Forest green
  
  // Natural boundaries
  'SBDARE': '#8B4513',       // Brown - seabed
  'SNDWAV': '#F4A460',       // Sandy brown
  'UNSARE': '#DEB887',       // Burlywood
  'ICEARE': '#E0FFFF',       // Light cyan
  
  // Additional infrastructure
  'OFSPLF': '#FF1493',       // Deep pink - platforms
  'PIPARE': '#DC143C',       // Crimson
  'PIPSOL': '#B22222',       // Fire brick
  'CBLARE': '#8B0000',       // Dark red
  'CBLSUB': '#800000',       // Maroon
  
  // Administrative boundaries
  'COSARE': '#00CED1',       // Dark turquoise
  'MIPARE': '#DC143C',       // Crimson - military
  'ADMARE': '#4682B4',       // Steel blue
  'CONZNE': '#5F9EA0',       // Cadet blue
  
  // Specialized port features
  'HRBFAC': '#4B0082',       // Indigo
  'SMCFAC': '#9370DB',       // Medium purple
  'CHKPNT': '#FF4500',       // Orange red
  'FORSTC': '#B22222',       // Fire brick
  
  // Depth channels
  'DWRTCL': '#1E90FF',       // Dodger blue
  'DWRTPT': '#00BFFF',       // Deep sky blue
  
  // Restricted areas
  'CTNARE': '#FFD700',       // Gold
  'RESARE': '#FFA500',       // Orange
  
  // Validation features
  'CURENT': '#4169E1',       // Royal blue
  'WATTUR': '#6495ED',       // Cornflower blue
  'STSLNE': '#7B68EE'        // Medium slate blue
};
```

### Key Differences from E2E/Unit Tests

1. **Visual Output**: Produces HTML files for human inspection
2. **Direct Handler Calls**: No MCP protocol overhead
3. **Real Chart Data**: Uses actual NOAA chart US5CA72M
4. **Geographic Validation**: Tests real-world geographic features
5. **No External Dependencies**: No map tiles, just raw vector rendering

### Example Test Output
The test creates in the test directory:
- `simple-render-data.json` - Raw coastline GeoJSON data
- `simple-coastline-render.html` - Canvas-based visualization
- `san-diego-coastlines-screenshot.png` - Visual proof

And the artifacts in `docs/renders/[test-name]/`:
- `coastline-data.json` - Processed coastline data
- `render.html` - Final visualization
- `screenshot.png` - MCP Playwright screenshot with visible coastlines
- `README.md` - Documentation of test results

### Benefits of This Pattern

1. **Fast Iteration**: No need to debug MCP protocol issues
2. **Visual Debugging**: Immediately see what data was extracted
3. **Reproducible**: HTML files can be shared and viewed offline
4. **Clear Validation**: Peninsula vs island distinction is obvious
5. **Multiple Sources**: Can see different feature types
6. **Enhanced Validation**: Metadata confirms feature extraction

### Guardrails for AI Agents

When implementing similar tests:
- **DO NOT** use Leaflet, OpenStreetMap, or any map tile services
- **DO** render raw GeoJSON directly to canvas or SVG
- **DO** include coordinate grid and labels for reference
- **DO** mark test locations with distinctive markers
- **DO** use distinct colors for different feature sources
- **DO** save both data and visualization for debugging
- **DO** validate features appear in BOTH visual output AND metadata

## Notes

- Focus on single-chart extraction (no cross-chart stitching)
- Prioritize completeness over perfect accuracy
- Ensure all processing happens server-side
- Design for future enhancements (multi-chart support)
- Consider adding preview/debugging endpoints
- Use simple canvas rendering for test validation
- Enhanced features support 50+ S-57 feature types
- Metadata includes comprehensive source breakdown and categories
