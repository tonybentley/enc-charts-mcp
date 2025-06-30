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

// Expanded bounds for San Diego Bay including Point Loma
// Point Loma extends south to about 32.65°N
// Northern San Diego Bay extends to about 32.75°N
// Western extent includes Point Loma to about -117.25°W
// Eastern extent covers the bay to about -117.08°W
const BOUNDS = {
  minLat: 32.65,   // Point Loma southern tip
  maxLat: 32.75,   // Northern San Diego Bay
  minLon: -117.25, // Point Loma western coast
  maxLon: -117.08  // Eastern bay area
};

// San Diego Bay center coordinates
const SAN_DIEGO_BAY_LAT = 32.70;
const SAN_DIEGO_BAY_LON = -117.16;

// Color scheme for features - using semi-transparent fills
const FEATURE_COLORS = {
  'COALNE': 'rgba(0, 0, 255, 0.7)',      // Blue - natural coastline
  'SLCONS': 'rgba(255, 0, 0, 0.7)',      // Red - constructed
  'DEPARE': 'rgba(0, 255, 0, 0.2)',      // Light green - depth areas
  'LNDARE': 'rgba(139, 69, 19, 0.9)',    // Brown - land areas
  'BUAARE': 'rgba(128, 128, 128, 0.8)',  // Gray - built-up areas
  'MORFAC': 'rgba(0, 255, 255, 0.7)',    // Cyan - mooring facilities
  'PONTON': 'rgba(255, 165, 0, 0.9)',    // Orange - pontoons
  'FLODOC': 'rgba(128, 0, 128, 0.7)',    // Purple - floating docks
  'BERTHS': 'rgba(75, 0, 130, 0.7)',     // Indigo - berths
  'HULKES': 'rgba(255, 20, 147, 0.7)',   // Deep pink - hulks
  'ACHARE': 'rgba(255, 255, 0, 0.3)',    // Yellow - anchorage areas
  'HRBARE': 'rgba(0, 128, 0, 0.4)',      // Dark green - harbor areas
  'DEPCNT': 'rgba(0, 150, 0, 0.6)',      // Green - depth contours
  'LNDRGN': 'rgba(160, 82, 45, 0.8)',    // Saddle brown - land regions
  'default': 'rgba(0, 0, 0, 0.3)'        // Black - unknown
};

// Stroke colors for outlines
const STROKE_COLORS = {
  'COALNE': '#0000ff',
  'SLCONS': '#ff0000',
  'DEPARE': '#00aa00',
  'LNDARE': '#8B4513',
  'BUAARE': '#808080',
  'MORFAC': '#00ffff',
  'PONTON': '#ff8c00',
  'FLODOC': '#800080',
  'BERTHS': '#4B0082',
  'HULKES': '#FF1493',
  'ACHARE': '#cccc00',
  'HRBARE': '#008000',
  'DEPCNT': '#009600',
  'LNDRGN': '#A0522D',
  'default': '#000000'
};

async function extractCoastlines() {
  console.log(`\nExtracting San Diego Bay overview features...`);
  console.log(`Area: ${BOUNDS.minLat}°N to ${BOUNDS.maxLat}°N, ${BOUNDS.minLon}°W to ${BOUNDS.maxLon}°W`);
  console.log(`Coverage: ~${((BOUNDS.maxLat - BOUNDS.minLat) * 111).toFixed(1)}km × ${((BOUNDS.maxLon - BOUNDS.minLon) * 85).toFixed(1)}km`);
  
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
      tolerance: 100, // Increased tolerance for larger area
      mergeConnected: true
    },
    classification: {
      separateByType: true,
      includeMetadata: true
    },
    limit: 500 // Increased limit for larger area
  };
  
  try {
    const result = await extractCoastlinesHandler(args);
    
    if (result.error) {
      console.error('Error extracting coastlines:', result.error);
      return null;
    }
    
    // Log statistics
    console.log(`\nExtracted ${result.features.length} coastline features`);
    
    if (result.metadata?.sources) {
      console.log('\nFeature source breakdown:');
      Object.entries(result.metadata.sources).forEach(([source, data]) => {
        console.log(`  ${source}: ${data.count} features, ${(data.totalLength_m / 1000).toFixed(2)} km`);
      });
    }
    
    // Count features by type
    const featuresByType = {};
    result.features.forEach(feature => {
      const sourceFeature = feature.properties?.sourceFeatures?.[0] || 'unknown';
      featuresByType[sourceFeature] = (featuresByType[sourceFeature] || 0) + 1;
    });
    
    console.log('\nFeatures by type:');
    Object.entries(featuresByType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} features`);
    });
    
    return result;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function createSanDiegoBayVisualization(data) {
  console.log('\nCreating San Diego Bay overview visualization...');
  
  const width = 1600;  // Larger canvas for bigger area
  const height = 1200;
  
  // Create HTML content
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>San Diego Bay Overview - Navigation Features</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      background-color: #f0f0f0;
    }
    h1 {
      text-align: center;
      color: #333;
      margin-bottom: 10px;
    }
    .subtitle {
      text-align: center;
      color: #666;
      margin-bottom: 20px;
      font-style: italic;
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
    .info-section {
      display: flex;
      gap: 20px;
      max-width: 1600px;
      margin: 0 auto;
    }
    .legend, .stats {
      background-color: white;
      padding: 15px;
      border: 1px solid #ddd;
      flex: 1;
    }
    .legend h3, .stats h3 {
      margin-top: 0;
    }
    .legend-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin: 3px 0;
    }
    .legend-color {
      width: 25px;
      height: 18px;
      margin-right: 8px;
      border: 1px solid #333;
    }
    .coverage-info {
      background-color: white;
      padding: 15px;
      border: 1px solid #ddd;
      margin-top: 20px;
      max-width: 1600px;
      margin-left: auto;
      margin-right: auto;
    }
    .coordinates {
      font-family: monospace;
      background-color: #f5f5f5;
      padding: 2px 4px;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <h1>San Diego Bay Overview - Navigation Features</h1>
  <div class="subtitle">Comprehensive view including Point Loma and northern San Diego Bay</div>
  
  <div class="container">
    <canvas id="chart" class="visualization" width="${width}" height="${height}"></canvas>
  </div>
  
  <div class="coverage-info">
    <h3>Coverage Area</h3>
    <p><strong>Chart:</strong> US5CA72M (San Diego Bay)</p>
    <p><strong>Coordinates:</strong> 
      <span class="coordinates">${BOUNDS.minLat}°N to ${BOUNDS.maxLat}°N</span>, 
      <span class="coordinates">${BOUNDS.minLon}°W to ${BOUNDS.maxLon}°W</span>
    </p>
    <p><strong>Approximate Size:</strong> ${((BOUNDS.maxLat - BOUNDS.minLat) * 111).toFixed(1)}km × ${((BOUNDS.maxLon - BOUNDS.minLon) * 85).toFixed(1)}km</p>
    <p><strong>Includes:</strong> Point Loma peninsula, Shelter Island, Harbor Island, Coronado, Imperial Beach area, Naval facilities, commercial ports</p>
  </div>
  
  <div class="info-section">
    <div class="stats">
      <h3>Feature Statistics</h3>
      <p><strong>Total features:</strong> ${data.features.length}</p>
      <p><strong>Total length:</strong> ${(data.metadata?.processingStats?.totalLength_m / 1000).toFixed(2)} km</p>
      <br>
      <h4>Source Breakdown:</h4>
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
            <span>${feature}</span>
          </div>
        `;
        }).join('')}
      </div>
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
      
      // Clear canvas with ocean blue background
      ctx.fillStyle = '#4682b4';
      ctx.fillRect(0, 0, ${width}, ${height});
      
      // Draw coordinate grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.7;
      
      // Latitude lines every 0.02 degrees (~2.2km)
      for (let lat = Math.ceil(bounds.minLat * 50) / 50; lat <= bounds.maxLat; lat += 0.02) {
        const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * ${height};
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(${width}, y);
        ctx.stroke();
      }
      
      // Longitude lines every 0.02 degrees (~1.7km)
      for (let lon = Math.ceil(bounds.minLon * 50) / 50; lon <= bounds.maxLon; lon += 0.02) {
        const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * ${width};
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ${height});
        ctx.stroke();
      }
      
      ctx.globalAlpha = 1.0;
      
      // Sort features for proper layering
      const sortedFeatures = [...data.features].sort((a, b) => {
        const layerOrder = ['DEPARE', 'LNDARE', 'BUAARE', 'HRBARE', 'ACHARE', 'DEPCNT', 'COALNE', 'SLCONS', 'MORFAC', 'PONTON', 'FLODOC', 'BERTHS'];
        const aType = a.properties?.sourceFeatures?.[0] || 'default';
        const bType = b.properties?.sourceFeatures?.[0] || 'default';
        const aIndex = layerOrder.indexOf(aType);
        const bIndex = layerOrder.indexOf(bType);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });
      
      // Draw features
      sortedFeatures.forEach(feature => {
        if (feature.geometry.type === 'LineString') {
          const coords = feature.geometry.coordinates;
          const sourceFeature = feature.properties?.sourceFeatures?.[0] || 'default';
          const fillColor = fillColors[sourceFeature] || fillColors.default;
          const strokeColor = strokeColors[sourceFeature] || strokeColors.default;
          
          // Adjust line width based on feature type
          let lineWidth = 1;
          if (sourceFeature === 'COALNE') lineWidth = 2;
          else if (sourceFeature === 'PONTON') lineWidth = 2;
          else if (sourceFeature === 'SLCONS') lineWidth = 1.5;
          
          ctx.fillStyle = fillColor;
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = lineWidth;
          
          ctx.beginPath();
          coords.forEach((coord, index) => {
            const { x, y } = toCanvas(coord[0], coord[1]);
            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          
          // Close and fill for area features
          if (['LNDARE', 'BUAARE', 'DEPARE', 'HRBARE', 'ACHARE'].includes(sourceFeature)) {
            ctx.closePath();
            ctx.fill();
          }
          
          ctx.stroke();
        }
      });
      
      // Mark San Diego Bay center
      const center = { lat: ${SAN_DIEGO_BAY_LAT}, lon: ${SAN_DIEGO_BAY_LON} };
      const { x, y } = toCanvas(center.lon, center.lat);
      
      // White background circle
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fill();
      
      // Blue marker
      ctx.fillStyle = '#0066cc';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
      
      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Arial';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText('San Diego Bay', x + 12, y - 5);
      ctx.fillText('San Diego Bay', x + 12, y - 5);
    }
    
    // Draw the visualization
    drawFeatures();
  </script>
</body>
</html>
  `;
  
  // Save HTML file
  const htmlPath = path.join(__dirname, 'san-diego-bay-render.html');
  await fs.writeFile(htmlPath, html);
  console.log(`Visualization saved to: ${htmlPath}`);
  
  // Also save the data
  await fs.writeFile(
    path.join(__dirname, 'san-diego-bay-data.json'),
    JSON.stringify(data, null, 2)
  );
  
  return htmlPath;
}

async function main() {
  console.log('=== San Diego Bay Overview Render Test ===');
  console.log('Location: San Diego Bay including Point Loma');
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
    
    // Extract coastlines for the expanded area
    console.log('2. Extracting San Diego Bay features...');
    const data = await extractCoastlines();
    if (!data) {
      console.error('Failed to extract features');
      return;
    }
    
    // Create visualization
    console.log('\n3. Creating San Diego Bay overview visualization...');
    const htmlPath = await createSanDiegoBayVisualization(data);
    
    console.log('\n✓ Test completed successfully!');
    console.log('\nTo view the visualization:');
    console.log(`  open ${htmlPath}`);
    
    console.log('\n📸 Remember to take a screenshot for documentation!');
    
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
main();