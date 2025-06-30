#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the handlers directly
import { extractCoastlinesHandler } from '../../../dist/handlers/extractCoastlines.js';
import { initializeDatabase } from '../../../dist/database/init.js';
import { setDatabaseRepositories } from '../../../dist/services/serviceInitializer.js';

// Shelter Island coordinates
const SHELTER_ISLAND_LAT = 32.714935;
const SHELTER_ISLAND_LON = -117.228975;

// Bounding box for San Diego Bay area around Shelter Island
const BOUNDS = {
  minLat: 32.70,
  maxLat: 32.73,
  minLon: -117.25,
  maxLon: -117.20
};

async function runSimpleRenderTest() {
  console.log('=== Simple Coastline Rendering Test ===');
  console.log('Creating canvas-based visualization without map tiles');
  console.log('Location: Shelter Island, San Diego Bay\n');

  try {
    // Initialize database
    console.log('1. Initializing database...');
    const dbInit = initializeDatabase({
      memory: false,
      dataDir: './test-cache/database',
      verbose: false
    });
    
    if (dbInit.dbManager) {
      setDatabaseRepositories(dbInit.chartRepository, dbInit.featureRepository);
      console.log('✓ Database initialized\n');
    }

    // Extract coastlines
    console.log('2. Extracting coastlines...');
    const coastlineArgs = {
      chartId: 'US5CA72M',
      boundingBox: BOUNDS,
      limit: 100,
      stitching: {
        enabled: true,
        tolerance: 50,
        mergeConnected: true
      },
      featureSources: {
        useCoastlines: true,
        useLandAreas: true,
        useDepthAreas: true,
        useShorelineConstruction: true,
        useDepthContours: true
      },
      extractionMethod: 'combined'
    };

    const coastlineResult = await extractCoastlinesHandler(coastlineArgs);
    const coastlineData = coastlineResult;

    console.log(`✓ Extracted ${coastlineData.features.length} features`);
    console.log(`  Total length: ${(coastlineData.metadata.processingStats.totalLength_m / 1000).toFixed(2)} km`);

    // Save coastline data
    await fs.writeFile(
      path.join(__dirname, 'simple-render-data.json'),
      JSON.stringify(coastlineData, null, 2)
    );

    // Create simple canvas rendering
    console.log('\n3. Creating simple canvas visualization...');
    await createSimpleVisualization(coastlineData);
    console.log(`✓ Visualization saved to: ${path.join(__dirname, 'simple-coastline-render.html')}`);

    console.log('\n✓ Test completed successfully!');
    console.log('\nTo view the visualization:');
    console.log(`  open ${path.join(__dirname, 'simple-coastline-render.html')}`);

  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
  }
}

async function createSimpleVisualization(coastlineData) {
  const html = `<!DOCTYPE html>
<html>
<head>
    <title>Simple Coastline Render - San Diego Bay</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            background: #f0f0f0;
        }
        #container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            max-width: 1000px;
            margin: 0 auto;
        }
        h1 { margin-top: 0; }
        #canvas {
            border: 1px solid #ddd;
            display: block;
            margin: 20px auto;
        }
        .legend {
            margin-top: 20px;
            padding: 10px;
            background: #f8f8f8;
            border-radius: 4px;
        }
        .legend-item {
            display: inline-block;
            margin-right: 20px;
        }
        .legend-color {
            display: inline-block;
            width: 30px;
            height: 3px;
            margin-right: 5px;
            vertical-align: middle;
        }
        .stats {
            margin-top: 10px;
            font-size: 14px;
            color: #666;
        }
    </style>
</head>
<body>
    <div id="container">
        <h1>Simple Coastline Rendering - San Diego Bay</h1>
        <p>Chart: ${coastlineData.metadata.chartId} | Features: ${coastlineData.features.length} | Total Length: ${(coastlineData.metadata.processingStats.totalLength_m / 1000).toFixed(2)} km</p>
        
        <canvas id="canvas" width="800" height="600"></canvas>
        
        <div class="legend">
            <div class="legend-item">
                <span class="legend-color" style="background: #0066cc;"></span>
                <span>COALNE (Natural coastline)</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #ff6600;"></span>
                <span>SLCONS (Constructed shoreline)</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #00cc66;"></span>
                <span>LNDARE (Land area boundary)</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #cc0066;"></span>
                <span>DEPARE (Depth area boundary)</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #9900cc;"></span>
                <span>DEPCNT (Depth contour)</span>
            </div>
        </div>
        
        <div class="stats">
            <p><strong>Validation:</strong> Shelter Island (red dot) should appear as a peninsula connected to the mainland, not as an isolated island.</p>
            <p><strong>Bounds:</strong> Lat: ${BOUNDS.minLat} to ${BOUNDS.maxLat}, Lon: ${BOUNDS.minLon} to ${BOUNDS.maxLon}</p>
        </div>
    </div>

    <script>
        // Coastline data
        const coastlineData = ${JSON.stringify(coastlineData)};
        
        // Canvas setup
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Bounds
        const bounds = {
            minLat: ${BOUNDS.minLat},
            maxLat: ${BOUNDS.maxLat},
            minLon: ${BOUNDS.minLon},
            maxLon: ${BOUNDS.maxLon}
        };
        
        // Shelter Island location
        const shelterIsland = {
            lat: ${SHELTER_ISLAND_LAT},
            lon: ${SHELTER_ISLAND_LON}
        };
        
        // Color scheme for different source types
        const colors = {
            'COALNE': '#0066cc',    // Natural coastline - blue
            'SLCONS': '#ff6600',    // Constructed shoreline - orange
            'LNDARE': '#00cc66',    // Land area boundary - green
            'DEPARE': '#cc0066',    // Depth area boundary - magenta
            'DEPCNT': '#9900cc',    // Depth contour - purple
            'ACHARE': '#6600cc',    // Anchorage area - purple
            'BUAARE': '#cccc00',    // Built-up area - yellow
            'default': '#666666'    // Other - gray
        };
        
        // Coordinate transformation
        function toCanvas(lon, lat) {
            const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * width;
            const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height;
            return { x, y };
        }
        
        // Clear canvas with water color
        ctx.fillStyle = '#87CEEB'; // Light blue water
        ctx.fillRect(0, 0, width, height);
        
        // Draw grid
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 2]);
        
        // Vertical grid lines
        for (let lon = bounds.minLon; lon <= bounds.maxLon; lon += 0.01) {
            const { x } = toCanvas(lon, bounds.minLat);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // Horizontal grid lines
        for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += 0.01) {
            const { y } = toCanvas(bounds.minLon, lat);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        ctx.setLineDash([]); // Reset line dash
        
        // Draw coastline features
        coastlineData.features.forEach(feature => {
            if (feature.geometry.type === 'LineString') {
                const coords = feature.geometry.coordinates;
                const source = feature.properties.sourceFeatures?.[0] || 'default';
                const color = colors[source] || colors.default;
                
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                
                coords.forEach((coord, index) => {
                    const { x, y } = toCanvas(coord[0], coord[1]);
                    if (index === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });
                
                ctx.stroke();
            }
        });
        
        // Mark Shelter Island location
        const shelterPos = toCanvas(shelterIsland.lon, shelterIsland.lat);
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(shelterPos.x, shelterPos.y, 5, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add label
        ctx.fillStyle = '#ff0000';
        ctx.font = '12px Arial';
        ctx.fillText('Shelter Island', shelterPos.x + 10, shelterPos.y - 5);
        
        // Add coordinate labels
        ctx.fillStyle = '#666';
        ctx.font = '10px Arial';
        
        // Longitude labels
        ctx.fillText(bounds.minLon.toFixed(2), 5, height - 5);
        ctx.fillText(bounds.maxLon.toFixed(2), width - 35, height - 5);
        
        // Latitude labels
        ctx.save();
        ctx.translate(10, height - 10);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(bounds.minLat.toFixed(2), 0, 0);
        ctx.restore();
        
        ctx.save();
        ctx.translate(10, 30);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(bounds.maxLat.toFixed(2), 0, 0);
        ctx.restore();
        
        console.log('Rendered', coastlineData.features.length, 'coastline features');
    </script>
</body>
</html>`;

  await fs.writeFile(
    path.join(__dirname, 'simple-coastline-render.html'),
    html
  );
}

// Run the test
runSimpleRenderTest().catch(console.error);