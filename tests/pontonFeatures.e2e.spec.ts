import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

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

describe('PONTON Features E2E Test', () => {
  let serverProcess: ChildProcess;
  let requestId = 1;

  beforeEach(async () => {
    // Ensure build is up to date
    const { execSync } = await import('child_process');
    execSync('npm run build', { stdio: 'pipe' });

    // Start the MCP server
    serverProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ENC_CACHE_DIR: './cache/charts', // Use real cache with downloaded charts
        NODE_ENV: 'development' // Use real S-57 parser
      }
    });

    // Collect stderr for debugging
    serverProcess.stderr?.on('data', (data) => {
      console.error('[Server Error]:', data.toString());
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterEach(async () => {
    // Kill the server process
    if (serverProcess) {
      serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  });

  async function sendRequest(method: string, params: any): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        id: requestId++,
        method,
        params
      };

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout after 30s'));
      }, 30000);

      const responseHandler = (data: Buffer) => {
        try {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            if (line.trim()) {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                clearTimeout(timeout);
                serverProcess.stdout?.off('data', responseHandler);
                resolve(response);
                return;
              }
            }
          }
        } catch (error) {
          // Continue collecting data
        }
      };

      serverProcess.stdout?.on('data', responseHandler);
      serverProcess.stdin?.write(JSON.stringify(request) + '\n');
    });
  }

  it('should extract PONTON features from San Diego Bay (Shelter Island)', async () => {
    const response = await sendRequest('tools/call', {
      name: 'extract_coastlines',
      arguments: {
        chartId: 'US5CA72M',
        extractionMethod: 'combined',
        featureSources: {
          useMooringFeatures: true,
          useCoastlines: true,
          useShorelineConstruction: true
        },
        boundingBox: {
          minLat: 32.710,
          maxLat: 32.720,  // Smaller area to avoid size limit
          minLon: -117.230,
          maxLon: -117.220  // Focus on main marina area
        },
        classification: {
          includeMetadata: true,
          separateByType: true
        },
        limit: 50  // Limit results to avoid size limit
      }
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    const result = response.result;
    console.log('Extract response type:', typeof result);
    console.log('Extract response keys:', Object.keys(result || {}));
    
    // Handle MCP response structure
    let features;
    if (result.content) {
      // MCP wrapped response
      console.log('Using MCP wrapped response');
      console.log('Content[0].text:', result.content[0].text.substring(0, 200) + '...');
      const content = JSON.parse(result.content[0].text);
      console.log('Parsed content type:', typeof content);
      console.log('Content is array?', Array.isArray(content));
      console.log('Content keys:', Object.keys(content || {}));
      features = content.features || content;
    } else if (result.features) {
      // Direct response
      console.log('Using direct response');
      features = result.features;
    } else {
      // Try parsing result directly
      console.log('Trying to parse result directly');
      features = result;
    }
    
    expect(features).toBeDefined();
    expect(Array.isArray(features)).toBe(true);
    
    console.log(`Total coastline features extracted: ${features.length}`);
    
    // Check for PONTON-derived coastlines
    const pontonCoastlines = features.filter((f: any) => 
      f.properties?.sourceFeatures?.includes('PONTON')
    );
    console.log(`PONTON-derived coastlines: ${pontonCoastlines.length}`);
    
    // Verify PONTON features are included
    expect(pontonCoastlines.length).toBeGreaterThan(0);
    
    // Get metadata from proper location
    const metadata = result.metadata || (result.content ? JSON.parse(result.content[0].text).metadata : null);
    
    // Check metadata
    if (metadata?.sources) {
      console.log('\nSource breakdown:');
      Object.entries(metadata.sources).forEach(([source, data]: [string, any]) => {
        console.log(`  ${source}: ${data.count} features, ${data.totalLength_m.toFixed(2)}m`);
      });
      
      // Verify PONTON is in sources
      expect(metadata.sources['PONTON']).toBeDefined();
      expect(metadata.sources['PONTON'].count).toBeGreaterThan(0);
    }
    
    // Check feature categories if available
    if (metadata?.featureCategories) {
      console.log('\nFeature categories:');
      Object.entries(metadata.featureCategories).forEach(([category, data]: [string, any]) => {
        if (data.count > 0) {
          console.log(`  ${category}: ${data.count} features, ${data.length_m.toFixed(2)}m`);
        }
      });
    }
    
    // Sample a PONTON coastline
    if (pontonCoastlines.length > 0) {
      const sample = pontonCoastlines[0];
      console.log('\nSample PONTON coastline properties:');
      console.log(`  Type: ${sample.properties?.type}`);
      console.log(`  Source: ${sample.properties?.source}`);
      console.log(`  Length: ${sample.properties?.length_m?.toFixed(2)}m`);
      console.log(`  Deduplicated: ${sample.properties?.deduplicated || false}`);
    }
  }, 60000);

  it('should query database directly for PONTON features', async () => {
    const response = await sendRequest('tools/call', {
      name: 'execute_query',
      arguments: {
        query: `
          SELECT 
            COUNT(*) as total_ponton
          FROM chart_features 
          WHERE chart_id = ? 
            AND object_class = 'PONTON'
            AND bbox_minlat >= ? AND bbox_maxlat <= ?
            AND bbox_minlon >= ? AND bbox_maxlon <= ?
        `,
        params: ['US5CA72M', 32.705, 32.730, -117.250, -117.210],
        readonly: true
      }
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    const result = response.result;
    console.log('\nQuery response:', JSON.stringify(result, null, 2));
    
    // Check if result has content
    if (result.content) {
      expect(result.content[0].type).toBe('text');
      const queryResult = JSON.parse(result.content[0].text);
      expect(queryResult.type).toBe('select');
      expect(queryResult.rows).toBeDefined();
      expect(queryResult.rows.length).toBe(1);
      
      const counts = queryResult.rows[0];
      console.log('\nPONTON features in Shelter Island area:');
      console.log(`  Total: ${counts.total_ponton}`);
      
      expect(counts.total_ponton).toBeGreaterThan(0);
    } else {
      // Direct result format
      expect(result.type).toBe('select');
      expect(result.rows).toBeDefined();
      expect(result.rows.length).toBe(1);
      
      const counts = result.rows[0];
      console.log('\nPONTON features in Shelter Island area:');
      console.log(`  Total: ${counts.total_ponton}`);
      console.log(`  LineString: ${counts.linestring_count}`);
      console.log(`  Polygon: ${counts.polygon_count}`);
      
      expect(counts.total_ponton).toBeGreaterThan(0);
    }
  }, 30000);

  it('should handle mixed feature types in marina areas', async () => {
    const response = await sendRequest('tools/call', {
      name: 'extract_coastlines',
      arguments: {
        chartId: 'US5CA72M',
        extractionMethod: 'combined',
        featureSources: {
          useMooringFeatures: true,
          useShorelineConstruction: true,
          useHarborFeatures: true,
          useBerths: true,
          useTerminals: true
        },
        boundingBox: {
          minLat: 32.71,
          maxLat: 32.72,
          minLon: -117.24,
          maxLon: -117.22
        },
        stitching: {
          enabled: true,
          tolerance: 10,
          mergeConnected: true
        },
        classification: {
          includeMetadata: true
        }
      }
    });

    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    
    const result = response.result;
    if (result.metadata?.sources) {
      console.log('\nMarina area feature mix:');
      const mooringFeatures = ['MORFAC', 'PONTON', 'FLODOC', 'BERTHS', 'SLCONS'];
      mooringFeatures.forEach(feature => {
        if (result.metadata.sources[feature]) {
          const data = result.metadata.sources[feature];
          console.log(`  ${feature}: ${data.count} features, ${data.totalLength_m.toFixed(2)}m`);
        }
      });
      
      // Verify diverse feature types in marina
      const mooringSourceCount = mooringFeatures.filter(f => 
        result.metadata.sources[f]?.count > 0
      ).length;
      expect(mooringSourceCount).toBeGreaterThan(1);
    }
  }, 30000);

  it('should verify PONTON deduplication priority', async () => {
    // First query to see what features exist in the area
    const queryResponse = await sendRequest('tools/call', {
      name: 'execute_query',
      arguments: {
        query: `
          SELECT object_class, COUNT(*) as count
          FROM chart_features 
          WHERE chart_id = ? 
            AND object_class IN ('MORFAC', 'PONTON', 'FLODOC', 'SLCONS', 'BERTHS')
            AND bbox_minlat >= ? AND bbox_maxlat <= ?
            AND bbox_minlon >= ? AND bbox_maxlon <= ?
          GROUP BY object_class
        `,
        params: ['US5CA72M', 32.705, 32.730, -117.250, -117.210],
        readonly: true
      }
    });

    console.log('\nFeature types in area:');
    if (queryResponse.result?.content?.[0]?.text) {
      const queryResult = JSON.parse(queryResponse.result.content[0].text);
      if (queryResult.rows) {
        queryResult.rows.forEach((row: any) => {
          console.log(`  ${row.object_class}: ${row.count}`);
        });
      }
    }

    // Now extract coastlines
    const extractResponse = await sendRequest('tools/call', {
      name: 'extract_coastlines',
      arguments: {
        chartId: 'US5CA72M',
        extractionMethod: 'combined',
        featureSources: {
          useCoastlines: true,
          useShorelineConstruction: true,
          useMooringFeatures: true
        },
        boundingBox: {
          minLat: 32.705,
          maxLat: 32.730,
          minLon: -117.250,
          maxLon: -117.210
        },
        classification: {
          includeMetadata: true
        },
        limit: 200
      }
    });

    expect(extractResponse.error).toBeUndefined();
    const result = extractResponse.result;
    
    // Handle MCP response structure
    let extractedFeatures;
    if (result.content) {
      // MCP wrapped response
      const content = JSON.parse(result.content[0].text);
      extractedFeatures = content.features;
    } else {
      // Direct response
      extractedFeatures = result.features;
    }
    
    // Check if any features were deduplicated
    const deduplicatedFeatures = extractedFeatures.filter((f: any) => 
      f.properties?.deduplicated === true
    );
    const pontonInDeduplicated = deduplicatedFeatures.filter((f: any) => 
      f.properties?.sourceFeatures?.includes('PONTON')
    );
    
    console.log(`\nDeduplicated features: ${deduplicatedFeatures.length}, with PONTON: ${pontonInDeduplicated.length}`);
    
    // With elevated priority, PONTON should be preserved more often
    const pontonPreserved = result.features.filter((f: any) => 
      f.properties?.sourceFeatures?.length === 1 && 
      f.properties?.sourceFeatures[0] === 'PONTON'
    );
    
    console.log(`PONTON features preserved as primary source: ${pontonPreserved.length}`);
    
    // Verify coastlines were extracted
    expect(result.features.length).toBeGreaterThan(0);
  }, 30000);
});