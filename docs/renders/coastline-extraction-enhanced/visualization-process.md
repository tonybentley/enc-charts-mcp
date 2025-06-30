# ENC Coastline Visualization Process

## Overview
This document describes the process for extracting coastline data from ENC charts and creating a simple canvas-based visualization to analyze fragmentation and gaps in the data.

## Process Steps

### 1. Direct Handler Approach (`createDirectRender.js`)

The most efficient approach uses the extraction handler directly without running the full MCP server:

```javascript
import { extractCoastlinesHandler } from './dist/handlers/extractCoastlines.js';

// Initialize database and repositories
const db = new DatabaseManager({ memory: true });
db.initialize();

const chartRepo = new ChartRepository(db);
const featureRepo = new NavigationFeatureRepository(db);
setDatabaseRepositories(chartRepo, featureRepo);

// Extract coastlines with enhanced parameters
const result = await extractCoastlinesHandler({
  limit: 50,
  chartId: 'US5CA72M',
  stitching: {
    enabled: true,
    tolerance: 50,
    mergeConnected: true
  },
  featureSources: {
    useLandAreas: true,
    useCoastlines: true,
    useDepthAreas: true,
    useHarborFeatures: true,
    useMooringFeatures: true,
    useSpecialFeatures: true,
    useShorelineConstruction: true
  },
  extractionMethod: 'combined'
});
```

### 2. MCP Server Approach (`createSimpleRender.js`)

Alternative approach using the MCP server protocol:

```javascript
// Start MCP server as subprocess
const serverProcess = spawn('node', ['dist/index.js']);

// Send JSON-RPC request
const request = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'extract_coastlines',
    arguments: { /* same parameters as above */ }
  }
};
```

### 3. HTML Canvas Visualization

The visualization uses HTML5 Canvas for pure ENC boundary rendering:

```html
<!DOCTYPE html>
<html>
<head>
    <title>ENC Boundaries</title>
    <style>
        body { margin: 0; padding: 0; }
        canvas { display: block; }
    </style>
</head>
<body>
    <canvas id="map" width="900" height="700"></canvas>
    <script>
        const coastlineData = /* embedded GeoJSON data */;
        
        const canvas = document.getElementById('map');
        const ctx = canvas.getContext('2d');
        
        // Map bounds focusing on target area
        const bounds = {
            minLon: -117.25,
            maxLon: -117.20,
            minLat: 32.70,
            maxLat: 32.73
        };
        
        // Convert lat/lon to canvas coordinates
        function toCanvas(lon, lat) {
            const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * canvas.width;
            const y = canvas.height - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * canvas.height;
            return { x, y };
        }
        
        // Clear with water color
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw coastlines
        ctx.strokeStyle = '#000080';
        ctx.lineWidth = 3;
        
        coastlineData.features.forEach(feature => {
            if (feature.geometry && feature.geometry.type === 'LineString') {
                const coords = feature.geometry.coordinates;
                ctx.beginPath();
                const firstPoint = toCanvas(coords[0][0], coords[0][1]);
                ctx.moveTo(firstPoint.x, firstPoint.y);
                
                for (let i = 1; i < coords.length; i++) {
                    const point = toCanvas(coords[i][0], coords[i][1]);
                    ctx.lineTo(point.x, point.y);
                }
                
                ctx.stroke();
            }
        });
    </script>
</body>
</html>
```

## Key Parameters

### Chart Selection
- **Chart ID**: `US5CA72M` - San Diego Bay detailed chart
- **Scale**: Smaller scale numbers = more detail

### Extraction Parameters
- **Stitching Tolerance**: 50 meters - increased from default 10m for better gap handling
- **Feature Sources**: All coastline-related S-57 feature types enabled
  - COALNE (Coastline)
  - SLCONS (Shoreline Construction)
  - MORFAC (Mooring Facility)
  - PONTON (Pontoon)
  - FLODOC (Floating Dock)
  - HULKES (Hulks)
  - LNDARE (Land Area - boundaries)
  - DEPARE (Depth Area - 0m contours)

### Visualization Settings
- **Canvas Size**: 900x700 pixels
- **Water Color**: #87CEEB (light blue)
- **Coastline Color**: #000080 (navy blue)
- **Line Width**: 3 pixels
- **Target Marker**: Red dot, 6px radius

## Running the Visualization

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Run the extraction script**:
   ```bash
   node --experimental-sqlite createDirectRender.js
   ```

3. **Open the generated HTML**:
   ```
   docs/failures/coastline-extraction-enhanced/simple-enc-render.html
   ```

## Expected Results

The visualization should show:
- Fragmented coastline segments from the ENC chart
- Gaps between segments that need stitching
- Shelter Island peninsula shape (if properly extracted)
- Clear contrast between water and coastline features

## Troubleshooting

### Empty Results
- Check chart ID exists in database
- Verify S-57 files are properly cached
- Ensure feature type property matches database schema (`_featureType`)

### Coordinate Issues
- Convert 3D coordinates to 2D for turf.js operations
- Validate bounds cover the area of interest
- Check coordinate order (longitude, latitude)

### Missing Features
- Increase extraction limit parameter
- Check all feature sources are enabled
- Verify chart scale is appropriate for detail level

## Analysis Use Cases

This visualization helps identify:
1. **Gap Locations**: Where coastline segments don't connect
2. **Feature Distribution**: Which S-57 types contribute to coastline
3. **Stitching Effectiveness**: Results of tolerance adjustments
4. **Data Completeness**: Coverage of the target area

## References

- COASTLINE_EXTRACTION_IMPROVEMENTS.md - Enhancement specifications
- san-diego-bay/render-coastlines.html - Example visualization
- S-57 IHO Standard - Feature type definitions