# ENC Charts MCP Server

An MCP (Model Context Protocol) server for Electronic Navigational Charts (ENC) data, providing programmatic access to NOAA electronic navigational charts with S-57 format parsing capabilities.

## Overview

This MCP server enables AI assistants to access and analyze electronic navigational charts from NOAA. It automatically downloads, caches, and parses S-57 format chart data, making it available through a standardized API. The server supports coordinate-based chart discovery, feature extraction, and navigation-focused queries.

## Features

- **S-57 Chart Parsing**: Full support for IHO S-57 format electronic navigational charts
- **NOAA Integration**: Automatic chart discovery and downloading from NOAA REST APIs
- **Coordinate-Based Queries**: Find and retrieve charts based on GPS coordinates
- **Smart Caching**: Efficient local caching with configurable size and age limits
- **Feature Filtering**: Extract specific navigation features (lights, buoys, depths, etc.)
- **172 Object Classes**: Complete support for S-57 object catalog
- **Depth Analysis**: Filter features by depth ranges for navigation safety
- **Spatial Queries**: Bounding box filtering for area-specific data

## Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Node package manager
- **Python**: Version 3.7 or higher
- **GDAL Python Bindings**: For S-57 format parsing
- **Operating System**: Windows, macOS, or Linux

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/tonybentley/enc-charts-mcp.git
cd enc-charts-mcp
```

### 2. Install Node.js Dependencies

```bash
npm install
```

### 3. Install Python Dependencies

#### Automatic Installation (Recommended)

```bash
# Detect and install GDAL automatically
npm run gdal:install
```

#### Manual Installation

**macOS:**
```bash
# Using Homebrew
brew install gdal
pip3 install gdal==$(gdal-config --version)
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install gdal-bin libgdal-dev
pip3 install gdal==$(gdal-config --version)
```

**Windows:**
```bash
# Using OSGeo4W or conda
conda install -c conda-forge gdal
```

### 4. Verify Installation

```bash
# Check GDAL installation
npm run gdal:validate

# Build the project
npm run build
```

## Configuration

### Environment Variables

The server supports the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `ENC_CACHE_DIR` | Directory for chart cache | `./cache/charts/` |
| `ENC_CACHE_MAX_SIZE_GB` | Maximum cache size in GB | `10` |
| `ENC_CACHE_MAX_AGE_DAYS` | Cache expiration in days | `7` |

### Claude Desktop Integration

Add the following to your Claude Desktop configuration:

#### macOS/Linux
```json
{
  "mcpServers": {
    "enc-charts": {
      "command": "node",
      "args": ["/Users/yourname/Projects/enc-charts-mcp/dist/index.js"],
      "transport": {
        "type": "stdio"
      },
      "env": {
        "ENC_CACHE_DIR": "/Users/yourname/.enc-charts/cache",
        "ENC_CACHE_MAX_SIZE_GB": "20",
        "ENC_CACHE_MAX_AGE_DAYS": "14"
      }
    }
  }
}
```

#### Windows
```json
{
  "mcpServers": {
    "enc-charts": {
      "command": "node",
      "args": ["C:\\Users\\yourname\\Projects\\enc-charts-mcp\\dist\\index.js"],
      "transport": {
        "type": "stdio"
      },
      "env": {
        "ENC_CACHE_DIR": "C:\\Users\\yourname\\AppData\\Local\\enc-charts\\cache",
        "ENC_CACHE_MAX_SIZE_GB": "20",
        "ENC_CACHE_MAX_AGE_DAYS": "14"
      }
    }
  }
}
```

### Development Mode

For active development with hot reload:

```json
{
  "mcpServers": {
    "enc-charts-dev": {
      "command": "npx",
      "args": ["tsx", "/path/to/enc-charts-mcp/src/index.ts"],
      "transport": {
        "type": "stdio"
      },
      "env": {
        "ENC_CACHE_DIR": "/path/to/your/cache/directory",
        "NODE_ENV": "development"
      }
    }
  }
}
```

## Available Tools

### get_chart

Retrieve chart features for a specific area by chart ID or coordinates.

**Parameters:**
- `chartId` (string, optional): Chart identifier (e.g., "US5CA12M")
- `coordinates` (object, optional): GPS coordinates
  - `lat` (number): Latitude (-90 to 90)
  - `lon` (number): Longitude (-180 to 180)
- `boundingBox` (object, optional): Geographic bounds filter
  - `minLat`, `maxLat`, `minLon`, `maxLon` (numbers)
- `featureTypes` (array, optional): S-57 object classes to include
- `depthRange` (object, optional): Depth filter in meters
  - `min`, `max` (numbers)
- `includeNearby` (boolean, optional): Include nearby features
- `limit` (integer, optional): Maximum features to return (default: 100, max: 1000)
- `offset` (integer, optional): Number of features to skip for pagination (default: 0)

**Example Request:**
```json
{
  "coordinates": { "lat": 37.8, "lon": -122.5 },
  "featureTypes": ["LIGHTS", "BOYLAT", "DEPARE"],
  "depthRange": { "min": 0, "max": 20 }
}
```

**Example Response:**
```json
{
  "chartId": "US5CA12M",
  "features": [
    {
      "id": "LIGHTS.123",
      "type": "LIGHTS",
      "geometry": {
        "type": "Point",
        "coordinates": [-122.5295, 37.8156]
      },
      "properties": {
        "COLOUR": ["1"],
        "LITCHR": 8,
        "SIGPER": 4,
        "VALNMR": 18
      }
    }
  ],
  "featureCount": 42,
  "totalFeatures": 150,
  "hasMore": true,
  "limit": 100,
  "offset": 0,
  "source": "NOAA ENC"
}
```

### search_charts

Search available charts by various criteria.

**Parameters:**
- `query` (string, optional): Search by name or area
- `scale` (object, optional): Scale range filter
  - `min`, `max` (numbers)
- `boundingBox` (object, optional): Geographic search area
- `format` (string, optional): Chart format ("S-57" or "S-101")
- `limit` (integer, optional): Maximum charts to return (default: 50, max: 100)
- `offset` (integer, optional): Number of charts to skip for pagination (default: 0)

### get_chart_metadata

Get detailed information about a specific chart.

**Parameters:**
- `chartId` (string, optional): Chart identifier
- `coordinates` (object, optional): GPS coordinates to find chart

### get_object_classes

Get information about S-57 object classes and their representations.

**Parameters:**
- `category` (string, optional): Filter by category
  - Options: "navAids", "depths", "areas", "infrastructure", "natural", "hazards"
- `search` (string, optional): Search by acronym or description
- `includeAttributes` (boolean, optional): Include standard attributes

### calculate_route

Calculate navigation routes between waypoints (prototype).

**Parameters:**
- `waypoints` (array): List of coordinate points
- `checkHazards` (boolean, optional): Check for navigation hazards
- `minDepth` (number, optional): Minimum safe depth in meters

## Data Sources

### NOAA ENC Online

The server integrates with NOAA's Electronic Navigational Chart services:

- **REST API**: Maritime Chart Service for programmatic access
- **Chart Downloads**: Individual S-57 format files from NOAA
- **Update Frequency**: Weekly for most charts
- **Coverage**: US waters and territories

Charts are automatically downloaded on-demand when queried by coordinates and cached locally for performance.

## Project Structure

```
enc-charts-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── handlers/             # MCP tool request handlers
│   │   ├── getChart.ts       # Chart retrieval handler
│   │   ├── searchCharts.ts   # Chart search handler
│   │   └── ...
│   ├── services/             # Core services
│   │   ├── chartQuery.ts     # NOAA API integration
│   │   ├── chartDownload.ts  # Chart download/extraction
│   │   ├── s57Parser.ts      # S-57 format parser wrapper
│   │   └── xmlCatalog.ts     # Chart catalog parser
│   ├── parsers/              # Format parsers
│   │   ├── s57-adapter.ts    # GDAL adapter for Node.js
│   │   └── gdal-bridge.ts    # Python subprocess bridge
│   ├── python/               # Python components
│   │   └── s57_parser.py     # GDAL-based S-57 parser
│   ├── utils/                # Utility functions
│   │   └── cache.ts          # Cache management
│   ├── constants/            # S-57 constants
│   │   └── s57ObjectClasses.ts
│   └── types/                # TypeScript definitions
├── tests/                    # Test suites
│   ├── unit/                 # Unit tests (*.spec.ts)
│   ├── integration/          # Integration tests
│   └── e2e/                  # End-to-end tests
├── cache/                    # Local chart cache (gitignored)
└── data/                     # Static data files
```

## S-57 Object Classes

The server supports all 172 standard S-57 object classes. Key categories include:

### Navigation Aids
- `LIGHTS` - All lighted aids (lighthouses, beacons, lit buoys)
- `BOYLAT` - Lateral buoys (port/starboard markers)
- `BOYSAW` - Safe water buoys
- `BCNLAT` - Lateral beacons
- `DAYMAR` - Day marks

### Depth Information
- `DEPARE` - Depth areas with ranges
- `DEPCNT` - Depth contour lines
- `SOUNDG` - Individual soundings
- `DRGARE` - Dredged areas

### Areas & Boundaries
- `FAIRWY` - Navigation channels
- `ANCHRG` - Anchorage areas
- `RESARE` - Restricted areas
- `TSSLPT` - Traffic separation schemes

### Hazards
- `OBSTRN` - Underwater obstructions
- `WRECKS` - Shipwrecks
- `ROCKS` - Rocks and reefs

## Development

### Commands

```bash
# Development with hot reload
npm run dev

# Build for production
npm run build

# Run tests
npm test              # Unit tests only
npm run test:e2e      # End-to-end tests
npm run test:all      # All test suites

# Code quality
npm run lint          # ESLint
npm run typecheck     # TypeScript check
npm run format        # Prettier formatting

# GDAL management
npm run gdal:detect   # Check GDAL installation
npm run gdal:install  # Auto-install GDAL
```

### Testing Strategy

- **Unit Tests** (`*.spec.ts`): Test individual components
- **Integration Tests**: Test service interactions
- **E2E Tests** (`*.e2e.spec.ts`): Test complete MCP flows

## Examples

### Finding Charts by Location

```typescript
// Request
{
  "tool": "get_chart",
  "arguments": {
    "coordinates": {
      "lat": 32.7157,
      "lon": -117.1611
    }
  }
}

// The server will:
// 1. Query NOAA for charts at this location
// 2. Download US5CA72M (San Diego Bay) if not cached
// 3. Parse S-57 data and return features
```

### Extracting Navigation Lights

```typescript
// Request
{
  "tool": "get_chart",
  "arguments": {
    "chartId": "US5CA12M",
    "featureTypes": ["LIGHTS"],
    "boundingBox": {
      "minLat": 37.8,
      "maxLat": 37.82,
      "minLon": -122.52,
      "maxLon": -122.5
    }
  }
}
```

### Depth Analysis for Anchoring

```typescript
// Request
{
  "tool": "get_chart",
  "arguments": {
    "coordinates": {
      "lat": 37.8156,
      "lon": -122.5295
    },
    "featureTypes": ["DEPARE", "SOUNDG", "ANCHRG"],
    "depthRange": {
      "min": 5,
      "max": 15
    }
  }
}
```

## Troubleshooting

### GDAL Installation Issues

**"GDAL Python bindings not found"**
- Ensure Python 3 is in your PATH
- Run `npm run gdal:install` for automatic setup
- For manual install, match GDAL versions: `pip install gdal==$(gdal-config --version)`

**"GetGeometry" errors**
- Update to latest GDAL version
- Check Python subprocess permissions
- Verify S-57 file integrity

### Chart Download Issues

**"No charts found for coordinates"**
- Verify coordinates are in US waters
- Check internet connection
- Clear cache if corrupted: `rm -rf $ENC_CACHE_DIR/*`

**"Permission denied" errors**
- Ensure cache directory is writable
- Check file ownership: `chown -R $USER $ENC_CACHE_DIR`

### Claude Desktop Issues

**Server not appearing**
1. Rebuild project: `npm run build`
2. Use absolute paths in configuration
3. Restart Claude Desktop
4. Check logs: `tail -f ~/Library/Logs/Claude/mcp-*.log`

**"Cannot find module"**
- Run `npm install` and `npm run build`
- Verify `dist/index.js` exists
- Check Node.js version: `node --version`

## Performance Considerations

- Charts can be 10-100MB each
- Initial downloads may take time
- Cache warming recommended for frequently accessed areas
- Spatial queries optimized for bounding boxes

### Pagination

To prevent response size issues, the `get_chart` and `search_charts` tools implement pagination:

- **get_chart**: Returns up to 100 features by default (max: 1000)
- **search_charts**: Returns up to 50 charts by default (max: 100)

Use the `limit` and `offset` parameters to page through large result sets:

```json
// First page
{ "chartId": "US5CA12M", "limit": 100, "offset": 0 }

// Next page
{ "chartId": "US5CA12M", "limit": 100, "offset": 100 }
```

The response includes pagination metadata:
- `totalFeatures` or `totalCount`: Total number of available items
- `hasMore`: Boolean indicating if more results exist
- `limit`: Number of items returned
- `offset`: Number of items skipped

## License

ISC

## Contributing

Contributions are welcome! Please see our [GitHub repository](https://github.com/tonybentley/enc-charts-mcp) for:
- Issue reporting
- Pull request guidelines
- Development setup instructions

## Acknowledgments

- NOAA for providing free electronic navigational charts
- IHO for the S-57 standard specification
- GDAL contributors for S-57 format support