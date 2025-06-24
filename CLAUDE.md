# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an ENC (Electronic Navigational Charts) MCP (Model Context Protocol) server project that provides programmatic access to NOAA electronic navigational charts through a standardized MCP interface.

## Development Setup

### Prerequisites
- Node.js 18+ and npm
- TypeScript 5+

### Dependencies
The project requires the following key dependencies:
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `axios` or `node-fetch` - HTTP client for NOAA API calls
- `adm-zip` or `node-stream-zip` - ZIP file extraction for chart downloads
- `typescript`, `@types/node`, `tsx` - TypeScript development tools

### Additional Dependencies Needed
- S-57 parser library (TBD - may require custom implementation)
- Spatial indexing library for efficient chart lookups
- File system cache management utilities

## Environment Variables

The MCP server supports the following environment variables for configuration:

### Cache Configuration
- `ENC_CACHE_DIR` - Custom cache directory path (default: `./cache/charts/`)
- `ENC_CACHE_MAX_SIZE_GB` - Maximum cache size in GB (default: 10)
- `ENC_CACHE_MAX_AGE_DAYS` - Cache expiration age in days (default: 7)

### Usage Examples

#### Running with custom cache directory:
```bash
# Linux/macOS
export ENC_CACHE_DIR=/var/lib/enc-charts
npx @your-org/enc-charts-mcp

# Windows
set ENC_CACHE_DIR=C:\ProgramData\enc-charts
npx @your-org/enc-charts-mcp

# One-liner
ENC_CACHE_DIR=/var/lib/enc-charts npx @your-org/enc-charts-mcp
```

#### Production setup with persistent cache:
```bash
# Create dedicated cache directory
sudo mkdir -p /var/lib/enc-charts
sudo chown $USER:$USER /var/lib/enc-charts

# Set environment variables
export ENC_CACHE_DIR=/var/lib/enc-charts
export ENC_CACHE_MAX_SIZE_GB=50
export ENC_CACHE_MAX_AGE_DAYS=14

# Run server
npx @your-org/enc-charts-mcp
```

#### Docker deployment:
```dockerfile
ENV ENC_CACHE_DIR=/app/cache/charts
ENV ENC_CACHE_MAX_SIZE_GB=20
VOLUME ["/app/cache"]
```

## Project Architecture

### Expected Structure
```
enc-charts-mcp/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── handlers/          # MCP tool request handlers
│   ├── services/          # NOAA API integration services
│   │   ├── chartQuery.ts  # Query charts by coordinates/area
│   │   └── chartDownload.ts # Download and extract charts
│   ├── utils/             # Utility functions
│   │   ├── cache.ts       # Cache management
│   │   └── s57Parser.ts   # S-57 format parser
│   ├── constants/         # S-57 object classes and enums
│   └── types/             # TypeScript interfaces
├── tests/                 # Test files
├── cache/                 # Downloaded chart cache
└── data/                  # Static chart data (if any)
```

### MCP Server Implementation
The server should implement the MCP protocol to provide:
- Chart data retrieval capabilities
- Chart metadata queries
- Navigation calculations and utilities
- ENC format parsing and conversion

## Key Considerations

1. **ENC Data Formats**: Electronic Navigational Charts typically use S-57 or S-101 formats. Consider which format(s) to support.

2. **Data Source**: Charts will be:
   - Downloaded on-demand from NOAA APIs based on coordinates
   - Cached locally in the `cache/` directory
   - Indexed for efficient spatial queries

## NOAA ENC Data Access

### Data Sources and APIs

1. **REST API Service**
   - NOAA ENC Online REST endpoint: `https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/ENCOnline/MapServer/exts/MaritimeChartService`
   - Allows programmatic access to ENC data for web viewers and applications

2. **Direct Downloads**
   - Individual ENCs: Available from NOAA Chart Locator
   - Bulk downloads by region: Available from ENC download page
   - Format: IHO S-57 international exchange format
   - Updates: Weekly for most services, daily for navigation files

3. **ENC Direct to GIS**
   - Web mapping service for displaying, querying, and downloading ENC data
   - Supports multiple GIS/CAD formats
   - Data organized using S-57 object classes
   - Updated weekly

4. **Web Services**
   - OGC GIS Web Services (WMS, WFS, WCS)
   - OPeNDAP protocol support
   - Export formats: CSV, XML, Shapefile, KMZ, NetCDF

### Implementation Considerations
- All NOAA ENC downloads are free of charge
- Data follows IHO S-57 international standard
- Consider caching downloaded charts locally to reduce API calls
- Implement proper error handling for network requests
- Be aware of update frequencies when implementing cache invalidation

### MCP Tools Implemented

The server implements these MCP tools:
   - `get_chart` - Retrieve chart data for a specific area (by chart ID or coordinates)
   - `search_charts` - Search available charts by criteria (including coordinates)
   - `get_chart_metadata` - Get information about a specific chart
   - `calculate_route` - Perform navigation calculations
   - `get_object_classes` - Get information about S-57 object classes and their representations
   - `download_chart` - Download and cache chart data from NOAA (internal use)

### Performance Considerations

Chart data can be large (10-100MB per chart). The implementation includes:
   - Efficient data streaming
   - Caching mechanisms
   - Spatial indexing for quick lookups

## ENC Chart Download Implementation

### Overview
The system will download ENC charts on demand based on GPS coordinates by integrating with NOAA's REST APIs and chart download services. Charts are downloaded in S-57 format and cached locally for performance.

### MCP Tool Integration Strategy

The existing MCP tools need to be enhanced to support coordinate-based chart retrieval:

1. **`get_chart` Enhancement**:
   - Accept EITHER `chartId` OR `coordinates` (lat/lon point)
   - If coordinates provided, automatically find and download the appropriate chart
   - Check cache before downloading
   - Return chart features filtered by optional bounding box

2. **`search_charts` Enhancement**:
   - Already supports bounding box search
   - Should query NOAA API when local results insufficient
   - Cache search results metadata

3. **`get_chart_metadata` Enhancement**:
   - Support coordinate-based queries in addition to chartId
   - Return download status and cache information

4. **Internal Services** (not exposed as MCP tools):
   - Chart query service for NOAA API integration
   - Download service for fetching chart files
   - Cache management utilities

### NOAA API Services

#### 1. Maritime Chart Service (queryDatasets)
Primary service for querying available charts by coordinates.

**Base URL:** `https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/ENCOnline/MapServer/exts/MaritimeChartService/MapServer`

**Note:** No authentication required for NOAA public APIs. CORS may be an issue for browser-based implementations.

**queryDatasets Endpoint:** `/queryDatasets`

**Parameters:**
- `geometry`: Coordinate geometry (point or polygon)
- `geometryType`: Type of geometry (`esriGeometryPoint`, `esriGeometryEnvelope`)
- `inSR`: Input spatial reference (use 4326 for WGS84)
- `outSR`: Output spatial reference
- `returnGeometry`: Return chart boundaries (true/false)
- `f`: Output format (json)

**Example - Query by Point:**
```
GET /queryDatasets?geometry=-122.3321,47.6062&geometryType=esriGeometryPoint&inSR=4326&f=json
```

**Example - Query by Bounding Box:**
```
GET /queryDatasets?geometry={"xmin":-122.5,"ymin":47.5,"xmax":-122.2,"ymax":47.7}&geometryType=esriGeometryEnvelope&inSR=4326&f=json
```

#### 2. ENC Direct Services
Additional services for different chart scales:
- **Coastal** (1:150,001-1:600,000): `https://encdirect.noaa.gov/arcgis/rest/services/encdirect/enc_coastal/MapServer`
- **General** (1:600,001-1:1,500,000): `https://encdirect.noaa.gov/arcgis/rest/services/encdirect/enc_general/MapServer`

#### 3. Chart Download Sources
- **Individual Charts**: `https://www.charts.noaa.gov/ENCs/` (ZIP files)
- **Product Catalog XML**: `https://www.charts.noaa.gov/ENCs/ENCProdCat_19115.xml`
- **Bulk Downloads**: Available by region, state, or Coast Guard district

### Implementation Architecture

#### Service Layer

1. **Chart Query Service** (`src/services/chartQuery.ts`)
   - Query charts by GPS coordinates
   - Support point and bounding box queries
   - Parse API responses to extract chart metadata
   - Handle multiple scale ranges (coastal, general)

2. **Chart Download Service** (`src/services/chartDownload.ts`)
   - Download chart ZIP files from NOAA
   - Extract S-57 files from ZIP archives
   - Manage download progress and retries
   - Validate downloaded files

3. **Cache Management** (`src/utils/cache.ts`)
   - Store downloaded charts in configurable cache directory
   - Track chart versions and update dates
   - Implement cache expiration (weekly updates)
   - Provide cache statistics and cleanup
   - Default cache size limit: 10GB (configurable via `ENC_CACHE_MAX_SIZE_GB`)
   - Default cache location: `./cache/charts/` (configurable via `ENC_CACHE_DIR`)
   - Default cache age: 7 days (configurable via `ENC_CACHE_MAX_AGE_DAYS`)

#### Data Flow

##### For `get_chart` with coordinates:
1. Client calls `get_chart` with lat/lon coordinates
2. Check local cache for charts covering those coordinates
3. If not cached:
   - Query NOAA queryDatasets API with point geometry
   - Select best chart based on scale and coverage
   - Download chart ZIP from NOAA
   - Extract and cache S-57 data
4. Parse S-57 data (or return mock data initially)
5. Filter features by bounding box if provided
6. Return chart features to client

##### For `search_charts` with coordinates:
1. Client calls `search_charts` with bounding box
2. Search local cache for matching charts
3. Query NOAA API for additional charts in the area
4. Merge and deduplicate results
5. Return chart metadata list to client

##### For `get_chart` with chartId:
1. Client calls `get_chart` with specific chart ID
2. Check local cache for the chart
3. If not cached:
   - Download specific chart from NOAA
   - Extract and cache S-57 data
4. Return chart features to client

### API Response Format

**queryDatasets Response:**
```json
{
  "spatialReference": {
    "wkid": 4326
  },
  "charts": [
    {
      "dsid": {
        "dsnm": {
          "value": "US5WA12M",
          "description": "Data set name"
        },
        "edtn": {
          "value": "25",
          "description": "Edition number"
        },
        "updn": {
          "value": "20240115",
          "description": "Update date"
        },
        "cscl": {
          "value": "40000",
          "description": "Compilation scale"
        }
      },
      "geometry": {
        "rings": [[[/* coordinate pairs */]]]
      }
    }
  ]
}
```

### Error Handling
- Network timeouts: Implement exponential backoff
- Invalid coordinates: Validate before API call
- No charts available: Return helpful error message
- API rate limits: Implement request throttling
- Download failures: Retry with fallback sources

### Performance Optimization
- Cache frequently accessed charts
- Implement spatial indexing for quick lookups
- Stream large chart files during download
- Use connection pooling for API requests
- Batch coordinate queries when possible

### Testing Strategy

#### Unit Tests
- **Location**: Alongside implementation files with `.spec.ts` extension
- **Example**: `src/services/chartDownload.ts` → `src/services/chartDownload.spec.ts`
- **Characteristics**:
  - Mock all external dependencies (APIs, file system, databases)
  - Test individual components in isolation
  - Fast execution, no network or file I/O
  - Focus on edge cases and error conditions

#### Integration Tests
- **Location**: `tests/integration/` directory with `.spec.ts` extension
- **Example**: `tests/integration/chartIntegration.spec.ts`
- **Characteristics**:
  - Test multiple components working together
  - Use real implementations of internal services
  - May make real API calls or file system operations
  - Test data flow between components
  - Slower than unit tests but faster than E2E

#### E2E Tests
- **Location**: `tests/` directory with `.e2e.spec.ts` extension
- **Example**: `tests/chartDownload.e2e.spec.ts`
- **Characteristics**:
  - Test the complete MCP server through its API
  - Simulate real client interactions
  - Test full workflows from API request to response
  - Include real network calls and file operations

#### Test Execution
- `npm test` - Run all unit tests
- `npm run test:unit` - Run only unit tests
- `npm run test:integration` - Run integration tests
- `npm run test:e2e` - Run E2E tests
- `npm run test:all` - Run all test suites

#### Test Coverage Requirements
- Unit tests: Mock NOAA API responses, test edge cases
- Integration tests: Test service interactions, data transformations
- E2E tests: Test complete user workflows, API contracts
- All tests: Error handling, concurrent operations, cache behavior

### Updated Tool Schemas

#### `get_chart` - Enhanced Schema
```typescript
{
  name: 'get_chart',
  inputSchema: {
    type: 'object',
    properties: {
      // Option 1: By chart ID
      chartId: {
        type: 'string',
        description: 'The unique identifier of the chart'
      },
      // Option 2: By coordinates
      coordinates: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lon: { type: 'number' }
        },
        description: 'GPS coordinates to find chart for'
      },
      // Optional: Filter returned features
      boundingBox: {
        type: 'object',
        properties: {
          minLat: { type: 'number' },
          maxLat: { type: 'number' },
          minLon: { type: 'number' },
          maxLon: { type: 'number' }
        },
        description: 'Optional bounding box to filter chart data'
      },
      // Optional: Filter by feature types
      featureTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'S-57 object classes to include (e.g., DEPARE, LIGHTS)'
      },
      // Optional: Filter by depth range
      depthRange: {
        type: 'object',
        properties: {
          min: { type: 'number' },
          max: { type: 'number' }
        },
        description: 'Filter features by depth range in meters'
      },
      // Optional: Include nearby features
      includeNearby: {
        type: 'boolean',
        description: 'Include features within reasonable distance of coordinates'
      }
    },
    // Require either chartId OR coordinates
    oneOf: [
      { required: ['chartId'] },
      { required: ['coordinates'] }
    ]
  }
}
```

#### `get_chart_metadata` - Enhanced Schema
```typescript
{
  name: 'get_chart_metadata',
  inputSchema: {
    type: 'object',
    properties: {
      // Option 1: By chart ID
      chartId: {
        type: 'string',
        description: 'The unique identifier of the chart'
      },
      // Option 2: By coordinates
      coordinates: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lon: { type: 'number' }
        },
        description: 'GPS coordinates to find chart for'
      }
    },
    oneOf: [
      { required: ['chartId'] },
      { required: ['coordinates'] }
    ]
  }
}
```## AI Chart Data Analysis

### Overview
AI systems can use the MCP tools to read and analyze ENC chart data for navigation planning, safety assessment, and maritime operations. The system supports standard S-57 object classes for depths, navigational aids, and other critical features.

### Key S-57 Object Classes

#### Depth Information
- **DEPARE** (Depth Area) - Water areas with specific depth ranges
  - Properties: `DRVAL1` (min depth), `DRVAL2` (max depth)
- **DEPCNT** (Depth Contour) - Lines of equal depth
  - Properties: `VALDCO` (depth value)
- **SOUNDG** (Soundings) - Individual depth measurements
  - Properties: 3D point with depth value
- **DRGARE** (Dredged Area) - Maintained channel depths
- **OBSTRN** (Obstruction) - Underwater hazards
  - Properties: `VALSOU` (sounding value), `CATOBS` (category)

#### Navigation Aids
- **BOYLAT** (Lateral Buoy) - Port/starboard channel markers
  - Properties: `COLOUR`, `COLPAT`, `BOYSHP` (shape)
- **BOYSAW** (Safe Water Buoy) - Mid-channel/landfall markers
  - Properties: Red/white stripes, `BOYSHP`
- **BOYCAR** (Cardinal Buoy) - Indicates safe water direction
- **BCNLAT** (Lateral Beacon) - Fixed channel markers
- **LIGHTS** (Light) - All lighted navigation aids
  - Properties: `LITCHR` (characteristic), `SIGPER` (period), `COLOUR`, `VALNMR` (range)
- **LNDMRK** (Landmark) - Conspicuous visual references

#### Channel/Route Information
- **FAIRWY** (Fairway) - Designated navigation channels
- **NAVLNE** (Navigation Line) - Recommended routes
- **TSSLPT** (Traffic Separation Line) - Shipping lane boundaries
- **COALNE** (Coastline) - Land/water boundaries

### Enhanced Feature Properties

```typescript
export interface S57Properties {
  // Common properties
  OBJNAM?: string;  // Object name (e.g., "Golden Gate Bridge")
  INFORM?: string;  // Additional information
  SCAMIN?: number;  // Minimum scale for display
  
  // Depth properties
  DRVAL1?: number;  // Depth range minimum (meters)
  DRVAL2?: number;  // Depth range maximum (meters)
  VALDCO?: number;  // Depth contour value
  VALSOU?: number;  // Sounding value
  
  // Navigation aid properties
  COLOUR?: string;  // Color codes (e.g., "1,3" for white,red)
  COLPAT?: string;  // Color pattern (e.g., "1" for horizontal stripes)
  LITCHR?: string;  // Light characteristic (e.g., "1" for fixed, "2" for flashing)
  SIGPER?: number;  // Signal period in seconds
  VALNMR?: number;  // Nominal range in nautical miles
  HEIGHT?: number;  // Height above water
  
  // Shape and category
  BOYSHP?: number;  // Buoy shape (1=conical, 2=can, 3=spherical, etc.)
  CATLAM?: number;  // Category of lateral mark
  CATOBS?: number;  // Category of obstruction
  
  [key: string]: unknown;
}
```

### AI Usage Examples

#### 1. Depth Analysis for Route Planning
```javascript
// AI requests depth information for safe passage calculation
const response = await mcp.callTool('get_chart', {
  coordinates: { lat: 37.8199, lon: -122.4783 },  // Golden Gate
  featureTypes: ['DEPARE', 'DEPCNT', 'SOUNDG', 'OBSTRN'],
  depthRange: { min: 0, max: 30 }  // Vessel draft consideration
});

// Response includes:
// - Depth areas with DRVAL1/DRVAL2 ranges
// - Contour lines at standard depths (5m, 10m, 20m, etc.)
// - Individual soundings for detailed analysis
// - Obstructions with clearance depths
```

#### 2. Navigation Aid Identification
```javascript
// AI requests all navigation aids for passage planning
const response = await mcp.callTool('get_chart', {
  boundingBox: {
    minLat: 37.7,
    maxLat: 37.9,
    minLon: -122.6,
    maxLon: -122.3
  },
  featureTypes: ['BOYLAT', 'BOYSAW', 'LIGHTS', 'BCNLAT', 'LNDMRK']
});

// Response includes:
// - Lateral marks with red/green colors and numbers
// - Light characteristics (Fl W 4s = Flashing White every 4 seconds)
// - Landmark descriptions for visual navigation
// - Buoy shapes and positions
```

#### 3. Channel Navigation
```javascript
// AI analyzes available channels and fairways
const response = await mcp.callTool('get_chart', {
  coordinates: { lat: 37.8, lon: -122.4 },
  featureTypes: ['FAIRWY', 'NAVLNE', 'TSSLPT', 'COALNE'],
  includeNearby: true  // Get features within reasonable distance
});

// Response includes:
// - Fairway boundaries and depths
// - Recommended navigation lines
// - Traffic separation schemes
// - Proximity to coastline
```

#### 4. Hazard Detection
```javascript
// AI checks for navigation hazards along a route
const response = await mcp.callTool('calculate_route', {
  waypoints: [
    { lat: 37.8, lon: -122.5 },
    { lat: 37.85, lon: -122.4 }
  ],
  checkHazards: true,
  minDepth: 10  // Minimum safe depth
});
```

#### `calculate_route` - Enhanced Schema
```typescript
{
  name: 'calculate_route',
  inputSchema: {
    type: 'object',
    properties: {
      waypoints: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            lat: { type: 'number' },
            lon: { type: 'number' }
          },
          required: ['lat', 'lon']
        },
        minItems: 2,
        description: 'List of waypoints defining the route'
      },
      checkHazards: {
        type: 'boolean',
        description: 'Check for navigation hazards along the route'
      },
      minDepth: {
        type: 'number',
        description: 'Minimum safe depth in meters for the vessel'
      },
      avoidAreas: {
        type: 'array',
        items: { type: 'string' },
        description: 'S-57 area types to avoid (e.g., RESARE, PRCARE)'
      }
    },
    required: ['waypoints']
  }
}

// Response includes:
// - Route with intersecting chart features
// - Warnings for shallow areas (DEPARE with DRVAL2 < minDepth)
// - Nearby obstructions
// - Required navigation aids to follow
```

### Feature Type Categories

For efficient querying, features are grouped into categories:

```javascript
const FEATURE_CATEGORIES = {
  depths: ['DEPARE', 'DEPCNT', 'SOUNDG', 'DRGARE'],
  hazards: ['OBSTRN', 'WRECKS', 'ROCKS', 'UWTROC'],
  navAids: ['BOYLAT', 'BOYSAW', 'BOYCAR', 'BCNLAT', 'LIGHTS'],
  channels: ['FAIRWY', 'NAVLNE', 'DWRTPT', 'TSSLPT'],
  areas: ['PRCARE', 'RESARE', 'ACHARE', 'SPLARE']  // Restricted/special areas
};
```

### AI Interpretation Guidelines

1. **Depth Safety**:
   - DEPARE with DRVAL2 < vessel draft = No-go area
   - SOUNDG values should be checked for anomalies
   - OBSTRN with unknown depth = Avoid

2. **Navigation Aid Recognition**:
   - Red marks (COLOUR includes "3") = Starboard side when returning
   - Green marks (COLOUR includes "4") = Port side when returning
   - Yellow marks (COLOUR includes "6") = Special purpose

3. **Light Characteristics**:
   - LITCHR "1" = Fixed light
   - LITCHR "2" = Flashing
   - LITCHR "4" = Quick flashing
   - SIGPER = Period in seconds

4. **Safe Water Identification**:
   - BOYSAW = Safe water all around
   - FAIRWY = Designated safe channel
   - DWRTPT = Deep water route

### Data Quality Indicators

Each feature may include quality attributes:
- **SORDAT**: Source date (when surveyed)
- **SORIND**: Source indication (survey method)
- **QUASOU**: Quality of sounding
- **TECSOU**: Technique of sounding

AI should consider data age and quality when making navigation decisions.

## Security Considerations

### Input Validation
- Validate all coordinates are within valid ranges (-90 to 90 for latitude, -180 to 180 for longitude)
- Sanitize file paths to prevent directory traversal attacks
- Validate chart IDs against known format patterns

### Download Security
- Verify SSL certificates when downloading from NOAA
- Validate ZIP file integrity before extraction
- Scan extracted files for expected S-57 format
- Implement size limits to prevent DoS attacks

### Cache Security
- Store cache in designated directory only
- Implement file permissions to prevent unauthorized access
- Regular cleanup of old/corrupted files
- Monitor cache size to prevent disk exhaustion

### API Rate Limiting
- Implement client-side rate limiting for NOAA APIs
- Cache API responses to reduce request frequency
- Use exponential backoff for failed requests
- Monitor and log API usage patterns

## Chart Selection Algorithm

When multiple charts cover the requested coordinates:

1. **Scale Priority**:
   - Prefer larger scale (more detailed) charts
   - Scale hierarchy: Harbor > Approach > Coastal > General

2. **Update Recency**:
   - Prefer charts with more recent edition dates
   - Check both edition number and update date

3. **Coverage Quality**:
   - Prefer charts where coordinates are near center
   - Avoid charts where coordinates are near edges

4. **Purpose Matching**:
   - Match chart purpose to use case (navigation vs overview)

## TODO: Future Enhancements

### Performance Optimizations
- Implement chart tile/segment loading for large charts
- Add WebSocket support for real-time chart updates
- Consider CDN integration for frequently accessed charts
- Implement progressive loading for web clients

### Advanced Features
- Multi-chart stitching for seamless coverage
- Vector tile support for web applications
- Offline mode with preloaded chart packages
- Chart diff visualization between editions
- Custom chart symbology support

### Integration Enhancements
- Support for other chart formats (S-101, BSB/KAP, CM93)
- Integration with AIS data for real-time vessel tracking
- Weather overlay capabilities (wind, currents, waves)
- Tide and current prediction integration
- Integration with voyage planning systems

### User Experience
- Chart update notifications via webhooks
- Usage analytics and popular area pre-caching
- Multi-language support for chart labels
- Accessibility features for vision-impaired users

### Additional MCP Tools
- `convert_chart` - Transform between different formats
- `validate_route` - Check route against multiple safety criteria
- `get_chart_updates` - Check for newer chart versions
- `get_tides` - Retrieve tide predictions for a location
- `get_notices` - Retrieve Notices to Mariners

## S-57 Object Classes

The server now supports the complete IHO S-57 object catalogue with 172 object classes (expanded from the initial 46). These are organized into categories:

- **Navigation Aids** (23 classes): LIGHTS, BOYLAT, BOYSAW, BCNCAR, etc.
- **Depth Information** (6 classes): DEPARE, DEPCNT, SOUNDG, DRGARE, etc.
- **Areas** (31 classes): ACHARE, RESARE, PRCARE, FAIRWY, etc.
- **Infrastructure** (18 classes): BRIDGE, CBLOHD, PIPOHD, MORFAC, etc.
- **Natural Features** (18 classes): COALNE, LNDARE, RIVERS, VEGATN, etc.
- **Hazards** (2 classes): OBSTRN, WRECKS
- **Traffic** (12 classes): TSSLPT, NAVLNE, RECTRC, etc.
- **Services** (5 classes): PILBOP, RDOSTA, RSCSTA, etc.

Use the `get_object_classes` tool to query available object classes, their properties, and navigation significance.

### Monitoring and Reliability
- Health check endpoints for NOAA API status
- Fallback servers for redundancy
- Metrics collection for API usage and performance
- Automated testing of chart downloads
- Alert system for NOAA API changes