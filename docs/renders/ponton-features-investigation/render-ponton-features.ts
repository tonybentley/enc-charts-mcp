import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractCoastlinesHandler } from '../../../src/handlers/extractCoastlines';
import { DatabaseManager } from '../../../src/database/DatabaseManager';
import { ChartRepository } from '../../../src/database/repositories/ChartRepository';
import { NavigationFeatureRepository } from '../../../src/database/repositories/NavigationFeatureRepository';
import { setDatabaseRepositories, initializeServices } from '../../../src/services/serviceInitializer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOUNDS = {
  minLat: 32.70,
  maxLat: 32.73,
  minLon: -117.25,
  maxLon: -117.20
};

const CHART_ID = 'US5CA52M';

// Color scheme from documentation
const COLORS = {
  COALNE: '#4a5568',    // Dark gray
  LNDARE: '#8b4513',    // Brown
  PONTON: '#ffa500',    // Orange
  SLCONS: '#ff6347',    // Tomato
  depthContour: '#1e40af', // Blue
  background: '#f0f8ff'    // Light blue
};

async function extractCoastlines(useMooringFeatures = false) {
  console.log(`Extracting coastlines with useMooringFeatures=${useMooringFeatures}...`);
  
  const result = await extractCoastlinesHandler({
    chartId: CHART_ID,
    boundingBox: BOUNDS,
    extractionMethod: 'combined',
    featureSources: {
      useCoastlines: true,
      useLandAreas: true,
      useShorelineConstruction: true,
      useMooringFeatures: useMooringFeatures,
      useDepthContours: false,
      useDepthAreas: false,
      useHarborFeatures: false,
      useSpecialFeatures: false
    },
    stitching: {
      enabled: false
    },
    simplification: {
      enabled: false
    },
    classification: {
      separateByType: true,
      includeMetadata: true
    }
  });

  if ('error' in result) {
    throw new Error(`Extraction failed: ${result.error}`);
  }

  console.log(`Extracted ${result.features.length} coastline features`);
  
  // Count features by source type
  const featureCounts: Record<string, number> = {};
  result.features.forEach(feature => {
    const sources = feature.properties.sourceFeatures || [];
    sources.forEach(source => {
      featureCounts[source] = (featureCounts[source] || 0) + 1;
    });
  });
  console.log('Feature counts by source:', featureCounts);
  
  // Also log metadata sources if available
  if (result.metadata?.sources) {
    console.log('Metadata sources:', result.metadata.sources);
  }
  
  return result.features;
}

function generateHTML(coastlinesNoMooring: any[], coastlinesWithMooring: any[]) {
  return `<!DOCTYPE html>
<html>
<head>
    <title>PONTON Features Investigation - Shelter Island</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        h1, h2, h3 {
            color: #333;
        }
        .comparison {
            display: flex;
            gap: 20px;
            margin: 20px 0;
        }
        .visualization {
            flex: 1;
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        canvas {
            border: 1px solid #ddd;
            display: block;
            margin: 10px auto;
        }
        .legend {
            margin: 10px 0;
            padding: 10px;
            background: #f9f9f9;
            border-radius: 4px;
        }
        .legend-item {
            display: inline-block;
            margin-right: 15px;
        }
        .legend-color {
            display: inline-block;
            width: 20px;
            height: 12px;
            margin-right: 5px;
            vertical-align: middle;
        }
        .stats {
            margin: 10px 0;
            padding: 10px;
            background: #f0f0f0;
            border-radius: 4px;
            font-family: monospace;
            font-size: 14px;
        }
        .highlight {
            color: #ffa500;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>PONTON Features Investigation - Shelter Island Marina</h1>
        <p>Comparing coastline extraction with and without mooring features (PONTON) in the Shelter Island area.</p>
        <p>Bounds: ${BOUNDS.minLat}°N to ${BOUNDS.maxLat}°N, ${BOUNDS.minLon}°W to ${BOUNDS.maxLon}°W</p>
        
        <div class="legend">
            <div class="legend-item">
                <span class="legend-color" style="background-color: ${COLORS.COALNE}"></span>
                COALNE (Coastline)
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background-color: ${COLORS.LNDARE}"></span>
                LNDARE (Land Area)
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background-color: ${COLORS.PONTON}"></span>
                PONTON (Pontoon/Floating Structure)
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background-color: ${COLORS.SLCONS}"></span>
                SLCONS (Shoreline Construction)
            </div>
        </div>
        
        <div class="comparison">
            <div class="visualization">
                <h2>Baseline (without mooring features)</h2>
                <canvas id="canvas1" width="800" height="600"></canvas>
                <div class="stats" id="stats1"></div>
            </div>
            
            <div class="visualization">
                <h2>Enhanced (with mooring features)</h2>
                <canvas id="canvas2" width="800" height="600"></canvas>
                <div class="stats" id="stats2"></div>
            </div>
        </div>
        
        <h2>Analysis</h2>
        <div id="analysis"></div>
    </div>
    
    <script>
        const coastlinesNoMooring = ${JSON.stringify(coastlinesNoMooring)};
        const coastlinesWithMooring = ${JSON.stringify(coastlinesWithMooring)};
        const bounds = ${JSON.stringify(BOUNDS)};
        const colors = ${JSON.stringify(COLORS)};
        
        function drawCoastlines(canvasId, coastlines, statsId) {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            
            // Clear canvas
            ctx.fillStyle = colors.background;
            ctx.fillRect(0, 0, width, height);
            
            // Calculate scale
            const lonRange = bounds.maxLon - bounds.minLon;
            const latRange = bounds.maxLat - bounds.minLat;
            const scaleX = width / lonRange;
            const scaleY = height / latRange;
            
            // Count features by source
            const featureCounts = {};
            
            // Draw coastlines
            coastlines.forEach(feature => {
                const sources = feature.properties.sourceFeatures || [];
                
                // Count each source type
                sources.forEach(source => {
                    featureCounts[source] = (featureCounts[source] || 0) + 1;
                });
                
                // Determine color based on source features
                let color = '#999999'; // default gray
                if (sources.includes('PONTON')) {
                    color = colors.PONTON;
                } else if (sources.includes('SLCONS')) {
                    color = colors.SLCONS;
                } else if (sources.includes('COALNE')) {
                    color = colors.COALNE;
                } else if (sources.includes('LNDARE')) {
                    color = colors.LNDARE;
                }
                
                ctx.strokeStyle = color;
                ctx.lineWidth = sources.includes('PONTON') ? 3 : 2;
                
                if (feature.geometry.type === 'LineString') {
                    ctx.beginPath();
                    feature.geometry.coordinates.forEach((coord, idx) => {
                        const x = (coord[0] - bounds.minLon) * scaleX;
                        const y = height - (coord[1] - bounds.minLat) * scaleY;
                        
                        if (idx === 0) {
                            ctx.moveTo(x, y);
                        } else {
                            ctx.lineTo(x, y);
                        }
                    });
                    ctx.stroke();
                } else if (feature.geometry.type === 'Polygon') {
                    feature.geometry.coordinates.forEach(ring => {
                        ctx.beginPath();
                        ring.forEach((coord, idx) => {
                            const x = (coord[0] - bounds.minLon) * scaleX;
                            const y = height - (coord[1] - bounds.minLat) * scaleY;
                            
                            if (idx === 0) {
                                ctx.moveTo(x, y);
                            } else {
                                ctx.lineTo(x, y);
                            }
                        });
                        ctx.closePath();
                        ctx.stroke();
                        
                        // Fill LNDARE
                        if (sources.includes('LNDARE')) {
                            ctx.fillStyle = colors.LNDARE + '30';
                            ctx.fill();
                        }
                    });
                }
            });
            
            // Update stats
            const statsEl = document.getElementById(statsId);
            let statsHTML = '<strong>Feature Counts by Source:</strong><br>';
            Object.entries(featureCounts).sort((a, b) => b[1] - a[1]).forEach(([source, count]) => {
                const className = source === 'PONTON' ? 'highlight' : '';
                statsHTML += '<span class="' + className + '">' + source + ': ' + count + '</span><br>';
            });
            statsHTML += '<br><strong>Total Features:</strong> ' + coastlines.length;
            statsEl.innerHTML = statsHTML;
            
            return featureCounts;
        }
        
        // Draw both visualizations
        const counts1 = drawCoastlines('canvas1', coastlinesNoMooring, 'stats1');
        const counts2 = drawCoastlines('canvas2', coastlinesWithMooring, 'stats2');
        
        // Analysis
        const analysisEl = document.getElementById('analysis');
        const pontonCount1 = counts1.PONTON || 0;
        const pontonCount2 = counts2.PONTON || 0;
        const pontonDiff = pontonCount2 - pontonCount1;
        
        let analysisHTML = '<p>';
        if (pontonDiff > 0) {
            analysisHTML += '<strong class="highlight">PONTON features detected!</strong> The enhanced extraction with mooring features enabled found ' + pontonCount2 + ' PONTON coastlines derived from PONTON features, compared to ' + pontonCount1 + ' in the baseline.<br><br>';
            analysisHTML += 'This demonstrates that the useMooringFeatures option successfully includes floating structures and pontoons in the coastline extraction process.';
        } else if (pontonCount2 > 0) {
            analysisHTML += '<strong>PONTON features present:</strong> Found ' + pontonCount2 + ' PONTON-derived coastlines in both extractions.<br><br>';
            analysisHTML += 'The PONTON features are being extracted regardless of the useMooringFeatures setting.';
        } else {
            analysisHTML += '<strong>No PONTON features found</strong> in this area. This might indicate:<br>';
            analysisHTML += '- The selected bounds don\\'t contain PONTON features<br>';
            analysisHTML += '- The chart data doesn\\'t include PONTON features<br>';
            analysisHTML += '- There might be an issue with feature extraction';
        }
        analysisHTML += '</p>';
        
        analysisHTML += '<h3>Feature Source Comparison</h3>';
        analysisHTML += '<table style="border-collapse: collapse; width: 100%;">';
        analysisHTML += '<tr><th style="border: 1px solid #ddd; padding: 8px;">Source Type</th>';
        analysisHTML += '<th style="border: 1px solid #ddd; padding: 8px;">Without Mooring</th>';
        analysisHTML += '<th style="border: 1px solid #ddd; padding: 8px;">With Mooring</th>';
        analysisHTML += '<th style="border: 1px solid #ddd; padding: 8px;">Difference</th></tr>';
        
        const allTypes = new Set([...Object.keys(counts1), ...Object.keys(counts2)]);
        allTypes.forEach(type => {
            const count1 = counts1[type] || 0;
            const count2 = counts2[type] || 0;
            const diff = count2 - count1;
            const highlight = type === 'PONTON' ? ' style="background-color: #fff3cd;"' : '';
            analysisHTML += '<tr' + highlight + '>';
            analysisHTML += '<td style="border: 1px solid #ddd; padding: 8px;">' + type + '</td>';
            analysisHTML += '<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">' + count1 + '</td>';
            analysisHTML += '<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">' + count2 + '</td>';
            analysisHTML += '<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">' + (diff > 0 ? '+' : '') + diff + '</td>';
            analysisHTML += '</tr>';
        });
        analysisHTML += '</table>';
        
        analysisEl.innerHTML = analysisHTML;
    </script>
</body>
</html>`;
}

async function main() {
  console.log('PONTON Features Investigation - Shelter Island Marina');
  console.log('================================================');
  console.log(`Chart: ${CHART_ID}`);
  console.log(`Bounds: ${JSON.stringify(BOUNDS)}`);
  console.log('');

  // Initialize database
  const dbPath = path.join(__dirname, '..', '..', '..', 'test-cache', 'charts.db');
  console.log(`Using database: ${dbPath}`);
  
  const dbManager = new DatabaseManager(dbPath);
  await dbManager.initialize();

  // Create repositories
  const chartRepository = new ChartRepository(dbManager);
  const featureRepository = new NavigationFeatureRepository(dbManager);

  // Set database repositories in service initializer
  setDatabaseRepositories(chartRepository, featureRepository, dbManager);

  // Initialize services
  await initializeServices();

  try {
    // Extract coastlines without mooring features
    const coastlinesNoMooring = await extractCoastlines(false);
    
    // Extract coastlines with mooring features
    const coastlinesWithMooring = await extractCoastlines(true);
    
    // Save coastline data
    const dataNoMooring = {
      bounds: BOUNDS,
      chartId: CHART_ID,
      useMooringFeatures: false,
      featureCount: coastlinesNoMooring.length,
      features: coastlinesNoMooring
    };
    
    const dataWithMooring = {
      bounds: BOUNDS,
      chartId: CHART_ID,
      useMooringFeatures: true,
      featureCount: coastlinesWithMooring.length,
      features: coastlinesWithMooring
    };
    
    fs.writeFileSync(
      path.join(__dirname, 'coastline-data-no-mooring.json'),
      JSON.stringify(dataNoMooring, null, 2)
    );
    
    fs.writeFileSync(
      path.join(__dirname, 'coastline-data-with-mooring.json'),
      JSON.stringify(dataWithMooring, null, 2)
    );
    
    // Generate HTML visualization
    const html = generateHTML(coastlinesNoMooring, coastlinesWithMooring);
    const htmlPath = path.join(__dirname, 'ponton-features-comparison.html');
    fs.writeFileSync(htmlPath, html);
    
    console.log('\nFiles created:');
    console.log('- coastline-data-no-mooring.json');
    console.log('- coastline-data-with-mooring.json');
    console.log('- ponton-features-comparison.html');
    
    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Without mooring features: ${coastlinesNoMooring.length} features`);
    console.log(`With mooring features: ${coastlinesWithMooring.length} features`);
    console.log(`Difference: ${coastlinesWithMooring.length - coastlinesNoMooring.length} features`);
    
    // Check for PONTON features
    const pontonNoMooring = coastlinesNoMooring.filter(f => 
      f.properties.sourceFeatures?.includes('PONTON')
    ).length;
    const pontonWithMooring = coastlinesWithMooring.filter(f => 
      f.properties.sourceFeatures?.includes('PONTON')
    ).length;
    console.log(`\nPONTON-derived coastlines without mooring: ${pontonNoMooring}`);
    console.log(`PONTON-derived coastlines with mooring: ${pontonWithMooring}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await dbManager.close();
  }
}

// Run the test
main().catch(console.error);