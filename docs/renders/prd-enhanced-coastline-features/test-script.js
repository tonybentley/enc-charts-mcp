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

// Shelter Island coordinates (from COASTLINE_EXTRACTION_PROJECT.md)
const SHELTER_ISLAND_LAT = 32.714935;
const SHELTER_ISLAND_LON = -117.228975;

// Bounding box for San Diego Bay area around Shelter Island
const BOUNDS = {
  minLat: 32.70,
  maxLat: 32.73,
  minLon: -117.25,
  maxLon: -117.20
};

async function testEnhancedCoastlineFeatures() {
  console.log('Testing PRD Enhanced Coastline Features implementation...');
  console.log('Location: Shelter Island, San Diego Bay');
  console.log('Chart: US5CA72M');
  console.log('Coordinates: 32.714935, -117.228975\n');
  
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
  
  // Test configuration with all enhanced features enabled
  const coastlineArgs = {
    chartId: 'US5CA72M',  // San Diego Bay chart
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
      
      // Infrastructure features 
      useBridges: true,
      usePylons: true,
      useCranes: true,
      useConveyors: true,
      
      // Port features 
      useBerths: true,
      useTerminals: true,
      useDryDocks: true,
      useLockBasins: true,
      
      // Boundary features 
      useFenceLines: true,
      useRailways: true,
      useDumpingGrounds: true,
      
      // Enhanced features from PRD (NEW)
      useTidalFeatures: true,
      useNaturalBoundaries: true,
      useAdditionalInfrastructure: true,
      useAdministrativeBoundaries: true,
      useSpecializedPortFeatures: true,
      useDepthChannels: true,
      useRestrictedAreas: true,
      useValidationFeatures: true,
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

  console.log('2. Extracting coastlines with all enhanced features enabled...');
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
    path.join(__dirname, 'enhanced-coastlines-data.json'), 
    JSON.stringify(coastlineData, null, 2)
  );

  // Display feature source breakdown
  console.log('\n=== Enhanced Feature Source Analysis ===');
  const sources = coastlineData.metadata?.sources || {};
  console.log('Feature sources found:');
  Object.entries(sources).forEach(([source, data]) => {
    console.log(`  ${source}: ${data.count} features, ${(data.totalLength_m / 1000).toFixed(2)} km`);
    if (data.category) {
      console.log(`    Category: ${data.category}`);
    }
    if (data.averageProximityToWater_m !== undefined) {
      console.log(`    Avg proximity to water: ${data.averageProximityToWater_m.toFixed(1)}m`);
    }
  });

  // Check for enhanced feature categories
  if (coastlineData.metadata?.featureCategories) {
    console.log('\n=== Enhanced Feature Category Summary ===');
    Object.entries(coastlineData.metadata.featureCategories).forEach(([category, stats]) => {
      if (stats.count > 0) {
        console.log(`${category}: ${stats.count} features, ${(stats.length_m / 1000).toFixed(2)} km`);
      }
    });
  }

  // Check for new enhanced features specifically
  console.log('\n=== Enhanced Features Detection ===');
  const enhancedFeatureTypes = [
    // Tidal features
    'DEPARE_TIDAL', 'TIDEWY', 'SWPARE', 'VEGATN',
    // Natural boundaries
    'SBDARE', 'SNDWAV', 'UNSARE', 'ICEARE',
    // Additional infrastructure
    'OFSPLF', 'PIPARE', 'PIPSOL', 'CBLARE', 'CBLSUB',
    // Administrative boundaries
    'COSARE', 'MIPARE', 'ADMARE', 'CONZNE',
    // Specialized port features
    'HRBFAC', 'SMCFAC', 'CHKPNT', 'FORSTC',
    // Depth channels
    'DWRTCL', 'DWRTPT',
    // Restricted areas
    'CTNARE', 'RESARE',
    // Validation features
    'CURENT', 'WATTUR', 'STSLNE'
  ];
  
  let enhancedFeaturesFound = false;
  enhancedFeatureTypes.forEach(featureType => {
    if (sources[featureType]) {
      console.log(`✓ ${featureType}: ${sources[featureType].count} features found`);
      enhancedFeaturesFound = true;
    }
  });

  if (!enhancedFeaturesFound) {
    console.log('Note: No enhanced feature types found in this chart. This is normal if the chart doesn\'t contain these specialized features.');
  }

  // Validate individual features for enhanced properties
  console.log('\n=== Enhanced Properties Validation ===');
  let tidalFeaturesCount = 0;
  let vegetationFeaturesCount = 0;
  let infrastructureFeaturesCount = 0;
  let administrativeFeaturesCount = 0;

  coastlineData.features.forEach((feature, index) => {
    const sources = feature.properties?.sourceFeatures || [];
    
    // Check for tidal features
    if (sources.includes('DEPARE_TIDAL') && feature.properties.tidalLevel !== undefined) {
      if (tidalFeaturesCount < 3) { // Show first 3
        console.log(`Feature ${index}: Tidal DEPARE at level ${feature.properties.tidalLevel}m`);
      }
      tidalFeaturesCount++;
    }
    
    // Check for vegetation
    if (sources.includes('VEGATN') && feature.properties.vegetationType) {
      if (vegetationFeaturesCount < 3) {
        console.log(`Feature ${index}: Vegetation type ${feature.properties.vegetationType}`);
      }
      vegetationFeaturesCount++;
    }

    // Check for infrastructure
    if (feature.properties.infrastructureType) {
      if (infrastructureFeaturesCount < 3) {
        console.log(`Feature ${index}: Infrastructure type ${feature.properties.infrastructureType}`);
      }
      infrastructureFeaturesCount++;
    }

    // Check for administrative
    if (feature.properties.administrativeType) {
      if (administrativeFeaturesCount < 3) {
        console.log(`Feature ${index}: Administrative type ${feature.properties.administrativeType}`);
      }
      administrativeFeaturesCount++;
    }
  });

  console.log(`Total enhanced features with special properties:`);
  console.log(`  Tidal features: ${tidalFeaturesCount}`);
  console.log(`  Vegetation features: ${vegetationFeaturesCount}`);
  console.log(`  Infrastructure features: ${infrastructureFeaturesCount}`);
  console.log(`  Administrative features: ${administrativeFeaturesCount}`);

  // Get water/land classification for visualization
  let classificationData = null;
  try {
    console.log('\n3. Getting water/land classification...');
    const classificationArgs = {
      chartId: 'US5CA72M',
      boundingBox: BOUNDS,
      includeFeatures: {
        waterPolygons: true,
        landPolygons: true,
        coastlines: true
      }
    };

    const classificationResult = await getWaterLandClassificationHandler(classificationArgs);
    classificationData = typeof classificationResult === 'string' 
      ? JSON.parse(classificationResult) 
      : classificationResult;
  } catch (error) {
    console.log('Note: Could not get water/land classification, continuing without it');
    console.error('Error getting water/land classification:', error.message);
    classificationData = { features: [] };
  }

  // Create enhanced visualization
  await createEnhancedVisualization(coastlineData, classificationData);

  // Display overall statistics
  console.log('\n=== Enhanced Extraction Statistics ===');
  const stats = coastlineData.metadata?.processingStats || {};
  console.log(`Total segments extracted: ${stats.totalSegments || 0}`);
  console.log(`Stitched segments: ${stats.stitchedSegments || 0}`);
  console.log(`Total length: ${((stats.totalLength_m || 0) / 1000).toFixed(2)} km`);
  console.log(`Gaps detected: ${stats.gaps || 0}`);
  if (stats.largestGap_m) {
    console.log(`Largest gap: ${stats.largestGap_m.toFixed(1)} m`);
  }
  
  console.log('\n✓ Enhanced coastline features test completed successfully!');
  console.log('Check enhanced-coastlines-data.json for raw data');
  console.log('Check enhanced-coastlines-render.html for visual comparison');
}

async function createEnhancedVisualization(coastlineData, classificationData) {
  const html = `<!DOCTYPE html>
<html>
<head>
    <title>Enhanced Coastline Features - San Diego Bay</title>
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background-color: #f0f0f0;
            color: #333;
        }
        .container {
            max-width: 1200px;
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
        .canvas-wrapper {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        canvas {
            width: 100%;
            border: 1px solid #ddd;
            display: block;
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
            margin-bottom: 20px;
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
        .metadata {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metadata h3 { margin-top: 0; }
        .metadata-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-top: 15px;
        }
        .metadata-section {
            background: #f8f8f8;
            padding: 15px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Enhanced Coastline Features Test</h1>
            <div class="subtitle">
                Chart: US5CA72M | Location: San Diego Bay (Shelter Island) | 
                Coordinates: ${SHELTER_ISLAND_LAT}, ${SHELTER_ISLAND_LON}
            </div>
        </div>
        
        <div class="canvas-wrapper">
            <div class="title">Enhanced Coastline Extraction with 30+ S-57 Feature Types</div>
            <canvas id="canvas" width="1000" height="800"></canvas>
            <div class="stats" id="stats"></div>
        </div>
        
        <div class="legend">
            <div class="legend-title">Enhanced Feature Types</div>
            
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
                    <span>Other original features</span>
                </div>
            </div>
            
            <div class="legend-section">
                <strong>Enhanced Features:</strong><br>
                <div class="legend-item">
                    <span class="legend-color" style="background: #ff6600;"></span>
                    <span>Tidal Features (DEPARE_TIDAL, TIDEWY, SWPARE, VEGATN)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: #8B4513;"></span>
                    <span>Natural Boundaries (SBDARE, SNDWAV, UNSARE, ICEARE)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: #FF1493;"></span>
                    <span>Infrastructure (OFSPLF, PIPARE, BRIDGE, etc.)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: #DC143C;"></span>
                    <span>Administrative (COSARE, MIPARE, ADMARE, CONZNE)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: #4B0082;"></span>
                    <span>Port Features (HRBFAC, SMCFAC, CHKPNT, FORSTC)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: #1E90FF;"></span>
                    <span>Depth Channels (DWRTCL, DWRTPT)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: #FFD700;"></span>
                    <span>Restricted Areas (CTNARE, RESARE)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: #4169E1;"></span>
                    <span>Validation Features (CURENT, WATTUR, STSLNE)</span>
                </div>
            </div>
        </div>
        
        <div class="metadata">
            <h3>Enhanced Metadata</h3>
            <div class="metadata-grid">
                <div class="metadata-section" id="featureCategories"></div>
                <div class="metadata-section" id="sourcesBreakdown"></div>
                <div class="metadata-section" id="processingStats"></div>
            </div>
        </div>
    </div>
    
    <script>
        const coastlineData = ${JSON.stringify(coastlineData)};
        const classificationData = ${JSON.stringify(classificationData)};
        
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
        
        // Enhanced feature type to color mapping
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
            'BERTHS': '#4B0082',  // Indigo
            'TERMNL': '#9370DB',  // Medium purple
            'DRYDOC': '#8A2BE2',  // Blue violet
            'LOKBSN': '#9932CC',  // Dark orchid
            'FNCLNE': '#D2691E',  // Chocolate
            'RAILWY': '#A0522D',  // Sienna
            'DMPGRD': '#8B7355',  // Burlywood
            
            // Enhanced features
            'DEPARE_TIDAL': '#ff6600', // Orange - tidal zones
            'TIDEWY': '#ff9933',       // Light orange
            'SWPARE': '#228B22',       // Forest green
            'VEGATN': '#006400',       // Dark green - vegetation
            'SBDARE': '#8B4513',       // Brown - seabed
            'SNDWAV': '#F4A460',       // Sandy brown
            'UNSARE': '#DEB887',       // Burlywood
            'ICEARE': '#E0FFFF',       // Light cyan
            'OFSPLF': '#FF1493',       // Deep pink - platforms
            'PIPARE': '#DC143C',       // Crimson
            'PIPSOL': '#B22222',       // Fire brick
            'CBLARE': '#8B0000',       // Dark red
            'CBLSUB': '#800000',       // Maroon
            'COSARE': '#00CED1',       // Dark turquoise
            'MIPARE': '#DC143C',       // Crimson - military
            'ADMARE': '#4682B4',       // Steel blue
            'CONZNE': '#5F9EA0',       // Cadet blue
            'HRBFAC': '#4B0082',       // Indigo
            'SMCFAC': '#9370DB',       // Medium purple
            'CHKPNT': '#FF4500',       // Orange red
            'FORSTC': '#B22222',       // Fire brick
            'DWRTCL': '#1E90FF',       // Dodger blue
            'DWRTPT': '#00BFFF',       // Deep sky blue
            'CTNARE': '#FFD700',       // Gold
            'RESARE': '#FFA500',       // Orange
            'CURENT': '#4169E1',       // Royal blue
            'WATTUR': '#6495ED',       // Cornflower blue
            'STSLNE': '#7B68EE',       // Medium slate blue
            
            'default': '#666666'       // Gray
        };
        
        function getFeatureColor(feature) {
            const sources = feature.properties?.sourceFeatures || [];
            const primarySource = sources[0] || 'default';
            return featureColors[primarySource] || featureColors.default;
        }
        
        function renderCanvas() {
            const canvas = document.getElementById('canvas');
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
            
            // Draw water polygons
            if (classificationData.features) {
                classificationData.features
                    .filter(f => f.properties?.classification === 'water')
                    .forEach(feature => {
                        ctx.fillStyle = 'rgba(128, 212, 240, 0.6)';
                        drawPolygon(ctx, feature, toCanvas);
                    });
                
                // Draw land polygons
                classificationData.features
                    .filter(f => f.properties?.classification === 'land')
                    .forEach(feature => {
                        ctx.fillStyle = 'rgba(144, 238, 144, 0.8)';
                        drawPolygon(ctx, feature, toCanvas);
                    });
            }
            
            // Draw coastlines with colors based on source
            ctx.lineWidth = 2;
            coastlineData.features.forEach(feature => {
                if (feature.geometry?.type === 'LineString') {
                    ctx.strokeStyle = getFeatureColor(feature);
                    ctx.beginPath();
                    feature.geometry.coordinates.forEach((coord, i) => {
                        const { x, y } = toCanvas(coord[0], coord[1]);
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    });
                    ctx.stroke();
                }
            });
            
            // Mark Shelter Island location
            const shelterPos = toCanvas(shelterIsland.lon, shelterIsland.lat);
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(shelterPos.x, shelterPos.y, 8, 0, 2 * Math.PI);
            ctx.fill();
            
            // Add label
            ctx.fillStyle = '#ff0000';
            ctx.font = '14px Arial';
            ctx.fillText('Shelter Island', shelterPos.x + 12, shelterPos.y - 8);
            
            // Calculate and display statistics
            const stats = calculateStats(coastlineData.features);
            const statsEl = document.getElementById('stats');
            statsEl.innerHTML = \`
                Features: \${stats.count}<br>
                Total Length: \${stats.totalLength.toFixed(2)} km<br>
                Enhanced Feature Types: \${stats.enhancedTypes.length}<br>
                Feature Sources: \${stats.allTypes.join(', ')}
            \`;
        }
        
        function drawPolygon(ctx, feature, toCanvas) {
            if (feature.geometry?.type === 'Polygon') {
                feature.geometry.coordinates.forEach(ring => {
                    ctx.beginPath();
                    ring.forEach((coord, i) => {
                        const { x, y } = toCanvas(coord[0], coord[1]);
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
            const enhancedTypes = new Set();
            let totalLength = 0;
            
            // Enhanced feature types
            const enhancedFeatureList = [
                'DEPARE_TIDAL', 'TIDEWY', 'SWPARE', 'VEGATN',
                'SBDARE', 'SNDWAV', 'UNSARE', 'ICEARE',
                'OFSPLF', 'PIPARE', 'PIPSOL', 'CBLARE', 'CBLSUB',
                'COSARE', 'MIPARE', 'ADMARE', 'CONZNE',
                'HRBFAC', 'SMCFAC', 'CHKPNT', 'FORSTC',
                'DWRTCL', 'DWRTPT', 'CTNARE', 'RESARE',
                'CURENT', 'WATTUR', 'STSLNE'
            ];
            
            features.forEach(f => {
                const sources = f.properties?.sourceFeatures || [];
                sources.forEach(s => {
                    types.add(s);
                    if (enhancedFeatureList.includes(s)) {
                        enhancedTypes.add(s);
                    }
                });
                totalLength += (f.properties?.length_m || 0) / 1000;
            });
            
            return {
                count: features.length,
                totalLength: totalLength,
                allTypes: Array.from(types).sort(),
                enhancedTypes: Array.from(enhancedTypes).sort()
            };
        }
        
        // Populate metadata sections
        function populateMetadata() {
            const metadata = coastlineData.metadata || {};
            
            // Feature categories
            if (metadata.featureCategories) {
                const categoriesEl = document.getElementById('featureCategories');
                categoriesEl.innerHTML = '<h4>Feature Categories</h4>';
                Object.entries(metadata.featureCategories).forEach(([category, stats]) => {
                    if (stats.count > 0) {
                        categoriesEl.innerHTML += \`<div><strong>\${category}:</strong> \${stats.count} features, \${(stats.length_m / 1000).toFixed(2)} km</div>\`;
                    }
                });
            }
            
            // Sources breakdown
            if (metadata.sources) {
                const sourcesEl = document.getElementById('sourcesBreakdown');
                sourcesEl.innerHTML = '<h4>Source Features</h4>';
                Object.entries(metadata.sources).forEach(([source, data]) => {
                    sourcesEl.innerHTML += \`<div><strong>\${source}:</strong> \${data.count} (\${(data.totalLength_m / 1000).toFixed(2)} km)</div>\`;
                });
            }
            
            // Processing stats
            if (metadata.processingStats) {
                const statsEl = document.getElementById('processingStats');
                const stats = metadata.processingStats;
                statsEl.innerHTML = '<h4>Processing Statistics</h4>';
                statsEl.innerHTML += \`<div><strong>Total segments:</strong> \${stats.totalSegments || 0}</div>\`;
                statsEl.innerHTML += \`<div><strong>Stitched segments:</strong> \${stats.stitchedSegments || 0}</div>\`;
                statsEl.innerHTML += \`<div><strong>Total length:</strong> \${((stats.totalLength_m || 0) / 1000).toFixed(2)} km</div>\`;
                statsEl.innerHTML += \`<div><strong>Gaps detected:</strong> \${stats.gaps || 0}</div>\`;
            }
        }
        
        // Render on load
        renderCanvas();
        populateMetadata();
        
        console.log('Enhanced coastline features test visualization loaded');
        console.log('Features:', coastlineData.features.length);
        console.log('Metadata:', coastlineData.metadata);
    </script>
</body>
</html>`;

  await fs.writeFile(path.join(__dirname, 'enhanced-coastlines-render.html'), html);
  console.log('\nCreated enhanced visualization: enhanced-coastlines-render.html');
}

// Run the test
testEnhancedCoastlineFeatures().catch(console.error);