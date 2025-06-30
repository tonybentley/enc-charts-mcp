# Product Requirements Document: Enhanced Coastline Feature Extraction

## Executive Summary

This PRD outlines the addition of comprehensive S-57 feature types to the ENC Charts MCP coastline extraction functionality. The goal is to capture more complete coastline data by including tidal features, natural boundaries, offshore infrastructure, administrative boundaries, and specialized port facilities that represent water/land interfaces but aren't explicitly marked as coastlines in ENC charts.

## Background

Current coastline extraction supports 19 feature types across infrastructure, port, and boundary categories. However, analysis of ENC charts reveals additional feature types that define water/land boundaries in various contexts:
- Intertidal zones exposed at low tide
- Natural features like vegetation lines and seabed transitions
- Offshore infrastructure creating artificial boundaries
- Administrative limits following natural coastlines
- Specialized maritime facilities

## Objectives

1. **Increase Coastline Coverage**: Add support for 30+ additional S-57 feature types that represent water/land boundaries
2. **Improve Tidal Accuracy**: Capture intertidal zones and features exposed at different tide levels
3. **Enhance Natural Boundary Detection**: Include vegetation, seabed transitions, and natural formations
4. **Support Complex Maritime Infrastructure**: Capture offshore platforms, pipelines, and cable areas
5. **Enable Administrative Boundary Extraction**: Include maritime zones and restricted areas
6. **Maintain Performance**: Ensure new features don't significantly impact processing time
7. **Provide Clear Feature Attribution**: Track which S-57 features contributed to each coastline segment

## Functional Requirements

### 1. New Feature Source Options

Add the following feature source options to the `extractCoastlines` tool:

#### 1.1 Tidal Features (`useTidalFeatures`)
- **DEPARE with DRVAL1 < 0**: Areas exposed at low tide (negative depth values)
- **TIDEWY**: Tideway (tidal channels)
- **SWPARE**: Swept area
- **VEGATN**: Vegetation (mangroves, marshes that define coastlines)

#### 1.2 Natural Boundaries (`useNaturalBoundaries`)
- **SBDARE**: Seabed area (transitions between seabed types)
- **SNDWAV**: Sand waves (dynamic coastal features)
- **UNSARE**: Unsurveyed area (often marks coastal boundaries)
- **ICEARE**: Ice area (for polar regions)

#### 1.3 Additional Infrastructure (`useAdditionalInfrastructure`)
- **OFSPLF**: Offshore platform (oil rigs, wind farms)
- **PIPARE**: Pipeline area
- **PIPSOL**: Pipeline submarine/on land
- **CBLARE**: Cable area
- **CBLSUB**: Cable submarine

#### 1.4 Administrative Boundaries (`useAdministrativeBoundaries`)
- **COSARE**: Continental shelf area
- **MIPARE**: Military practice area
- **ADMARE**: Administration area
- **CONZNE**: Contiguous zone

#### 1.5 Specialized Port Features (`useSpecializedPortFeatures`)
- **HRBFAC**: Harbor facility
- **SMCFAC**: Small craft facility
- **CHKPNT**: Checkpoint (port security boundaries)
- **FORSTC**: Fortified structure (coastal defense)

#### 1.6 Depth Channels (`useDepthChannels`)
- **DWRTCL**: Deep water route centerline (channel edges)
- **DWRTPT**: Deep water route part

#### 1.7 Restricted Areas (`useRestrictedAreas`)
- **CTNARE**: Caution area (often near coast)
- **RESARE**: Restricted area (coastal boundaries)

#### 1.8 Validation Features (`useValidationFeatures`)
- **CURENT**: Current (flow patterns indicate channels)
- **WATTUR**: Water turbulence (at coastal interfaces)
- **STSLNE**: Shoreline stabilization line

### 2. Special Processing Requirements

#### 2.1 Tidal Zone Processing
- DEPARE features with negative DRVAL1 values should be processed differently
- Add `tidalLevel` property to indicate exposure level
- Classify as `subType: 'intertidal'`

#### 2.2 Natural Feature Validation
- Vegetation boundaries should only be included if adjacent to water features
- Implement proximity validation (within 50m of water)

#### 2.3 Infrastructure Boundary Detection
- For linear features (pipelines, cables), extract parallel boundaries
- For area features (platforms), extract perimeter as coastline

#### 2.4 Administrative Boundary Filtering
- Only include segments that follow natural coastlines
- Exclude straight administrative lines in open water

### 3. Metadata Requirements

Each extracted coastline feature must include:

```typescript
properties: {
  // Existing properties
  type: 'coastline' | 'shoreline' | 'constructed';
  subType: string; // Extended with new subtypes
  source: 'explicit' | 'derived';
  sourceFeatures: string[]; // Array of S-57 feature types
  
  // New properties for enhanced features
  tidalLevel?: number; // For tidal features (DRVAL1 value)
  vegetationType?: string; // For VEGATN features
  infrastructureType?: string; // For OFSPLF, PIPARE, etc.
  administrativeType?: string; // For COSARE, MIPARE, etc.
  naturalFeatureType?: string; // For SBDARE, SNDWAV, etc.
  
  // Validation metadata
  proximityToWater?: number; // Distance to nearest water feature
  validationMethod?: string; // How the feature was validated
}
```

### 4. Response Metadata Enhancement

The response metadata must include comprehensive source breakdown:

```typescript
metadata: {
  sources: {
    [featureType: string]: {
      count: number;
      totalLength_m: number;
      // New fields
      category: 'tidal' | 'natural' | 'infrastructure' | 'administrative' | 'port' | 'boundary' | 'original';
      averageProximityToWater_m?: number;
    }
  },
  // New summary statistics
  featureCategories: {
    tidal: { count: number; length_m: number };
    natural: { count: number; length_m: number };
    infrastructure: { count: number; length_m: number };
    administrative: { count: number; length_m: number };
    port: { count: number; length_m: number };
    boundary: { count: number; length_m: number };
    original: { count: number; length_m: number };
  }
}
```

## Visual Test Requirements

Following the established patterns from `docs/COASTLINE_EXTRACTION_PROJECT.md`:

### 1. Test Location and Chart Information

**Key Test Location**: Shelter Island, San Diego (32.714935, -117.228975)
**Chart Used**: US5CA72M (San Diego Bay)
**Bounding Box**: 32.70-32.73°N, 117.20-117.25°W

### 2. Test Validation Pattern

#### 2.1 Direct Handler Testing
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

#### 2.2 Simple Canvas Rendering
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

#### 2.3 Visual Validation
- **Light blue background** represents water
- **Colored lines** represent different coastline sources
- **Red dot** marks the test location (Shelter Island)
- **No map tiles** - only raw vector data from MCP tools

### 3. Test Structure

Create test files following the established pattern:

```
docs/tests/enhanced-coastline-features/
├── test-tidal-features.js
├── test-natural-boundaries.js
├── test-infrastructure-coastlines.js
├── test-administrative-boundaries.js
├── test-all-features-combined.js
└── test-cache/
    └── database/
```

### 4. Test Execution Steps

1. **Run the test script**:
   ```bash
   cd docs/tests/enhanced-coastline-features
   node test-[category].js
   ```

2. **Open the generated HTML**:
   ```bash
   open [category]-coastline-render.html
   ```

3. **Take a screenshot using MCP Playwright tools**:
   ```javascript
   // Use MCP Playwright browser tools
   await mcp__playwright__browser_navigate(`file://${__dirname}/[category]-coastline-render.html`);
   await mcp__playwright__browser_take_screenshot({ filename: '[category]-screenshot.png' });
   ```

4. **Validate the results**:
   - New features should be visible with distinct colors
   - Metadata should show feature counts and categories
   - Screenshot MUST show visible coastline features

### 5. Artifact Creation Process

ALL TESTS MUST HAVE COASTLINE FEATURES. If the render is missing coastline features then the test is not valid and must be iterated on until coastline features are rendered.

After successful test execution, create permanent artifacts for documentation:

1. **Create a descriptive subfolder** in `docs/renders/`:
   ```bash
   mkdir -p docs/renders/enhanced-coastline-[category]
   ```
   
   Name should indicate the test purpose (e.g., `enhanced-coastline-tidal`, `enhanced-coastline-infrastructure`)

2. **Standard artifact structure**:
   ```
   docs/renders/enhanced-coastline-[category]/
   ├── README.md             # Test description and results
   ├── render-fixed.js       # The test script (or test-script.js)
   ├── coastline-data.json   # Raw extracted GeoJSON data
   ├── render.html          # Visualization HTML
   └── screenshot.png       # Visual proof with VISIBLE coastlines
   ```

3. **Create README.md** documenting:
   - Test purpose and what's being validated
   - Chart information (US5CA72M, San Diego Bay)
   - Features extracted (count, types, total length)
   - Implementation status
   - Visualization notes explaining what's visible

### 6. Color Scheme for New Features

Extend the existing color scheme while maintaining consistency:

```javascript
// Existing colors (from test-simple-render.js)
const colors = {
  'COALNE': '#0000ff',    // Blue
  'SLCONS': '#ff0000',    // Red
  'DEPARE': '#00ff00',    // Green
  'LNDARE': '#ffff00',    // Yellow
  'BUAARE': '#ff00ff',    // Magenta
  'MORFAC': '#00ffff',    // Cyan
  'PONTON': '#ffa500',    // Orange
  'FLODOC': '#800080',    // Purple
  
  // New feature colors
  'DEPARE_TIDAL': '#ff6600',  // Orange - tidal zones
  'TIDEWY': '#ff9933',        // Light orange
  'VEGATN': '#006400',        // Dark green - vegetation
  'SBDARE': '#8B4513',        // Brown - seabed
  'OFSPLF': '#FF1493',        // Deep pink - platforms
  'MIPARE': '#DC143C',        // Crimson - military
  'HRBFAC': '#4B0082',        // Indigo
  // ... etc
};
```

### 7. Metadata Validation in Tests

Add metadata validation to ensure features appear in both visual output AND response metadata:

```javascript
// After extracting coastlines
const coastlineData = typeof coastlineResult === 'string' 
  ? JSON.parse(coastlineResult) 
  : coastlineResult;

// Check for error response
if (coastlineData.error) {
  console.error('Error extracting coastlines:', coastlineData.error);
  process.exit(1);
}

// Validate metadata structure
console.log('\n=== Feature Source Analysis ===');
const sources = coastlineData.metadata?.sources || {};
console.log('Feature sources found:');
Object.entries(sources).forEach(([source, data]) => {
  console.log(`  ${source}: ${data.count} features, ${(data.totalLength_m / 1000).toFixed(2)} km`);
  
  // Validate new metadata fields
  if (data.category) {
    console.log(`    Category: ${data.category}`);
  }
});

// Check for new feature categories
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

### 8. Example Test Output

The test creates in the test directory:
- `[category]-render-data.json` - Raw coastline GeoJSON data
- `[category]-coastline-render.html` - Canvas-based visualization
- `[category]-screenshot.png` - MCP Playwright screenshot

And the artifacts in `docs/renders/enhanced-coastline-[category]/`:
- `coastline-data.json` - Processed coastline data
- `render.html` - Final visualization
- `screenshot.png` - MCP Playwright screenshot with visible coastlines
- `README.md` - Documentation of test results

### 9. Guardrails for Implementation

Following the project guidelines:
- **DO NOT** use Leaflet, OpenStreetMap, or any map tile services
- **DO** render raw GeoJSON directly to canvas
- **DO** include coordinate grid and labels for reference
- **DO** mark test locations with distinctive markers
- **DO** use distinct colors for different feature sources
- **DO** save both data and visualization for debugging
- **DO** validate that features appear in BOTH visual output and metadata
- **DO** use MCP Playwright for screenshots, not manual browser tools

## Example Usage

Updated to reflect correct chart ID and coordinates:

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
    // New features
    useTidalFeatures: true,
    useNaturalBoundaries: true,
    useAdditionalInfrastructure: true,
    // ... etc
  },
  stitching: {
    enabled: true,
    tolerance: 10,
    mergeConnected: true
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
    // Enable new features
    useTidalFeatures: true,
    useNaturalBoundaries: true,
    // ... etc
  },
  stitching: {
    enabled: true,
    tolerance: 10,
    mergeConnected: true
  }
});
// The system will automatically find and use the most detailed chart
// covering this location (likely US5CA72M)
```

## Implementation Plan

### Phase 1: Core Implementation (Week 1)
1. Update constants with new feature arrays
2. Add new feature source options to schema
3. Implement extraction methods in CoastlineExtractor
4. Add special processing for tidal features

### Phase 2: Validation & Processing (Week 2)
1. Implement proximity validation for natural features
2. Add infrastructure boundary detection
3. Implement administrative boundary filtering
4. Enhance metadata with new properties

### Phase 3: Testing & Visualization (Week 3)
1. Create individual category tests following established patterns
2. Implement visual rendering with extended color scheme
3. Add metadata validation to all tests
4. Use MCP Playwright for automated screenshots

### Phase 4: Performance & Optimization (Week 4)
1. Profile performance impact
2. Optimize extraction algorithms
3. Add caching for complex calculations
4. Final testing and documentation

## Success Criteria

1. **Coverage**: Successfully extract coastlines from all 30+ new feature types
2. **Accuracy**: Tidal features correctly identified with depth values
3. **Validation**: Natural features validated for water proximity
4. **Performance**: Processing time increases by less than 20%
5. **Metadata**: All features include comprehensive attribution in response
6. **Visual Tests**: All tests produce valid artifacts with visible coastlines
7. **Documentation**: Complete feature documentation and examples

## Risk Mitigation

1. **Performance Impact**: Implement feature-level caching and parallel processing
2. **Data Quality**: Add validation to filter noise from administrative boundaries
3. **Complexity**: Provide clear documentation and examples for each feature type
4. **Testing**: Follow established visual test patterns to ensure consistency

## Notes

- Focus on single-chart extraction (no cross-chart stitching)
- Prioritize completeness over perfect accuracy
- Ensure all processing happens server-side
- Use simple canvas rendering for test validation
- ALL TESTS MUST HAVE COASTLINE FEATURES rendered
- Use fixed bounds (32.70-32.73°N, 117.20-117.25°W) for consistent rendering
- Chart US5CA72M for San Diego Bay testing
