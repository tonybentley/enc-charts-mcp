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

async function runTidalFeaturesTest() {
  console.log('=== Tidal Features Coastline Rendering Test ===');
  console.log('Extracting coastlines with enhanced tidal zone detection');
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

    // Extract coastlines with tidal features emphasis
    console.log('2. Extracting coastlines with tidal features...');
    const coastlineArgs = {
      chartId: 'US5CA72M',
      boundingBox: BOUNDS,
      limit: 200,  // Increased limit for more features
      stitching: {
        enabled: true,
        tolerance: 25,  // Tighter tolerance for tidal zones
        mergeConnected: true
      },
      featureSources: {
        useCoastlines: true,
        useLandAreas: true,
        useDepthAreas: true,        // Important for tidal zones
        useShorelineConstruction: true,
        useDepthContours: true,     // 0-depth contours for tide lines
        // Additional sources that might contain tidal features
        useHarborFeatures: true,
        useMooringFeatures: true,
        useSpecialFeatures: true
      },
      extractionMethod: 'combined',
      // Focus on shallow water areas for tidal zones
      depthRange: {
        min: -2,  // Below low tide
        max: 2    // Above high tide
      }
    };

    const coastlineResult = await extractCoastlinesHandler(coastlineArgs);
    const coastlineData = coastlineResult;

    console.log(`✓ Extracted ${coastlineData.features.length} features`);
    console.log(`  Total length: ${(coastlineData.metadata.processingStats.totalLength_m / 1000).toFixed(2)} km`);
    
    // Show feature breakdown
    if (coastlineData.metadata.sources) {
      console.log('\n  Feature sources:');
      Object.entries(coastlineData.metadata.sources).forEach(([source, stats]) => {
        console.log(`    - ${source}: ${stats.count} features, ${(stats.totalLength_m / 1000).toFixed(2)} km`);
      });
    }

    // Save coastline data
    await fs.writeFile(
      path.join(__dirname, 'tidal-features-data.json'),
      JSON.stringify(coastlineData, null, 2)
    );

    // Create tidal-focused visualization
    console.log('\n3. Creating tidal features visualization...');
    await createTidalVisualization(coastlineData);
    console.log(`✓ Visualization saved to: ${path.join(__dirname, 'tidal-features-render.html')}`);

    // Create summary
    const summary = {
      testName: 'Tidal Features Coastline Extraction',
      timestamp: new Date().toISOString(),
      location: {
        name: 'Shelter Island',
        coordinates: { lat: SHELTER_ISLAND_LAT, lon: SHELTER_ISLAND_LON }
      },
      parameters: {
        depthRange: coastlineArgs.depthRange,
        stitchingTolerance: coastlineArgs.stitching.tolerance,
        extractionMethod: coastlineArgs.extractionMethod
      },
      results: {
        totalFeatures: coastlineData.features.length,
        totalLength_km: (coastlineData.metadata.processingStats.totalLength_m / 1000).toFixed(2),
        sources: coastlineData.metadata.sources,
        tidalFeatures: countTidalFeatures(coastlineData)
      }
    };

    await fs.writeFile(
      path.join(__dirname, 'tidal-features-summary.json'),
      JSON.stringify(summary, null, 2)
    );

    console.log('\n✓ Test completed successfully!');
    console.log('\nTo view the visualization:');
    console.log(`  open ${path.join(__dirname, 'tidal-features-render.html')}`);

  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
  }
}

function countTidalFeatures(coastlineData) {
  let tidalCount = 0;
  let depthBasedCount = 0;
  
  coastlineData.features.forEach(feature => {
    const sources = feature.properties.sourceFeatures || [];
    // Count features from depth-related sources
    if (sources.includes('DEPARE') || sources.includes('DEPCNT')) {
      depthBasedCount++;
    }
    // Count features that might be in tidal zones based on properties
    if (feature.properties.subType === 'tidal' || 
        feature.properties.type === 'shoreline' ||
        (feature.properties.depth_range && 
         feature.properties.depth_range.min >= -2 && 
         feature.properties.depth_range.max <= 2)) {
      tidalCount++;
    }
  });
  
  return {
    depthBased: depthBasedCount,
    tidalZone: tidalCount,
    total: coastlineData.features.length
  };
}

async function createTidalVisualization(coastlineData) {
  const html = `<!DOCTYPE html>
<html>
<head>
    <title>Tidal Features Coastline Render - San Diego Bay</title>
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
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 { margin-top: 0; color: #2c3e50; }
        .info {
            background: #e8f4f8;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            border-left: 4px solid #3498db;
        }
        #canvas {
            border: 1px solid #ddd;
            display: block;
            margin: 20px auto;
            background: #f0f8ff; /* Alice blue for water */
        }
        .legend {
            margin-top: 20px;
            padding: 15px;
            background: #f8f8f8;
            border-radius: 4px;
            columns: 2;
            column-gap: 30px;
        }
        .legend-title {
            font-weight: bold;
            margin-bottom: 10px;
            column-span: all;
        }
        .legend-item {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
            break-inside: avoid;
        }
        .legend-color {
            display: inline-block;
            width: 40px;
            height: 4px;
            margin-right: 10px;
            border-radius: 2px;
        }
        .stats {
            margin-top: 20px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        .stat-box {
            background: #f4f4f4;
            padding: 15px;
            border-radius: 5px;
            text-align: center;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: #3498db;
        }
        .stat-label {
            font-size: 14px;
            color: #666;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div id="container">
        <h1>Tidal Features Coastline Rendering</h1>
        
        <div class="info">
            <strong>Focus:</strong> Enhanced extraction of tidal zone features including shallow water boundaries, 
            0-depth contours, and shoreline constructions. Tighter stitching tolerance (25m) for better detail.
        </div>
        
        <p><strong>Chart:</strong> ${coastlineData.metadata.chartId} | 
           <strong>Features:</strong> ${coastlineData.features.length} | 
           <strong>Total Length:</strong> ${(coastlineData.metadata.processingStats.totalLength_m / 1000).toFixed(2)} km</p>
        
        <canvas id="canvas" width="1000" height="750"></canvas>
        
        <div class="legend">
            <div class="legend-title">Feature Types</div>
            <div class="legend-item">
                <span class="legend-color" style="background: #0066cc;"></span>
                <span>COALNE - Natural coastline</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #ff6600;"></span>
                <span>SLCONS - Constructed shoreline</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #00cc66;"></span>
                <span>LNDARE - Land area boundary</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #cc0066;"></span>
                <span>DEPARE - Depth area (tidal zones)</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #9900cc;"></span>
                <span>DEPCNT - Depth contour (0m = tide line)</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #00cccc;"></span>
                <span>MORFAC - Mooring facility</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #cccc00;"></span>
                <span>BUAARE - Built-up area</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #6600cc;"></span>
                <span>ACHARE - Anchorage area</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #ff99cc;"></span>
                <span>PONTON - Pontoon/floating structure</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background: #99ccff;"></span>
                <span>FLODOC - Floating dock</span>
            </div>
        </div>
        
        <div class="stats" id="stats"></div>
        
        <div style="margin-top: 20px; padding: 15px; background: #fffacd; border-radius: 5px;">
            <strong>Validation:</strong> Look for enhanced detail in shallow water areas, tidal zones, 
            and shoreline features. Shelter Island (red dot) should show as a peninsula with detailed 
            harbor features and depth transitions.
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
        
        // Enhanced color scheme for tidal features
        const colors = {
            'COALNE': '#0066cc',    // Natural coastline - blue
            'SLCONS': '#ff6600',    // Constructed shoreline - orange
            'LNDARE': '#00cc66',    // Land area - green
            'DEPARE': '#cc0066',    // Depth area (tidal) - magenta
            'DEPCNT': '#9900cc',    // Depth contour - purple
            'ACHARE': '#6600cc',    // Anchorage - purple
            'BUAARE': '#cccc00',    // Built-up area - yellow
            'MORFAC': '#00cccc',    // Mooring facility - cyan
            'PONTON': '#ff99cc',    // Pontoon - pink
            'FLODOC': '#99ccff',    // Floating dock - light blue
            'HRBARE': '#ffcc99',    // Harbor area - peach
            'CAUSWY': '#cc99ff',    // Causeway - lavender
            'DAMCON': '#996633',    // Dam - brown
            'GATCON': '#336699',    // Gate - dark blue
            'PRYARE': '#99cc66',    // Ferry area - light green
            'default': '#666666'    // Other - gray
        };
        
        // Coordinate transformation with padding
        const padding = 50;
        function toCanvas(lon, lat) {
            const x = padding + ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * (width - 2 * padding);
            const y = padding + ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * (height - 2 * padding);
            return { x, y };
        }
        
        // Clear canvas with gradient water color
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#e0f2ff');  // Light blue at top
        gradient.addColorStop(1, '#87ceeb');  // Sky blue at bottom
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        // Draw fine grid
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([1, 3]);
        
        // Vertical grid lines (every 0.005 degrees)
        for (let lon = bounds.minLon; lon <= bounds.maxLon; lon += 0.005) {
            const { x } = toCanvas(lon, bounds.minLat);
            ctx.beginPath();
            ctx.moveTo(x, padding);
            ctx.lineTo(x, height - padding);
            ctx.stroke();
        }
        
        // Horizontal grid lines
        for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += 0.005) {
            const { y } = toCanvas(bounds.minLon, lat);
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }
        
        ctx.setLineDash([]); // Reset line dash
        
        // Group features by source for statistics
        const featureStats = {};
        
        // Draw coastline features with varying line weights
        coastlineData.features.forEach(feature => {
            if (feature.geometry.type === 'LineString') {
                const coords = feature.geometry.coordinates;
                const source = feature.properties.sourceFeatures?.[0] || 'default';
                const color = colors[source] || colors.default;
                
                // Track statistics
                if (!featureStats[source]) {
                    featureStats[source] = { count: 0, length: 0 };
                }
                featureStats[source].count++;
                featureStats[source].length += feature.properties.length_m || 0;
                
                // Vary line weight based on feature type
                let lineWidth = 2;
                if (source === 'DEPCNT' || source === 'DEPARE') {
                    lineWidth = 3; // Emphasize tidal features
                } else if (source === 'SLCONS' || source === 'MORFAC') {
                    lineWidth = 2.5;
                }
                
                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                // Add glow effect for depth features
                if (source === 'DEPCNT' || source === 'DEPARE') {
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 5;
                }
                
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
                ctx.shadowBlur = 0; // Reset shadow
            }
        });
        
        // Mark Shelter Island location with enhanced marker
        const shelterPos = toCanvas(shelterIsland.lon, shelterIsland.lat);
        
        // Outer circle
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.arc(shelterPos.x, shelterPos.y, 12, 0, 2 * Math.PI);
        ctx.fill();
        
        // Inner circle
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(shelterPos.x, shelterPos.y, 6, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add label with background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(shelterPos.x + 15, shelterPos.y - 20, 90, 25);
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('Shelter Island', shelterPos.x + 20, shelterPos.y - 5);
        
        // Add coordinate labels
        ctx.fillStyle = '#333';
        ctx.font = '11px Arial';
        
        // Longitude labels
        ctx.fillText(bounds.minLon.toFixed(3), padding - 5, height - padding + 20);
        ctx.fillText(bounds.maxLon.toFixed(3), width - padding - 30, height - padding + 20);
        
        // Latitude labels
        ctx.save();
        ctx.translate(padding - 20, height - padding);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(bounds.minLat.toFixed(3), 0, 0);
        ctx.restore();
        
        ctx.save();
        ctx.translate(padding - 20, padding + 30);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(bounds.maxLat.toFixed(3), 0, 0);
        ctx.restore();
        
        // Add scale bar
        const scaleBarY = height - 30;
        const scaleBarX = width - 200;
        const metersPerDegree = 111000; // Approximate at this latitude
        const scaleKm = 1; // 1 km scale
        const scalePixels = (scaleKm / 1000) / (bounds.maxLon - bounds.minLon) * (width - 2 * padding) / metersPerDegree;
        
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(scaleBarX, scaleBarY);
        ctx.lineTo(scaleBarX + scalePixels, scaleBarY);
        ctx.stroke();
        
        // Scale bar ends
        ctx.beginPath();
        ctx.moveTo(scaleBarX, scaleBarY - 5);
        ctx.lineTo(scaleBarX, scaleBarY + 5);
        ctx.moveTo(scaleBarX + scalePixels, scaleBarY - 5);
        ctx.lineTo(scaleBarX + scalePixels, scaleBarY + 5);
        ctx.stroke();
        
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.fillText('1 km', scaleBarX + scalePixels/2 - 15, scaleBarY - 10);
        
        // Display statistics
        const statsDiv = document.getElementById('stats');
        
        // Total features
        statsDiv.innerHTML += \`
            <div class="stat-box">
                <div class="stat-value">\${coastlineData.features.length}</div>
                <div class="stat-label">Total Features</div>
            </div>
        \`;
        
        // Total length
        statsDiv.innerHTML += \`
            <div class="stat-box">
                <div class="stat-value">\${(coastlineData.metadata.processingStats.totalLength_m / 1000).toFixed(1)}</div>
                <div class="stat-label">Total Length (km)</div>
            </div>
        \`;
        
        // Depth-based features
        const depthFeatures = Object.entries(featureStats)
            .filter(([source]) => source === 'DEPARE' || source === 'DEPCNT')
            .reduce((sum, [, stats]) => sum + stats.count, 0);
        
        statsDiv.innerHTML += \`
            <div class="stat-box">
                <div class="stat-value">\${depthFeatures}</div>
                <div class="stat-label">Tidal/Depth Features</div>
            </div>
        \`;
        
        // Source types
        statsDiv.innerHTML += \`
            <div class="stat-box">
                <div class="stat-value">\${Object.keys(featureStats).length}</div>
                <div class="stat-label">Source Types</div>
            </div>
        \`;
        
        console.log('Feature statistics:', featureStats);
        console.log('Rendered', coastlineData.features.length, 'coastline features');
    </script>
</body>
</html>`;

  await fs.writeFile(
    path.join(__dirname, 'tidal-features-render.html'),
    html
  );
}

// Run the test
runTidalFeaturesTest().catch(console.error);