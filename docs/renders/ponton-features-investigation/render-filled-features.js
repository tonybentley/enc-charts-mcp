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

// Color scheme for features - using semi-transparent fills
const FEATURE_COLORS = {
  'COALNE': 'rgba(0, 0, 255, 0.6)',      // Blue - natural coastline
  'SLCONS': 'rgba(255, 0, 0, 0.6)',      // Red - constructed
  'DEPARE': 'rgba(0, 255, 0, 0.3)',      // Light green - depth areas
  'LNDARE': 'rgba(139, 69, 19, 0.8)',    // Brown - land areas
  'BUAARE': 'rgba(128, 128, 128, 0.7)',  // Gray - built-up areas
  'MORFAC': 'rgba(0, 255, 255, 0.6)',    // Cyan - mooring facilities
  'PONTON': 'rgba(255, 165, 0, 0.8)',    // Orange - pontoons (KEY COLOR)
  'FLODOC': 'rgba(128, 0, 128, 0.6)',    // Purple - floating docks
  'BERTHS': 'rgba(75, 0, 130, 0.6)',     // Indigo - berths
  'HULKES': 'rgba(255, 20, 147, 0.6)',   // Deep pink - hulks
  'ACHARE': 'rgba(255, 255, 0, 0.4)',    // Yellow - anchorage areas
  'HRBARE': 'rgba(0, 128, 0, 0.4)',      // Dark green - harbor areas
  'default': 'rgba(0, 0, 0, 0.3)'        // Black - unknown
};

// Stroke colors for outlines
const STROKE_COLORS = {
  'COALNE': '#0000ff',
  'SLCONS': '#ff0000',
  'DEPARE': '#00ff00',
  'LNDARE': '#8B4513',
  'BUAARE': '#808080',
  'MORFAC': '#00ffff',
  'PONTON': '#ff8c00',    // Darker orange for PONTON outline
  'FLODOC': '#800080',
  'BERTHS': '#4B0082',
  'HULKES': '#FF1493',
  'ACHARE': '#ffff00',
  'HRBARE': '#008000',
  'default': '#000000'
};

async function extractCoastlines() {
  console.log(`\nExtracting all coastline features with fills...`);
  
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
      useMooringFeatures: true,
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
    limit: 1000
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
    
    return result;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function createFilledVisualization(data) {
  console.log('\nCreating filled features visualization...');
  
  const width = 1200;
  const height = 1200;
  
  // Create HTML content
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Filled Chart Features - Shelter Island</title>
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
      justify-content: center;
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
      max-width: 1200px;
      margin-left: auto;
      margin-right: auto;
    }
    .legend h3 {
      margin-top: 0;
    }
    .legend-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin: 5px 0;
    }
    .legend-color {
      width: 30px;
      height: 20px;
      margin-right: 10px;
      border: 1px solid #333;
    }
    .stats {
      background-color: white;
      padding: 15px;
      border: 1px solid #ddd;
      margin-top: 20px;
      max-width: 1200px;
      margin-left: auto;
      margin-right: auto;
    }
  </style>
</head>
<body>
  <h1>Chart Features Visualization - Shelter Island Marina</h1>
  
  <div class="container">
    <canvas id="chart" class="visualization" width="${width}" height="${height}"></canvas>
  </div>
  
  <div class="stats">
    <h3>Feature Statistics</h3>
    <p>Total features: ${data.features.length}</p>
    <p>Total length: ${(data.metadata?.processingStats?.totalLength_m / 1000).toFixed(2)} km</p>
    ${Object.entries(data.metadata?.sources || {}).map(([source, stats]) => 
      `<p><strong>${source}</strong>: ${stats.count} features, ${(stats.totalLength_m / 1000).toFixed(2)} km</p>`
    ).join('')}
  </div>
  
  <div class="legend">
    <h3>Feature Type Legend</h3>
    <div class="legend-grid">
      ${Object.entries(FEATURE_COLORS).filter(([key]) => key !== 'default').map(([feature, color]) => {
        const strokeColor = STROKE_COLORS[feature] || STROKE_COLORS.default;
        return `
        <div class="legend-item">
          <div class="legend-color" style="background-color: ${color}; border-color: ${strokeColor}"></div>
          <span>${feature}${feature === 'PONTON' ? ' - Pontoons/Floating Docks' : ''}</span>
        </div>
      `;
      }).join('')}
    </div>
  </div>
  
  <script>
    const data = ${JSON.stringify(data)};
    const bounds = ${JSON.stringify(BOUNDS)};
    const fillColors = ${JSON.stringify(FEATURE_COLORS)};
    const strokeColors = ${JSON.stringify(STROKE_COLORS)};
    
    function toCanvas(lon, lat) {
      const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * ${width};
      const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * ${height};
      return { x, y };
    }
    
    function drawFeatures() {
      const canvas = document.getElementById('chart');
      const ctx = canvas.getContext('2d');
      
      // Clear canvas with light blue background (water)
      ctx.fillStyle = '#b8d4e3';
      ctx.fillRect(0, 0, ${width}, ${height});
      
      // Draw grid
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.5;
      
      // Latitude lines
      for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += 0.005) {
        const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * ${height};
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(${width}, y);
        ctx.stroke();
      }
      
      // Longitude lines
      for (let lon = bounds.minLon; lon <= bounds.maxLon; lon += 0.005) {
        const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * ${width};
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ${height});
        ctx.stroke();
      }
      
      ctx.globalAlpha = 1.0;
      
      // Sort features to draw land and large areas first, then details on top
      const sortedFeatures = [...data.features].sort((a, b) => {
        const priorityA = ['LNDARE', 'BUAARE', 'DEPARE', 'HRBARE', 'ACHARE'].includes(a.properties?.sourceFeatures?.[0]) ? 0 : 1;
        const priorityB = ['LNDARE', 'BUAARE', 'DEPARE', 'HRBARE', 'ACHARE'].includes(b.properties?.sourceFeatures?.[0]) ? 0 : 1;
        return priorityA - priorityB;
      });
      
      // Draw features
      sortedFeatures.forEach(feature => {
        if (feature.geometry.type === 'LineString') {
          const coords = feature.geometry.coordinates;
          const sourceFeature = feature.properties?.sourceFeatures?.[0] || 'default';
          const fillColor = fillColors[sourceFeature] || fillColors.default;
          const strokeColor = strokeColors[sourceFeature] || strokeColors.default;
          
          // Draw filled polygon (closing the linestring)
          ctx.fillStyle = fillColor;
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = sourceFeature === 'PONTON' ? 2 : 1;
          
          ctx.beginPath();
          coords.forEach((coord, index) => {
            const { x, y } = toCanvas(coord[0], coord[1]);
            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          
          // Close the path for filling
          ctx.closePath();
          
          // Fill first, then stroke
          ctx.fill();
          ctx.stroke();
        }
      });
      
      // Mark Shelter Island location
      const shelterIsland = { lat: ${SHELTER_ISLAND_LAT}, lon: ${SHELTER_ISLAND_LON} };
      const { x, y } = toCanvas(shelterIsland.lon, shelterIsland.lat);
      
      // White background circle
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fill();
      
      // Red marker
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
      
      // Label
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('Shelter Island', x + 12, y - 5);
    }
    
    // Draw the visualization
    drawFeatures();
  </script>
</body>
</html>
  `;
  
  // Save HTML file
  const htmlPath = path.join(__dirname, 'filled-features-render.html');
  await fs.writeFile(htmlPath, html);
  console.log(`Visualization saved to: ${htmlPath}`);
  
  // Also save the data
  await fs.writeFile(
    path.join(__dirname, 'filled-features-data.json'),
    JSON.stringify(data, null, 2)
  );
  
  return htmlPath;
}

async function main() {
  console.log('=== Filled Features Render Test ===');
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
    
    // Extract coastlines with all features
    console.log('2. Extracting all chart features...');
    const data = await extractCoastlines();
    if (!data) {
      console.error('Failed to extract features');
      return;
    }
    
    // Create filled visualization
    console.log('\n3. Creating filled features visualization...');
    const htmlPath = await createFilledVisualization(data);
    
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