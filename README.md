# ENC Charts MCP Server

[![npm version](https://badge.fury.io/js/enc-charts-mcp.svg)](https://www.npmjs.com/package/enc-charts-mcp)

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
- **Python**: Version 3.7 or higher (for S-57 parsing)
- **GDAL Python Bindings**: Required for chart data parsing

## Installation

Install the MCP server globally via npm:

```bash
npm install -g enc-charts-mcp
```

### Installing GDAL Dependencies

The server requires GDAL Python bindings for S-57 chart parsing:

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
# Using conda (recommended)
conda install -c conda-forge gdal
```

### Verify Installation

```bash
# Check if the server is installed
enc-charts-mcp --version

# Test GDAL availability
python3 -c "from osgeo import ogr; print('GDAL installed successfully')"
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

Add the following to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "enc-charts": {
      "command": "npx",
      "args": ["enc-charts-mcp"],
      "transport": {
        "type": "stdio"
      },
      "env": {
        "ENC_CACHE_DIR": "~/.enc-charts/cache",
        "ENC_CACHE_MAX_SIZE_GB": "20",
        "ENC_CACHE_MAX_AGE_DAYS": "14"
      }
    }
  }
}
```

**Note:** Adjust the cache directory path based on your preferences. The server will automatically create the directory if it doesn't exist.

## Quick Start

After installation and configuration, restart Claude Desktop. You can then use the ENC charts tools in your conversations:

1. **Find charts for a location:**
   ```
   Use the get_chart tool with coordinates: 
   lat: 37.8, lon: -122.5 (San Francisco Bay)
   ```

2. **Search for charts in an area:**
   ```
   Use search_charts with a bounding box to find all charts 
   between San Diego and Los Angeles
   ```

3. **Get navigation features:**
   ```
   Get all lights and buoys from chart US5CA12M
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


## Data Sources

### NOAA ENC Online

The server integrates with NOAA's Electronic Navigational Chart services:

- **XML Product Catalog**: Charts metadata from `https://www.charts.noaa.gov/ENCs/ENCProdCat.xml`
- **Chart Downloads**: Individual S-57 format ZIP files from `https://www.charts.noaa.gov/ENCs/`
- **Update Frequency**: Weekly for most charts
- **Coverage**: US waters and territories
- **No Authentication Required**: All NOAA resources are publicly accessible

Charts are automatically downloaded on-demand when queried by coordinates and cached locally for performance. The XML catalog is cached for 24 hours to reduce API calls.

## How It Works

1. **Chart Discovery**: The server queries NOAA's XML product catalog to find charts based on coordinates or search criteria
2. **Automatic Download**: Charts are downloaded on-demand from NOAA when requested
3. **Local Caching**: Downloaded charts are cached locally to improve performance
4. **S-57 Parsing**: Chart data is parsed from S-57 format using GDAL Python bindings
5. **Feature Extraction**: Navigation features (lights, buoys, depths, etc.) are extracted and returned as GeoJSON

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

## Usage Tips

### Efficient Chart Queries

1. **Use Feature Filtering**: Specify `featureTypes` to reduce response size
2. **Apply Bounding Boxes**: Limit geographic scope when possible
3. **Leverage Pagination**: Use `limit` and `offset` for large datasets
4. **Cache Warming**: Frequently accessed areas benefit from pre-downloading

### Common Feature Types

- **Navigation Aids**: `LIGHTS`, `BOYLAT`, `BOYSAW`, `BCNLAT`
- **Depths**: `DEPARE`, `DEPCNT`, `SOUNDG`
- **Hazards**: `OBSTRN`, `WRECKS`, `ROCKS`
- **Areas**: `FAIRWY`, `ANCHRG`, `RESARE`

## Common Use Cases

### 1. Navigation Planning

Find charts and extract navigation aids for route planning:

```json
// Get charts for Golden Gate area
{
  "coordinates": { "lat": 37.8199, "lon": -122.4783 },
  "featureTypes": ["LIGHTS", "BOYLAT", "BOYSAW", "BCNLAT"],
  "includeNearby": true
}
```

### 2. Anchorage Analysis

Find suitable anchoring spots with depth information:

```json
// Search for anchorages with specific depth range
{
  "chartId": "US5CA12M",
  "featureTypes": ["DEPARE", "ANCHRG", "SOUNDG"],
  "depthRange": { "min": 5, "max": 15 },
  "boundingBox": {
    "minLat": 37.8,
    "maxLat": 37.82,
    "minLon": -122.52,
    "maxLon": -122.5
  }
}
```

### 3. Hazard Detection

Identify navigation hazards in an area:

```json
// Get all hazards near a route
{
  "coordinates": { "lat": 32.7157, "lon": -117.1611 },
  "featureTypes": ["OBSTRN", "WRECKS", "ROCKS", "UWTROC"],
  "includeNearby": true
}
```

### 4. Chart Discovery

Find all available charts for a region:

```json
// Search charts between San Diego and Los Angeles
{
  "boundingBox": {
    "minLat": 32.5,
    "maxLat": 34.0,
    "minLon": -118.5,
    "maxLon": -117.0
  },
  "scale": { "max": 50000 }  // Detailed charts only
}
```

## Troubleshooting

### GDAL Installation Issues

**"GDAL Python bindings not found"**
- Ensure Python 3 is in your PATH
- Match GDAL versions exactly: `pip install gdal==$(gdal-config --version)`
- On macOS, use Homebrew: `brew install gdal`
- On Windows, use conda for easier installation

**"Failed to parse S-57 chart data"**
- Verify GDAL is properly installed: `python3 -c "from osgeo import ogr"`
- Check that Python 3 is in your PATH (the server specifically uses `python3`)
- Some charts may require newer GDAL versions
- Run `npm run gdal:validate` to check your installation

### Claude Desktop Issues

**Server not appearing in Claude**
1. Ensure the package is installed: `npm list -g enc-charts-mcp`
2. Check your config file path is correct
3. Restart Claude Desktop after configuration changes
4. Verify the npx command works: `npx enc-charts-mcp --version`

**"No charts found for coordinates"**
- Verify coordinates are in US waters (NOAA coverage area)
- Check internet connection for NOAA API access
- Try different coordinates or use a known chart ID

### Cache Issues

**Clearing the cache**
```bash
# Default cache location
rm -rf ~/.enc-charts/cache/*

# Or your custom cache directory
rm -rf $ENC_CACHE_DIR/*
```

**Disk space issues**
- Adjust `ENC_CACHE_MAX_SIZE_GB` in your config
- Charts can be 10-100MB each
- Consider storing cache on a drive with more space

## Development

### Running Locally

```bash
# Clone the repository
git clone https://github.com/tonybentley/enc-charts-mcp.git
cd enc-charts-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode (with hot reload)
npm run dev

# Run production build
npm start
```

### Development Commands

- `npm run dev` - Run in development mode with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run test` - Run unit tests
- `npm run test:e2e` - Run end-to-end tests
- `npm run test:all` - Run all test suites
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking
- `npm run format` - Format code with Prettier

### GDAL Validation

- `npm run gdal:detect` - Check if GDAL is properly installed
- `npm run gdal:validate` - Validate GDAL installation and environment
- `npm run test:integration:check` - Verify GDAL before running integration tests

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

## Source Code

The source code is available on [GitHub](https://github.com/tonybentley/enc-charts-mcp).

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## Acknowledgments

- NOAA for providing free electronic navigational charts
- IHO for the S-57 standard specification
- GDAL contributors for S-57 format support