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

// Bounds for Point Loma entrance and western San Diego Bay
// Focus on the critical harbor entrance area
// Point Loma tip extends south to about 32.67°N
// Western approach extends to about -117.28°W  
// Eastern boundary covers entrance channel to about -117.15°W
// Northern boundary includes approach area to about 32.73°N
const BOUNDS = {
  minLat: 32.67,   // Point Loma southern tip and approach
  maxLat: 32.73,   // Northern approach area
  minLon: -117.28, // Western Pacific approach
  maxLon: -117.15  // Harbor entrance channel
};

// Point Loma Lighthouse coordinates (historic landmark)
const POINT_LOMA_LIGHTHOUSE_LAT = 32.6722;
const POINT_LOMA_LIGHTHOUSE_LON = -117.2434;

// Harbor entrance coordinates
const HARBOR_ENTRANCE_LAT = 32.7067;
const HARBOR_ENTRANCE_LON = -117.2367;

// Color scheme optimized for harbor entrance features
const FEATURE_COLORS = {
  'COALNE': 'rgba(0, 0, 255, 0.8)',      // Strong blue - critical coastline
  'SLCONS': 'rgba(255, 0, 0, 0.8)',      // Red - constructed features
  'DEPARE': 'rgba(0, 200, 0, 0.3)',      // Light green - depth areas
  'DEPCNT': 'rgba(0, 150, 0, 0.7)',      // Darker green - depth contours
  'LNDARE': 'rgba(139, 69, 19, 0.9)',    // Brown - Point Loma landmass
  'BUAARE': 'rgba(128, 128, 128, 0.8)',  // Gray - built-up areas
  'MORFAC': 'rgba(0, 255, 255, 0.8)',    // Cyan - mooring facilities
  'PONTON': 'rgba(255, 165, 0, 0.9)',    // Orange - pontoons
  'FLODOC': 'rgba(128, 0, 128, 0.8)',    // Purple - floating docks
  'BERTHS': 'rgba(75, 0, 130, 0.8)',     // Indigo - berths
  'ACHARE': 'rgba(255, 255, 0, 0.4)',    // Yellow - anchorage areas
  'HRBARE': 'rgba(0, 128, 0, 0.5)',      // Dark green - harbor areas
  'FAIRWY': 'rgba(0, 255, 0, 0.6)',      // Bright green - fairways/channels
  'NAVLNE': 'rgba(255, 0, 255, 0.7)',    // Magenta - navigation lines
  'DWRTPT': 'rgba(0, 128, 255, 0.6)',    // Light blue - deep water routes
  'LNDRGN': 'rgba(160, 82, 45, 0.8)',    // Saddle brown - land regions
  'GATCON': 'rgba(255, 69, 0, 0.8)',     // Orange red - gate construction
  'CAUSWY': 'rgba(205, 133, 63, 0.8)',   // Peru - causeways
  'default': 'rgba(0, 0, 0, 0.3)'        // Black - unknown
};

// Stroke colors for critical navigation features
const STROKE_COLORS = {
  'COALNE': '#000080',    // Navy blue
  'SLCONS': '#ff0000',    // Red
  'DEPARE': '#00cc00',    // Green
  'DEPCNT': '#009600',    // Dark green
  'LNDARE': '#8B4513',    // Saddle brown
  'BUAARE': '#808080',    // Gray
  'MORFAC': '#00ffff',    // Cyan
  'PONTON': '#ff8c00',    // Dark orange
  'FLODOC': '#800080',    // Purple
  'BERTHS': '#4B0082',    // Indigo
  'ACHARE': '#cccc00',    // Dark yellow
  'HRBARE': '#008000',    // Green
  'FAIRWY': '#00ff00',    // Lime
  'NAVLNE': '#ff00ff',    // Magenta
  'DWRTPT': '#0080ff',    // Dodger blue
  'LNDRGN': '#A0522D',    // Saddle brown
  'GATCON': '#ff4500',    // Orange red
  'CAUSWY': '#cd853f',    // Peru
  'default': '#000000'    // Black
};

async function extractCoastlines() {
  console.log(`\nExtracting Point Loma entrance and western San Diego Bay features...`);
  console.log(`Area: ${BOUNDS.minLat}°N to ${BOUNDS.maxLat}°N, ${BOUNDS.minLon}°W to ${BOUNDS.maxLon}°W`);
  console.log(`Coverage: ~${((BOUNDS.maxLat - BOUNDS.minLat) * 111).toFixed(1)}km × ${((BOUNDS.maxLon - BOUNDS.minLon) * 85).toFixed(1)}km`);
  console.log(`Focus: Harbor entrance, Point Loma approach, and western bay channels`);
  
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
      useTerminals: true,
      // Enable additional navigation features for harbor entrance
      useDepthChannels: true,
      useRestrictedAreas: true
    },
    boundingBox: BOUNDS,
    stitching: {
      enabled: true,
      tolerance: 75, // Medium tolerance for entrance area detail
      mergeConnected: true
    },
    classification: {
      separateByType: true,
      includeMetadata: true
    },
    limit: 300 // Moderate limit for focused area
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
    
    // Look for navigation-specific features
    const navFeatures = result.features.filter(f => 
      ['FAIRWY', 'NAVLNE', 'DWRTPT', 'ACHARE'].includes(f.properties?.sourceFeatures?.[0])
    );
    console.log(`\nNavigation features (channels/routes): ${navFeatures.length}`);
    
    return result;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function createPointLomaVisualization(data) {
  console.log('\nCreating Point Loma entrance visualization...');
  
  const width = 1400;  // Wider for the entrance approach
  const height = 1000;
  
  // Create HTML content
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Point Loma Entrance - San Diego Bay Navigation</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      background-color: #f0f8ff;
    }
    h1 {
      text-align: center;
      color: #1e3a8a;
      margin-bottom: 10px;
    }
    .subtitle {
      text-align: center;
      color: #475569;
      margin-bottom: 20px;
      font-style: italic;
      font-weight: bold;
    }
    .container {
      display: flex;
      justify-content: center;
      margin-bottom: 20px;
    }
    .visualization {
      background-color: white;
      border: 3px solid #1e3a8a;
      box-shadow: 0 6px 12px rgba(0,0,0,0.15);
      border-radius: 8px;
    }
    canvas {
      display: block;
      border-radius: 5px;
    }
    .info-section {
      display: flex;
      gap: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .legend, .stats, .navigation-info {
      background-color: white;
      padding: 15px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .legend {
      flex: 2;
    }
    .stats, .navigation-info {
      flex: 1;
    }
    .legend h3, .stats h3, .navigation-info h3 {
      margin-top: 0;
      color: #1e3a8a;
    }
    .legend-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 6px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin: 2px 0;
    }
    .legend-color {
      width: 24px;
      height: 16px;
      margin-right: 8px;
      border: 1px solid #1e3a8a;
      border-radius: 2px;
    }
    .coverage-info {
      background-color: white;
      padding: 15px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      margin-top: 20px;
      max-width: 1400px;
      margin-left: auto;
      margin-right: auto;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .coverage-info h3 {
      color: #1e3a8a;
      margin-top: 0;
    }
    .coordinates {
      font-family: 'Courier New', monospace;
      background-color: #f1f5f9;
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid #cbd5e1;
    }
    .highlight {
      color: #dc2626;
      font-weight: bold;
    }
    .nav-feature {
      color: #059669;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <h1>Point Loma Entrance - San Diego Bay Navigation</h1>
  <div class="subtitle">Harbor Entrance, Channel Approaches, and Western Bay Navigation Features</div>
  
  <div class="container">
    <canvas id="chart" class="visualization" width="${width}" height="${height}"></canvas>
  </div>
  
  <div class="coverage-info">
    <h3>Coverage Area - Critical Harbor Entrance Zone</h3>
    <p><strong>Chart:</strong> US5CA72M (San Diego Bay)</p>
    <p><strong>Coordinates:</strong> 
      <span class="coordinates">${BOUNDS.minLat}°N to ${BOUNDS.maxLat}°N</span>, 
      <span class="coordinates">${BOUNDS.minLon}°W to ${BOUNDS.maxLon}°W</span>
    </p>
    <p><strong>Approximate Size:</strong> ${((BOUNDS.maxLat - BOUNDS.minLat) * 111).toFixed(1)}km × ${((BOUNDS.maxLon - BOUNDS.minLon) * 85).toFixed(1)}km</p>
    <p><strong>Key Areas:</strong> Point Loma Peninsula, Harbor Entrance Channel, Western Approach, Cabrillo National Monument, Naval Base Point Loma</p>
    <p><strong>Navigation Focus:</strong> <span class="highlight">Primary entrance to San Diego Bay</span> - critical for all vessel traffic</p>
  </div>
  
  <div class="info-section">
    <div class="stats">
      <h3>Feature Statistics</h3>
      <p><strong>Total features:</strong> ${data.features.length}</p>
      <p><strong>Total length:</strong> ${(data.metadata?.processingStats?.totalLength_m / 1000).toFixed(2)} km</p>
      <br>
      <h4>Source Breakdown:</h4>
      ${Object.entries(data.metadata?.sources || {}).map(([source, stats]) => {
        const isNavFeature = ['FAIRWY', 'NAVLNE', 'DWRTPT', 'ACHARE', 'HRBARE'].includes(source);
        const className = isNavFeature ? 'nav-feature' : '';
        return `<p><strong class="${className}">${source}</strong>: ${stats.count} features, ${(stats.totalLength_m / 1000).toFixed(2)} km</p>`;
      }).join('')}
    </div>
    
    <div class="navigation-info">
      <h3>Navigation Features</h3>
      <p><strong>Harbor Entrance:</strong> Primary access channel</p>
      <p><strong>Approach Areas:</strong> Western Pacific approach</p>
      <p><strong>Anchorage Zones:</strong> Designated waiting areas</p>
      <p><strong>Depth Information:</strong> Critical for safe passage</p>
      <p><strong>Point Loma:</strong> Historic lighthouse and navigation landmark</p>
      <br>
      <h4>Key Landmarks:</h4>
      <p>• Point Loma Lighthouse</p>
      <p>• Cabrillo National Monument</p>
      <p>• Naval Base Point Loma</p>
      <p>• Harbor Entrance Channel</p>
    </div>
    
    <div class="legend">
      <h3>Feature Type Legend</h3>
      <div class="legend-grid">
        ${Object.entries(FEATURE_COLORS).filter(([key]) => key !== 'default').map(([feature, color]) => {
          const strokeColor = STROKE_COLORS[feature] || STROKE_COLORS.default;
          const isNavFeature = ['FAIRWY', 'NAVLNE', 'DWRTPT', 'ACHARE', 'HRBARE'].includes(feature);
          const description = {
            'COALNE': 'Coastline',
            'SLCONS': 'Shoreline Construction', 
            'DEPARE': 'Depth Areas',
            'DEPCNT': 'Depth Contours',
            'LNDARE': 'Land Areas',
            'FAIRWY': 'Fairways/Channels',
            'NAVLNE': 'Navigation Lines',
            'DWRTPT': 'Deep Water Routes',
            'ACHARE': 'Anchorage Areas',
            'HRBARE': 'Harbor Areas',
            'PONTON': 'Pontoons',
            'MORFAC': 'Mooring Facilities'
          }[feature] || feature;
          
          return `
          <div class="legend-item">
            <div class="legend-color" style="background-color: ${color}; border-color: ${strokeColor}"></div>
            <span ${isNavFeature ? 'class="nav-feature"' : ''}>${description}</span>
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
      
      // Clear canvas with deep ocean blue background
      ctx.fillStyle = '#1e40af';
      ctx.fillRect(0, 0, ${width}, ${height});
      
      // Draw coordinate grid with navigation-style lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.8;
      
      // Latitude lines every 0.01 degrees (~1.1km)
      for (let lat = Math.ceil(bounds.minLat * 100) / 100; lat <= bounds.maxLat; lat += 0.01) {
        const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * ${height};
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(${width}, y);
        ctx.stroke();
      }
      
      // Longitude lines every 0.01 degrees (~0.85km)
      for (let lon = Math.ceil(bounds.minLon * 100) / 100; lon <= bounds.maxLon; lon += 0.01) {
        const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * ${width};
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ${height});
        ctx.stroke();
      }
      
      ctx.globalAlpha = 1.0;
      
      // Sort features for proper navigation chart layering
      const sortedFeatures = [...data.features].sort((a, b) => {
        const layerOrder = ['DEPARE', 'LNDARE', 'BUAARE', 'ACHARE', 'HRBARE', 'FAIRWY', 'NAVLNE', 'DWRTPT', 'DEPCNT', 'COALNE', 'SLCONS', 'MORFAC', 'PONTON', 'FLODOC', 'BERTHS'];
        const aType = a.properties?.sourceFeatures?.[0] || 'default';
        const bType = b.properties?.sourceFeatures?.[0] || 'default';
        const aIndex = layerOrder.indexOf(aType);
        const bIndex = layerOrder.indexOf(bType);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });
      
      // Draw features with navigation chart styling
      sortedFeatures.forEach(feature => {
        if (feature.geometry.type === 'LineString') {
          const coords = feature.geometry.coordinates;
          const sourceFeature = feature.properties?.sourceFeatures?.[0] || 'default';
          const fillColor = fillColors[sourceFeature] || fillColors.default;
          const strokeColor = strokeColors[sourceFeature] || strokeColors.default;
          
          // Adjust line width for navigation importance
          let lineWidth = 1;
          if (sourceFeature === 'COALNE') lineWidth = 3;
          else if (['FAIRWY', 'NAVLNE', 'DWRTPT'].includes(sourceFeature)) lineWidth = 2.5;
          else if (sourceFeature === 'DEPCNT') lineWidth = 1.5;
          else if (sourceFeature === 'PONTON') lineWidth = 2;
          else if (sourceFeature === 'SLCONS') lineWidth = 2;
          
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
          if (['LNDARE', 'BUAARE', 'DEPARE', 'ACHARE', 'HRBARE', 'FAIRWY'].includes(sourceFeature)) {
            ctx.closePath();
            ctx.fill();
          }
          
          ctx.stroke();
        }
      });
      
      // Mark Point Loma Lighthouse
      const lighthouse = { lat: ${POINT_LOMA_LIGHTHOUSE_LAT}, lon: ${POINT_LOMA_LIGHTHOUSE_LON} };
      const { x: lx, y: ly } = toCanvas(lighthouse.lon, lighthouse.lat);
      
      // Lighthouse symbol
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(lx, ly, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Light beam effect
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(lx - 15, ly);
      ctx.lineTo(lx + 15, ly);
      ctx.moveTo(lx, ly - 15);
      ctx.lineTo(lx, ly + 15);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
      
      // Lighthouse label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Arial';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText('Point Loma Lighthouse', lx + 10, ly - 10);
      ctx.fillText('Point Loma Lighthouse', lx + 10, ly - 10);
      
      // Mark Harbor Entrance
      const entrance = { lat: ${HARBOR_ENTRANCE_LAT}, lon: ${HARBOR_ENTRANCE_LON} };
      const { x: ex, y: ey } = toCanvas(entrance.lon, entrance.lat);
      
      // Harbor entrance marker
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(ex, ey, 5, 0, 2 * Math.PI);
      ctx.fill();
      
      // Entrance label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Arial';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText('Harbor Entrance', ex + 8, ey + 15);
      ctx.fillText('Harbor Entrance', ex + 8, ey + 15);
    }
    
    // Draw the visualization
    drawFeatures();
  </script>
</body>
</html>
  `;
  
  // Save HTML file
  const htmlPath = path.join(__dirname, 'point-loma-entrance-render.html');
  await fs.writeFile(htmlPath, html);
  console.log(`Visualization saved to: ${htmlPath}`);
  
  // Also save the data
  await fs.writeFile(
    path.join(__dirname, 'point-loma-entrance-data.json'),
    JSON.stringify(data, null, 2)
  );
  
  return htmlPath;
}

async function main() {
  console.log('=== Point Loma Entrance Render Test ===');
  console.log('Location: Point Loma Entrance and Western San Diego Bay');
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
    
    // Extract coastlines for the entrance area
    console.log('2. Extracting Point Loma entrance features...');
    const data = await extractCoastlines();
    if (!data) {
      console.error('Failed to extract features');
      return;
    }
    
    // Create visualization
    console.log('\n3. Creating Point Loma entrance visualization...');
    const htmlPath = await createPointLomaVisualization(data);
    
    console.log('\n✓ Test completed successfully!');
    console.log('\nTo view the visualization:');
    console.log(`  open ${htmlPath}`);
    
    console.log('\n📸 Remember to take a screenshot using Playwright MCP!');
    console.log('   This shows the critical harbor entrance for San Diego Bay');
    
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
main();