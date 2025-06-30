import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

describe('Debug Coastline Issues E2E', () => {
  let serverProcess: ChildProcess;
  let requestId = 1;

  beforeEach(async () => {
    // Build first
    console.log('Building project...');
    const { execSync } = await import('child_process');
    execSync('npm run build', { stdio: 'inherit' });

    // Start server with verbose logging
    serverProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ENC_CACHE_DIR: './cache/charts',
        NODE_ENV: 'development',
        DEBUG: 'true' // Enable debug logging if supported
      }
    });

    // Capture all server output
    let serverOutput = '';
    let serverErrors = '';

    serverProcess.stdout?.on('data', (data) => {
      serverOutput += data.toString();
      console.log('[STDOUT]:', data.toString());
    });

    serverProcess.stderr?.on('data', (data) => {
      serverErrors += data.toString();
      console.error('[STDERR]:', data.toString());
    });

    // Wait for server
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterEach(async () => {
    if (serverProcess) {
      serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  });

  const sendRequest = (method: string, params: any = {}): Promise<MCPResponse> => {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        id: requestId++,
        method,
        params
      };

      console.log('\n=== SENDING REQUEST ===');
      console.log(JSON.stringify(request, null, 2));

      let responseData = '';

      const handleData = (data: Buffer) => {
        responseData += data.toString();
        
        const lines = responseData.split('\n');
        for (const line of lines) {
          if (line.trim() && line.includes('{')) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id - 1) {
                console.log('\n=== RECEIVED RESPONSE ===');
                console.log(JSON.stringify(response, null, 2));
                serverProcess.stdout?.off('data', handleData);
                resolve(response);
                return;
              }
            } catch (error) {
              // Continue
            }
          }
        }
      };

      serverProcess.stdout?.on('data', handleData);
      serverProcess.stdin?.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        serverProcess.stdout?.off('data', handleData);
        console.error('Request timed out. Last response data:', responseData);
        reject(new Error('Request timeout'));
      }, 60000);
    });
  };

  it('should debug the exact failing request', async () => {
    // The exact request that's failing
    const response = await sendRequest('tools/call', {
      name: 'extract_coastlines',
      arguments: {
        limit: 200,
        stitching: {
          enabled: true,
          tolerance: 50,
          mergeConnected: true
        },
        boundingBox: {
          maxLat: 32.73,
          maxLon: -117.2,
          minLat: 32.7,
          minLon: -117.25
        },
        coordinates: {
          lat: 32.714935,
          lon: -117.228975
        },
        featureSources: {
          useLandAreas: true,
          useCoastlines: true,
          useDepthAreas: true,
          useHarborFeatures: true,
          useMooringFeatures: true,
          useSpecialFeatures: true,
          useShorelineConstruction: true
        },
        extractionMethod: 'combined'
      }
    });

    // Log the full response for debugging
    console.log('\n=== FULL RESPONSE OBJECT ===');
    console.log(JSON.stringify(response, null, 2));

    if (response.error) {
      console.error('\n=== ERROR DETAILS ===');
      console.error('Code:', response.error.code);
      console.error('Message:', response.error.message);
      console.error('Data:', response.error.data);
      
      // Don't fail the test, we want to see the error
      expect(response.error).toBeDefined();
    } else {
      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      console.log('\n=== PARSED RESULT ===');
      console.log('Feature count:', result.features.length);
      console.log('Metadata:', result.metadata);
    }
  });

  it('should test simplified coastline extraction', async () => {
    // Try with minimal parameters first
    const response = await sendRequest('tools/call', {
      name: 'extract_coastlines',
      arguments: {
        chartId: 'US5CA72M',
        limit: 10
      }
    });

    console.log('\n=== SIMPLE EXTRACTION RESPONSE ===');
    console.log(JSON.stringify(response, null, 2));

    if (response.error) {
      console.error('Simple extraction failed:', response.error);
    } else {
      const result = JSON.parse(response.result.content[0].text);
      console.log('Features found:', result.features.length);
      
      if (result.features.length > 0) {
        console.log('First feature:', JSON.stringify(result.features[0], null, 2));
      }
    }
  });

  it('should test water/land classification', async () => {
    const response = await sendRequest('tools/call', {
      name: 'get_water_land_classification',
      arguments: {
        chartId: 'US5CA72M',
        includeFeatures: {
          waterPolygons: true,
          landPolygons: true,
          coastlines: true
        },
        limit: 10
      }
    });

    console.log('\n=== WATER/LAND CLASSIFICATION RESPONSE ===');
    console.log(JSON.stringify(response, null, 2));

    if (response.error) {
      console.error('Classification failed:', response.error);
      
      // Check if it's the S-57 parser error
      if (response.error.message.includes('S-57')) {
        console.error('\n=== S-57 PARSER ISSUE ===');
        console.error('This suggests the Python GDAL parser is failing');
        console.error('Check if GDAL is installed: python3 -c "from osgeo import gdal"');
      }
    }
  });

  it('should test coordinate format handling', async () => {
    // Test different coordinate formats
    const formats = [
      { lat: 32.714935, lon: -117.228975 }, // Original
      { lat: 32.714935, lon: -117.228975 }, // Same but fresh object
      { latitude: 32.714935, longitude: -117.228975 }, // Different keys
    ];

    for (const coords of formats) {
      console.log(`\n=== Testing coordinate format: ${JSON.stringify(coords)} ===`);
      
      const response = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          coordinates: coords,
          limit: 5
        }
      });

      if (response.error) {
        console.error('Failed with:', response.error.message);
      } else {
        console.log('Success!');
      }
    }
  });

  it('should check feature properties in database', async () => {
    // First, let's get a chart
    const chartResponse = await sendRequest('tools/call', {
      name: 'get_chart',
      arguments: {
        chartId: 'US5CA72M',
        featureTypes: ['COALNE', 'SLCONS', 'LNDARE', 'DEPARE'],
        limit: 5
      }
    });

    if (!chartResponse.error) {
      const chartResult = JSON.parse(chartResponse.result.content[0].text);
      console.log('\n=== SAMPLE FEATURES FROM DATABASE ===');
      
      chartResult.features.forEach((feature: any, index: number) => {
        console.log(`\nFeature ${index + 1}:`);
        console.log('Type:', feature.type);
        console.log('Properties:', JSON.stringify(feature.properties, null, 2));
        console.log('Property keys:', Object.keys(feature.properties || {}));
        
        // Check for _featureType
        if (feature.properties?._featureType) {
          console.log('✓ Has _featureType:', feature.properties._featureType);
        } else {
          console.log('✗ Missing _featureType');
        }
      });
    }
  });
});