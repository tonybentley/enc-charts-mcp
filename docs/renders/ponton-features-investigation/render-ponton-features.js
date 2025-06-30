#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the handlers directly
import { extractCoastlinesHandler } from '../../../dist/handlers/extractCoastlines.js';
import { initializeDatabase } from '../../../dist/database/init.js';
import { setDatabaseRepositories } from '../../../dist/services/serviceInitializer.js';

// Fixed bounds for Shelter Island area
const BOUNDS = {
  minLat: 32.70,
  maxLat: 32.73,
  minLon: -117.25,
  maxLon: -117.20
};

// Shelter Island coordinates
const SHELTER_ISLAND_LAT = 32.714935;
const SHELTER_ISLAND_LON = -117.228975;

// Color scheme for features
const FEATURE_COLORS = {
  'COALNE': '#0000ff',    // Blue - natural coastline
  'SLCONS': '#ff0000',    // Red - constructed
  'DEPARE': '#00ff00',    // Green - depth-based
  'LNDARE': '#ffff00',    // Yellow - land areas
  'BUAARE': '#ff00ff',    // Magenta - built-up areas
  'MORFAC': '#00ffff',    // Cyan - mooring facilities
  'PONTON': '#ffa500',    // Orange - pontoons (KEY COLOR)
  'FLODOC': '#800080',    // Purple - floating docks
  'BERTHS': '#4B0082',    // Indigo - berths
  'HULKES': '#FF1493',    // Deep pink - hulks
  'default': '#000000'    // Black - unknown
};

async function extractCoastlines(useMooringFeatures) {
  console.log(`\nExtracting coastlines with useMooringFeatures=${useMooringFeatures}...`);
  
  const args = {
    chartId: 'US5CA72M',
    extractionMethod: 'combined',
    featureSources: {
      useCoastlines: true,
      useDepthAreas: true,
      useLandAreas: true,
      useShorelineConstruction: true,
      useDepthContours: true,
      useHarborFeatures: true,
      useMooringFeatures: useMooringFeatures, // KEY PARAMETER
      useSpecialFeatures: true,
      useBerths: true,
      useTerminals: true
    },
    boundingBox: BOUNDS,
    stitching: {
      enabled: true,
      tolerance: 50,
      mergeConnected: true
    },
    classification: {
      separateByType: true,
      includeMetadata: true
    },
    limit: 1000 // Maximum allowed limit
  };
  
  try {
    const result = await extractCoastlinesHandler(args);
    
    if (result.error) {
      console.error('Error extracting coastlines:', result.error);
      return null;
    }
    
    // Log statistics
    console.log(`Extracted ${result.features.length} coastline features`);
    
    if (result.metadata?.sources) {
      console.log('\nFeature source breakdown:');
      Object.entries(result.metadata.sources).forEach(([source, data]) => {
        console.log(`  ${source}: ${data.count} features, ${(data.totalLength_m / 1000).toFixed(2)} km`);
      });
    }
    
    // Count PONTON features specifically
    const pontonFeatures = result.features.filter(f => 
      f.properties?.sourceFeatures?.includes('PONTON')
    );
    console.log(`\nPONTON features: ${pontonFeatures.length}`);
    
    return result;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function createComparisonVisualization(baselineData, enhancedData) {
  console.log('\nCreating comparison visualization...');
  
  const width = 1200;
  const height = 600;
  const canvasWidth = width / 2;
  
  // Create HTML content
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>PONTON Features Comparison - Shelter Island</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      background-color: #f0f0f0;
    }
    h1 {
      text-align: center;
      color: #333;
    }
    .container {
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
    }
    .visualization {
      background-color: white;
      border: 2px solid #333;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    canvas {
      display: block;
    }
    .legend {
      background-color: white;
      padding: 15px;
      border: 1px solid #ddd;
      margin-top: 20px;
    }
    .legend h3 {
      margin-top: 0;
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin: 5px 0;
    }
    .legend-color {
      width: 30px;
      height: 3px;
      margin-right: 10px;
      border: 1px solid #333;
    }
    .stats {
      background-color: white;
      padding: 15px;
      border: 1px solid #ddd;
      margin-top: 20px;
    }
    .comparison {
      display: flex;
      gap: 40px;
    }
    .column {
      flex: 1;
    }
    .highlight {
      color: #ffa500;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <h1>PONTON Features Comparison - Shelter Island Marina</h1>
  
  <div class="container">
    <div class="column">
      <h2>Baseline (No Mooring Features)</h2>
      <canvas id="baseline" class="visualization" width="${canvasWidth}" height="${height}"></canvas>
    </div>
    <div class="column">
      <h2>Enhanced (With Mooring Features)</h2>
      <canvas id="enhanced" class="visualization" width="${canvasWidth}" height="${height}"></canvas>
    </div>
  </div>
  
  <div class="comparison">
    <div class="column">
      <div class="stats">
        <h3>Baseline Statistics</h3>
        <p>Total features: ${baselineData.features.length}</p>
        <p>Total length: ${(baselineData.metadata?.processingStats?.totalLength_m / 1000).toFixed(2)} km</p>
        <p>PONTON features: ${baselineData.features.filter(f => f.properties?.sourceFeatures?.includes('PONTON')).length}</p>
      </div>
    </div>
    <div class="column">
      <div class="stats">
        <h3>Enhanced Statistics</h3>
        <p>Total features: ${enhancedData.features.length}</p>
        <p>Total length: ${(enhancedData.metadata?.processingStats?.totalLength_m / 1000).toFixed(2)} km</p>
        <p class="highlight">PONTON features: ${enhancedData.features.filter(f => f.properties?.sourceFeatures?.includes('PONTON')).length}</p>
      </div>
    </div>
  </div>
  
  <div class="legend">
    <h3>Feature Type Legend</h3>
    ${Object.entries(FEATURE_COLORS).filter(([key]) => key !== 'default').map(([feature, color]) => `
      <div class="legend-item">
        <div class="legend-color" style="background-color: ${color}"></div>
        <span>${feature}${feature === 'PONTON' ? ' - Pontoons/Floating Docks (KEY FEATURE)' : ''}</span>
      </div>
    `).join('')}
  </div>
  
  <script>
    const baselineData = ${JSON.stringify(baselineData)};
    const enhancedData = ${JSON.stringify(enhancedData)};
    const bounds = ${JSON.stringify(BOUNDS)};
    const colors = ${JSON.stringify(FEATURE_COLORS)};
    
    function toCanvas(lon, lat, canvasWidth, height) {
      const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * canvasWidth;
      const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height;
      return { x, y };
    }
    
    function drawCoastlines(canvasId, data) {
      const canvas = document.getElementById(canvasId);
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;
      
      // Clear canvas with light blue background (water)
      ctx.fillStyle = '#e6f3ff';
      ctx.fillRect(0, 0, width, height);
      
      // Draw grid
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 0.5;
      
      // Latitude lines
      for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += 0.01) {
        const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      // Longitude lines
      for (let lon = bounds.minLon; lon <= bounds.maxLon; lon += 0.01) {
        const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      
      // Sort features to draw PONTON last (on top)
      const sortedFeatures = [...data.features].sort((a, b) => {
        const aPonton = a.properties?.sourceFeatures?.includes('PONTON') ? 1 : 0;
        const bPonton = b.properties?.sourceFeatures?.includes('PONTON') ? 1 : 0;
        return aPonton - bPonton;
      });
      
      // Draw coastlines
      sortedFeatures.forEach(feature => {
        if (feature.geometry.type === 'LineString') {
          const coords = feature.geometry.coordinates;
          const sourceFeature = feature.properties?.sourceFeatures?.[0] || 'default';
          const color = colors[sourceFeature] || colors.default;
          
          // Make PONTON features thicker
          ctx.lineWidth = sourceFeature === 'PONTON' ? 3 : 2;
          ctx.strokeStyle = color;
          
          ctx.beginPath();
          coords.forEach((coord, index) => {
            const { x, y } = toCanvas(coord[0], coord[1], width, height);
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
      const shelterIsland = { lat: ${SHELTER_ISLAND_LAT}, lon: ${SHELTER_ISLAND_LON} };
      const { x, y } = toCanvas(shelterIsland.lon, shelterIsland.lat, width, height);
      
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = '#000000';
      ctx.font = '12px Arial';
      ctx.fillText('Shelter Island', x + 10, y - 5);
    }
    
    // Draw both visualizations
    drawCoastlines('baseline', baselineData);
    drawCoastlines('enhanced', enhancedData);
  </script>
</body>
</html>
  `;
  
  // Save HTML file
  const htmlPath = path.join(__dirname, 'comparison-render.html');
  await fs.writeFile(htmlPath, html);
  console.log(`Visualization saved to: ${htmlPath}`);
  
  return htmlPath;
}

async function main() {
  console.log('=== PONTON Features Render Test ===');
  console.log('Location: Shelter Island, San Diego Bay');
  console.log('Chart: US5CA72M\n');
  
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
    
    // Extract baseline coastlines (no mooring features)
    console.log('2. BASELINE EXTRACTION (No Mooring Features)');
    const baselineData = await extractCoastlines(false);
    if (!baselineData) {
      console.error('Failed to extract baseline coastlines');
      return;
    }
    await fs.writeFile(
      path.join(__dirname, 'baseline-data.json'),
      JSON.stringify(baselineData, null, 2)
    );
    
    // Extract enhanced coastlines (with mooring features)
    console.log('\n3. ENHANCED EXTRACTION (With Mooring Features)');
    const enhancedData = await extractCoastlines(true);
    if (!enhancedData) {
      console.error('Failed to extract enhanced coastlines');
      return;
    }
    await fs.writeFile(
      path.join(__dirname, 'enhanced-data.json'),
      JSON.stringify(enhancedData, null, 2)
    );
    
    // Create comparison visualization
    console.log('\n4. Creating comparison visualization...');
    const htmlPath = createComparisonVisualization(baselineData, enhancedData);
    
    // Compare PONTON feature counts
    const baselinePonton = baselineData.features.filter(f => 
      f.properties?.sourceFeatures?.includes('PONTON')
    ).length;
    const enhancedPonton = enhancedData.features.filter(f => 
      f.properties?.sourceFeatures?.includes('PONTON')
    ).length;
    
    console.log('\n=== PONTON FEATURE COMPARISON ===');
    console.log(`Baseline PONTON features: ${baselinePonton}`);
    console.log(`Enhanced PONTON features: ${enhancedPonton}`);
    console.log(`Difference: +${enhancedPonton - baselinePonton} PONTON features`);
    
    console.log('\n✓ Test completed successfully!');
    console.log('\nTo view the visualization:');
    console.log(`  open ${htmlPath}`);
    
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
main();