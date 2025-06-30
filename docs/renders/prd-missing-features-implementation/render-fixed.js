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
import { getWaterLandClassificationHandler } from '../../../dist/handlers/getWaterLandClassification.js';
import { initializeDatabase } from '../../../dist/database/init.js';
import { setDatabaseRepositories } from '../../../dist/services/serviceInitializer.js';

// Shelter Island coordinates (from test-simple-render.js)
const SHELTER_ISLAND_LAT = 32.714935;
const SHELTER_ISLAND_LON = -117.228975;

// Bounding box for San Diego Bay area around Shelter Island
const BOUNDS = {
  minLat: 32.70,
  maxLat: 32.73,
  minLon: -117.25,
  maxLon: -117.20
};

async function testNewCoastlineFeatures() {
  console.log('Testing PRD Missing Coastline Features implementation...');
  
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
  
  // Test configuration WITHOUT new features (baseline)
  const coastlineArgsBaseline = {
    chartId: 'US5CA72M',
    boundingBox: BOUNDS,
    featureSources: {
      // Original features only
      useCoastlines: true,
      useLandAreas: true,
      useDepthAreas: true,
      useShorelineConstruction: true,
      useDepthContours: true,
      useHarborFeatures: true,
      useMooringFeatures: true,
      useSpecialFeatures: true,
      
      // NEW features all disabled for baseline
      useBridges: false,
      usePylons: false,
      useCranes: false,
      useConveyors: false,
      useBerths: false,
      useTerminals: false,
      useDryDocks: false,
      useLockBasins: false,
      useFenceLines: false,
      useRailways: false,
      useDumpingGrounds: false
    },
    stitching: {
      enabled: true,
      tolerance: 50,
      mergeConnected: true
    },
    simplification: {
      enabled: false
    }
  };

  // Test configuration WITH new features
  const coastlineArgsEnhanced = {
    ...coastlineArgsBaseline,
    featureSources: {
      ...coastlineArgsBaseline.featureSources,
      // Enable all new features
      useBridges: true,
      usePylons: true,
      useCranes: true,
      useConveyors: true,
      useBerths: true,
      useTerminals: true,
      useDryDocks: true,
      useLockBasins: true,
      useFenceLines: true,
      useRailways: true,
      useDumpingGrounds: true
    }
  };

  console.log('Extracting baseline coastlines (without new features)...');
  const baselineResult = await extractCoastlinesHandler(coastlineArgsBaseline);
  const baselineData = typeof baselineResult === 'string' 
    ? JSON.parse(baselineResult) 
    : baselineResult;

  console.log('Extracting enhanced coastlines (with new features)...');
  const enhancedResult = await extractCoastlinesHandler(coastlineArgsEnhanced);
  const enhancedData = typeof enhancedResult === 'string' 
    ? JSON.parse(enhancedResult) 
    : enhancedResult;

  // Check for error responses
  if (baselineData.error || enhancedData.error) {
    console.error('Error extracting coastlines:', baselineData.error || enhancedData.error);
    process.exit(1);
  }

  // Save both datasets
  await fs.writeFile(
    path.join(__dirname, 'coastline-data.json'), 
    JSON.stringify({
      baseline: baselineData,
      enhanced: enhancedData
    }, null, 2)
  );

  // Display comparison
  console.log('\n=== Feature Comparison ===');
  console.log('Baseline features:', baselineData.features.length);
  console.log('Enhanced features:', enhancedData.features.length);
  console.log('Additional features:', enhancedData.features.length - baselineData.features.length);

  // Check for new features specifically
  console.log('\n=== New Features Detection ===');
  const newFeatureTypes = [
    'BRIDGE', 'PYLONS', 'CRANES', 'CONVYR',
    'BERTHS', 'TERMNL', 'DRYDOC', 'LOKBSN',
    'FNCLNE', 'RAILWY', 'DMPGRD'
  ];
  
  const enhancedSources = enhancedData.metadata?.sources || {};
  let newFeaturesFound = false;
  
  newFeatureTypes.forEach(featureType => {
    if (enhancedSources[featureType]) {
      console.log(`✓ ${featureType}: ${enhancedSources[featureType].count} features found`);
      newFeaturesFound = true;
    }
  });

  if (!newFeaturesFound) {
    console.log('\nNote: No new feature types found in this chart. This is normal if the chart doesn\'t contain port infrastructure.');
  }

  // Create comparison visualization
  await createComparisonVisualization(baselineData, enhancedData);

  console.log('\n✓ Test completed successfully!');
  console.log('Check render.html for visual comparison');
}

async function createComparisonVisualization(baselineData, enhancedData) {
  const html = `<!DOCTYPE html>
<html>
<head>
    <title>PRD Missing Features Implementation - San Diego Bay</title>
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background-color: #f0f0f0;
            color: #333;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        h1 { margin: 0 0 10px 0; }
        .subtitle { color: #666; }
        .canvases {
            display: flex;
            gap: 20px;
        }
        .canvas-wrapper {
            flex: 1;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        canvas {
            width: 100%;
            border: 1px solid #ddd;
            display: block;
        }
        .title {
            font-weight: bold;
            margin-bottom: 10px;
            color: #333;
        }
        .stats {
            margin-top: 10px;
            font-size: 14px;
            color: #666;
        }
        .legend {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-top: 20px;
        }
        .legend-title { font-weight: bold; margin-bottom: 10px; }
        .legend-section { margin-bottom: 15px; }
        .legend-item {
            display: inline-block;
            margin-right: 20px;
            margin-bottom: 5px;
        }
        .legend-color {
            display: inline-block;
            width: 30px;
            height: 3px;
            margin-right: 5px;
            vertical-align: middle;
        }
        .scale-info {
            background: #f8f8f8;
            padding: 10px;
            border-radius: 4px;
            margin-top: 10px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>PRD Missing Features Implementation Test</h1>
            <div class="subtitle">
                Chart: US5CA72M | Location: San Diego Bay (Shelter Island) | 
                Coordinates: ${SHELTER_ISLAND_LAT}, ${SHELTER_ISLAND_LON}
            </div>
        </div>
        
        <div class="canvases">
            <div class="canvas-wrapper">
                <div class="title">Without New Features (Original Implementation)</div>
                <canvas id="canvasBefore" width="800" height="600"></canvas>
                <div class="stats" id="statsBefore"></div>
            </div>
            <div class="canvas-wrapper">
                <div class="title">With New Features (PRD Implementation)</div>
                <canvas id="canvasAfter" width="800" height="600"></canvas>
                <div class="stats" id="statsAfter"></div>
            </div>
        </div>
        
        <div class="legend">
            <div class="legend-title">Feature Types</div>
            
            <div class="legend-section">
                <strong>Original Features:</strong><br>
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
                    <span>LNDARE/DEPARE (Area boundaries)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: #9900cc;"></span>
                    <span>DEPCNT (Depth contours)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: #cccc00;"></span>
                    <span>Other features</span>
                </div>
            </div>
            
            <div class="legend-section">
                <strong>New PRD Features (if present):</strong><br>
                <div class="legend-item">
                    <span class="legend-color" style="background: #ff00ff;"></span>
                    <span>Port Features (BERTHS, TERMNL, DRYDOC, LOKBSN)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: #ffff00;"></span>
                    <span>Infrastructure (BRIDGE, PYLONS, CRANES, CONVYR)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: #00ffff;"></span>
                    <span>Boundaries (FNCLNE, RAILWY, DMPGRD)</span>
                </div>
            </div>
            
            <div class="scale-info">
                <strong>Note:</strong> Red dot marks Shelter Island location. Grid spacing: 0.01° (approximately 1.1 km)
            </div>
        </div>
    </div>
    
    <script>
        const baselineData = ${JSON.stringify(baselineData)};
        const enhancedData = ${JSON.stringify(enhancedData)};
        
        // Fixed bounds from test configuration
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
        
        // Feature type to color mapping
        const featureColors = {
            // Original features
            'COALNE': '#0066cc',  // Blue
            'SLCONS': '#ff6600',  // Orange
            'LNDARE': '#00cc66',  // Green
            'DEPARE': '#00cc66',  // Green
            'DEPCNT': '#9900cc',  // Purple
            'ACHARE': '#cccc00',  // Yellow
            'BUAARE': '#cccc00',  // Yellow
            'HRBARE': '#ff6600',  // Orange
            'MORFAC': '#ff6600',  // Orange
            'PONTON': '#ff6600',  // Orange
            'FLODOC': '#ff6600',  // Orange
            'CAUSWY': '#ff6600',  // Orange
            
            // New port features (magenta)
            'BERTHS': '#ff00ff',
            'TERMNL': '#ff00ff',
            'DRYDOC': '#ff00ff',
            'LOKBSN': '#ff00ff',
            
            // New infrastructure (yellow)
            'BRIDGE': '#ffff00',
            'PYLONS': '#ffff00',
            'CRANES': '#ffff00',
            'CONVYR': '#ffff00',
            
            // New boundaries (cyan)
            'FNCLNE': '#00ffff',
            'RAILWY': '#00ffff',
            'DMPGRD': '#00ffff',
            
            'default': '#666666'  // Gray
        };
        
        function getFeatureColor(feature) {
            const sources = feature.properties?.sourceFeatures || [];
            const primarySource = sources[0] || 'default';
            return featureColors[primarySource] || featureColors.default;
        }
        
        function renderCanvas(canvasId, features, statsId, label) {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            
            // Coordinate transformation using fixed bounds
            function toCanvas(lon, lat) {
                const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * width;
                const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height;
                return { x, y };
            }
            
            // Clear canvas with water color
            ctx.fillStyle = '#87CEEB';
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
            
            ctx.setLineDash([]);
            
            // Draw coastline features
            features.forEach(feature => {
                if (feature.geometry?.type === 'LineString') {
                    const coords = feature.geometry.coordinates;
                    const color = getFeatureColor(feature);
                    
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
            
            // Calculate statistics
            const stats = calculateStats(features);
            const statsEl = document.getElementById(statsId);
            statsEl.innerHTML = \`
                Features: \${stats.count}<br>
                Total Length: \${stats.totalLength.toFixed(2)} km<br>
                Feature Types: \${stats.types.join(', ')}
            \`;
        }
        
        function calculateStats(features) {
            const types = new Set();
            let totalLength = 0;
            
            features.forEach(f => {
                const sources = f.properties?.sourceFeatures || [];
                sources.forEach(s => types.add(s));
                totalLength += (f.properties?.length_m || 0) / 1000;
            });
            
            return {
                count: features.length,
                totalLength: totalLength,
                types: Array.from(types).sort()
            };
        }
        
        // Render both canvases
        renderCanvas('canvasBefore', baselineData.features, 'statsBefore', 'Baseline');
        renderCanvas('canvasAfter', enhancedData.features, 'statsAfter', 'Enhanced');
        
        console.log('Baseline features:', baselineData.features.length);
        console.log('Enhanced features:', enhancedData.features.length);
    </script>
</body>
</html>`;

  await fs.writeFile(path.join(__dirname, 'render.html'), html);
  console.log('\nCreated visualization: render.html');
}

// Run the test
testNewCoastlineFeatures().catch(console.error);