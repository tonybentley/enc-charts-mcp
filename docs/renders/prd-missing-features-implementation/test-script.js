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
  
  // Test configuration with all new features enabled
  const coastlineArgs = {
    chartId: 'US5CA72M',  // San Diego Bay chart (same as test-simple-render.js)
    boundingBox: BOUNDS,  // Use the correct San Diego Bay bounds
    featureSources: {
      // Original features
      useCoastlines: true,
      useLandAreas: true,
      useDepthAreas: true,
      useShorelineConstruction: true,
      useDepthContours: true,
      useHarborFeatures: true,
      useMooringFeatures: true,
      useSpecialFeatures: true,
      
      // NEW infrastructure features (enabled for testing)
      useBridges: true,
      usePylons: true,
      useCranes: true,
      useConveyors: true,
      
      // NEW port features (enabled for testing)
      useBerths: true,
      useTerminals: true,
      useDryDocks: true,
      useLockBasins: true,
      
      // NEW boundary features (enabled for testing)
      useFenceLines: true,
      useRailways: true,
      useDumpingGrounds: true
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
    simplification: {
      enabled: false
    },
    classification: {
      separateByType: true,
      includeMetadata: true
    }
  };

  console.log('Extracting coastlines with all new features enabled...');
  const coastlineResult = await extractCoastlinesHandler(coastlineArgs);
  const coastlineData = typeof coastlineResult === 'string' 
    ? JSON.parse(coastlineResult) 
    : coastlineResult;

  // Check for error response
  if (coastlineData.error) {
    console.error('Error extracting coastlines:', coastlineData.error);
    process.exit(1);
  }

  // Save coastline data for analysis
  await fs.writeFile(
    'extracted-coastlines-new-features.json', 
    JSON.stringify(coastlineData, null, 2)
  );

  // Display feature source breakdown
  console.log('\n=== Feature Source Analysis ===');
  const sources = coastlineData.metadata?.sources || {};
  console.log('Feature sources found:');
  Object.entries(sources).forEach(([source, data]) => {
    console.log(`  ${source}: ${data.count} features, ${(data.totalLength_m / 1000).toFixed(2)} km`);
  });

  // Check for new features specifically
  console.log('\n=== New Features Detection ===');
  const newFeatureTypes = [
    'BRIDGE', 'PYLONS', 'CRANES', 'CONVYR',
    'BERTHS', 'TERMNL', 'DRYDOC', 'LOKBSN',
    'FNCLNE', 'RAILWY', 'DMPGRD'
  ];
  
  let newFeaturesFound = false;
  newFeatureTypes.forEach(featureType => {
    if (sources[featureType]) {
      console.log(`✓ ${featureType}: ${sources[featureType].count} features found`);
      newFeaturesFound = true;
    } else {
      console.log(`✗ ${featureType}: Not found in this chart`);
    }
  });

  if (!newFeaturesFound) {
    console.log('\nNote: No new feature types found in this chart. This could be normal if the chart doesn\'t contain port infrastructure.');
  }

  // Get water/land classification for visualization
  let classificationData = null;
  try {
    const classificationArgs = {
      chartId: 'US5CA72M',  // Same chart as coastline extraction
      boundingBox: BOUNDS,  // Use the same bounds
      includeFeatures: {
        waterPolygons: true,
        landPolygons: true,
        coastlines: true
      }
    };

    console.log('\nGetting water/land classification...');
    const classificationResult = await getWaterLandClassificationHandler(classificationArgs);
    classificationData = typeof classificationResult === 'string' 
      ? JSON.parse(classificationResult) 
      : classificationResult;
  } catch (error) {
    console.log('Note: Could not get water/land classification, continuing without it');
    console.error('Error getting water/land classification:', error.message);
    classificationData = { features: [] };
  }

  // Create comparison visualization (before/after)
  await createComparisonVisualization(coastlineData, classificationData);

  // Display statistics
  console.log('\n=== Extraction Statistics ===');
  const stats = coastlineData.metadata?.processingStats || {};
  console.log(`Total segments extracted: ${stats.totalSegments || 0}`);
  console.log(`Stitched segments: ${stats.stitchedSegments || 0}`);
  console.log(`Total length: ${((stats.totalLength_m || 0) / 1000).toFixed(2)} km`);
  console.log(`Gaps detected: ${stats.gaps || 0}`);
  if (stats.largestGap_m) {
    console.log(`Largest gap: ${stats.largestGap_m.toFixed(1)} m`);
  }
  
  console.log('\n✓ Test completed successfully!');
  console.log('Check extracted-coastlines-new-features.json for raw data');
  console.log('Check new-features-comparison.html for visual comparison');
}

async function createComparisonVisualization(coastlineData, classificationData) {
  const html = `<!DOCTYPE html>
<html>
<head>
    <title>Coastline Features Comparison - Before/After PRD Implementation</title>
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background-color: #1a1a1a;
            color: #fff;
        }
        .container {
            display: flex;
            height: 100vh;
        }
        .canvas-wrapper {
            flex: 1;
            position: relative;
            margin: 10px;
        }
        canvas {
            width: 100%;
            height: calc(100% - 60px);
            background: linear-gradient(to bottom, #87CEEB 0%, #98D8E8 100%);
            border: 2px solid #333;
        }
        .title {
            text-align: center;
            padding: 10px;
            background-color: #333;
            margin-bottom: 10px;
        }
        .stats {
            position: absolute;
            bottom: 10px;
            left: 10px;
            background: rgba(0,0,0,0.8);
            padding: 10px;
            border-radius: 5px;
            font-size: 12px;
        }
        .legend {
            position: absolute;
            top: 70px;
            right: 10px;
            background: rgba(0,0,0,0.8);
            padding: 10px;
            border-radius: 5px;
            font-size: 12px;
        }
        .scale-bar {
            position: absolute;
            bottom: 10px;
            right: 10px;
            background: rgba(255,255,255,0.9);
            padding: 5px 10px;
            border-radius: 3px;
            color: #000;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="canvas-wrapper">
            <div class="title">Without New Features (Original)</div>
            <canvas id="canvasBefore"></canvas>
            <div class="stats" id="statsBefore"></div>
            <div class="legend">
                <div style="color: #00f;">━ Natural Coastline</div>
                <div style="color: #f00;">━ Constructed</div>
                <div style="color: #0f0;">━ Depth-based</div>
                <div style="color: #80D4F0;">■ Water</div>
                <div style="color: #90EE90;">■ Land</div>
            </div>
            <div class="scale-bar">1 km</div>
        </div>
        <div class="canvas-wrapper">
            <div class="title">With New Features (PRD Implementation)</div>
            <canvas id="canvasAfter"></canvas>
            <div class="stats" id="statsAfter"></div>
            <div class="legend">
                <div style="color: #00f;">━ Natural Coastline</div>
                <div style="color: #f00;">━ Constructed</div>
                <div style="color: #0f0;">━ Depth-based</div>
                <div style="color: #ff00ff;">━ Port Features</div>
                <div style="color: #ffff00;">━ Infrastructure</div>
                <div style="color: #00ffff;">━ Boundaries</div>
                <div style="color: #80D4F0;">■ Water</div>
                <div style="color: #90EE90;">■ Land</div>
            </div>
            <div class="scale-bar">1 km</div>
        </div>
    </div>
    <script>
        const coastlineData = ${JSON.stringify(coastlineData)};
        const classificationData = ${JSON.stringify(classificationData)};
        
        // Feature type to color mapping
        const featureColors = {
            // Original features
            'COALNE': '#0000ff',  // Blue - natural
            'SLCONS': '#ff0000',  // Red - constructed
            'DEPARE': '#00ff00',  // Green - depth
            'DEPCNT': '#00ff00',  // Green - depth
            'LNDARE': '#0000ff',  // Blue - natural
            'MORFAC': '#ff0000',  // Red - constructed
            'PONTON': '#ff0000',  // Red - constructed
            'FLODOC': '#ff0000',  // Red - constructed
            'HRBARE': '#ff0000',  // Red - constructed
            'CAUSWY': '#ff0000',  // Red - constructed
            
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
            'DMPGRD': '#00ffff'
        };
        
        function getFeatureColor(feature) {
            const sources = feature.properties?.sourceFeatures || [];
            const primarySource = sources[0] || 'unknown';
            return featureColors[primarySource] || '#ffffff';
        }
        
        function renderComparison() {
            // Render "before" canvas with only original features
            const originalFeatures = coastlineData.features.filter(f => {
                const sources = f.properties?.sourceFeatures || [];
                const newFeatureTypes = ['BRIDGE', 'PYLONS', 'CRANES', 'CONVYR', 
                                       'BERTHS', 'TERMNL', 'DRYDOC', 'LOKBSN',
                                       'FNCLNE', 'RAILWY', 'DMPGRD'];
                return !sources.some(s => newFeatureTypes.includes(s));
            });
            
            renderCanvas('canvasBefore', originalFeatures, classificationData, 'statsBefore');
            
            // Render "after" canvas with all features
            renderCanvas('canvasAfter', coastlineData.features, classificationData, 'statsAfter');
        }
        
        function renderCanvas(canvasId, features, classification, statsId) {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas.getContext('2d');
            
            // Set canvas size
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            
            // Calculate bounds
            let minLat = Infinity, maxLat = -Infinity;
            let minLon = Infinity, maxLon = -Infinity;
            
            features.forEach(feature => {
                if (feature.geometry && feature.geometry.coordinates) {
                    feature.geometry.coordinates.forEach(coord => {
                        minLon = Math.min(minLon, coord[0]);
                        maxLon = Math.max(maxLon, coord[0]);
                        minLat = Math.min(minLat, coord[1]);
                        maxLat = Math.max(maxLat, coord[1]);
                    });
                }
            });
            
            // Add padding
            const padding = 0.005;
            minLat -= padding;
            maxLat += padding;
            minLon -= padding;
            maxLon += padding;
            
            // Transform functions
            function lonToX(lon) {
                return (lon - minLon) / (maxLon - minLon) * canvas.width;
            }
            
            function latToY(lat) {
                return canvas.height - ((lat - minLat) / (maxLat - minLat) * canvas.height);
            }
            
            // Clear canvas with gradient background
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, '#87CEEB');
            gradient.addColorStop(1, '#98D8E8');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw water polygons
            if (classification.features) {
                classification.features
                    .filter(f => f.properties?.classification === 'water')
                    .forEach(feature => {
                        ctx.fillStyle = 'rgba(128, 212, 240, 0.6)';
                        drawPolygon(ctx, feature, lonToX, latToY);
                    });
                
                // Draw land polygons
                classification.features
                    .filter(f => f.properties?.classification === 'land')
                    .forEach(feature => {
                        ctx.fillStyle = 'rgba(144, 238, 144, 0.8)';
                        drawPolygon(ctx, feature, lonToX, latToY);
                    });
            }
            
            // Draw coastlines with colors based on source
            ctx.lineWidth = 2;
            features.forEach(feature => {
                if (feature.geometry?.type === 'LineString') {
                    ctx.strokeStyle = getFeatureColor(feature);
                    ctx.beginPath();
                    feature.geometry.coordinates.forEach((coord, i) => {
                        const x = lonToX(coord[0]);
                        const y = latToY(coord[1]);
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    });
                    ctx.stroke();
                }
            });
            
            // Draw scale bar
            const kmPerDegree = 111; // Approximate
            const mapWidthKm = (maxLon - minLon) * kmPerDegree;
            const scaleBarKm = 1; // 1 km
            const scaleBarPixels = (scaleBarKm / mapWidthKm) * canvas.width;
            
            // Calculate statistics
            const stats = calculateStats(features);
            const statsEl = document.getElementById(statsId);
            statsEl.innerHTML = \`
                Features: \${stats.count}<br>
                Length: \${stats.totalLength.toFixed(2)} km<br>
                Types: \${stats.types.join(', ')}
            \`;
        }
        
        function drawPolygon(ctx, feature, lonToX, latToY) {
            if (feature.geometry?.type === 'Polygon') {
                feature.geometry.coordinates.forEach(ring => {
                    ctx.beginPath();
                    ring.forEach((coord, i) => {
                        const x = lonToX(coord[0]);
                        const y = latToY(coord[1]);
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    });
                    ctx.closePath();
                    ctx.fill();
                });
            }
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
                types: Array.from(types)
            };
        }
        
        // Render on load
        renderComparison();
    </script>
</body>
</html>`;

  await fs.writeFile('new-features-comparison.html', html);
  console.log('\nCreated visualization: new-features-comparison.html');
}

// Run the test
testNewCoastlineFeatures().catch(console.error);