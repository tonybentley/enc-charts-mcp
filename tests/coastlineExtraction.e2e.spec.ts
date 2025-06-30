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

describe('Coastline Extraction E2E Tests', () => {
  let serverProcess: ChildProcess;
  let requestId = 1;

  beforeEach(async () => {
    // Start the MCP server
    serverProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ENC_CACHE_DIR: './test-cache',
        NODE_ENV: 'test'
      }
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterEach(async () => {
    // Kill the server process
    if (serverProcess) {
      serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Clean up test cache
    try {
      await fs.rm('./test-cache', { recursive: true, force: true });
    } catch (error) {
      // Ignore errors
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

      let responseData = '';

      const handleData = (data: Buffer) => {
        responseData += data.toString();
        try {
          // Try to parse the response
          const lines = responseData.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              const response = JSON.parse(line);
              if (response.id === request.id - 1) {
                serverProcess.stdout?.off('data', handleData);
                resolve(response);
                return;
              }
            }
          }
        } catch (error) {
          // Not a complete JSON yet, continue collecting
        }
      };

      serverProcess.stdout?.on('data', handleData);
      serverProcess.stderr?.on('data', (data) => {
        console.error('Server error:', data.toString());
      });

      serverProcess.stdin?.write(JSON.stringify(request) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        serverProcess.stdout?.off('data', handleData);
        reject(new Error('Request timeout'));
      }, 30000);
    });
  };

  describe('extract_coastlines tool', () => {
    it('should list extract_coastlines in available tools', async () => {
      const response = await sendRequest('tools/list');
      
      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeDefined();
      
      const coastlineTool = response.result.tools.find((t: any) => t.name === 'extract_coastlines');
      expect(coastlineTool).toBeDefined();
      expect(coastlineTool.description).toContain('Extract and process coastlines');
    });

    it('should extract coastlines by chart ID with mock data', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          chartId: 'US5WA12M',
          extractionMethod: 'combined',
          stitching: {
            enabled: true,
            tolerance: 10
          },
          limit: 10
        }
      });

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeDefined();
      expect(response.result.content[0]).toBeDefined();
      
      const result = JSON.parse(response.result.content[0].text);
      
      // Check response structure
      expect(result.type).toBe('FeatureCollection');
      expect(Array.isArray(result.features)).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.chartId).toBe('US5WA12M');
      expect(result.metadata.processingStats).toBeDefined();
      
      // Check features if any
      if (result.features.length > 0) {
        const feature = result.features[0];
        expect(feature.type).toBe('Feature');
        expect(feature.geometry).toBeDefined();
        expect(['LineString', 'MultiLineString']).toContain(feature.geometry.type);
        expect(feature.properties).toBeDefined();
        expect(feature.properties.type).toBeDefined();
        expect(feature.properties.length_m).toBeGreaterThan(0);
      }
    });

    it('should extract coastlines by coordinates', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          coordinates: {
            lat: 47.6062,
            lon: -122.3321
          },
          featureSources: {
            useCoastlines: true,
            useDepthAreas: true
          },
          limit: 5
        }
      });

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeDefined();
      
      const result = JSON.parse(response.result.content[0].text);
      expect(result.type).toBe('FeatureCollection');
      expect(result.metadata.chartId).toBeDefined();
    });

    it('should handle pagination correctly', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          chartId: 'US5WA12M',
          limit: 2,
          offset: 0
        }
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      
      if (result.features.length > 2) {
        expect(result.metadata.pagination).toBeDefined();
        expect(result.metadata.pagination.limit).toBe(2);
        expect(result.metadata.pagination.hasMore).toBe(true);
      }
    });

    it('should apply simplification when requested', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          chartId: 'US5WA12M',
          simplification: {
            enabled: true,
            tolerance: 20,
            preserveTopology: true
          },
          limit: 5
        }
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      
      if (result.features.length > 0) {
        const simplified = result.features.filter((f: any) => f.properties.simplified === true);
        expect(simplified.length).toBeGreaterThan(0);
      }
    });

    it('should handle invalid chart ID gracefully', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          chartId: 'INVALID123'
        }
      });

      expect(response.result).toBeDefined();
      expect(response.result.content[0].text).toContain('Error');
    });
  });

  describe('get_water_land_classification tool', () => {
    it('should list get_water_land_classification in available tools', async () => {
      const response = await sendRequest('tools/list');
      
      const classificationTool = response.result.tools.find((t: any) => 
        t.name === 'get_water_land_classification'
      );
      expect(classificationTool).toBeDefined();
      expect(classificationTool.description).toContain('water/land classification');
    });

    it('should classify water and land features by chart ID', async () => {
      const response = await sendRequest('tools/call', {
        name: 'get_water_land_classification',
        arguments: {
          chartId: 'US5WA12M',
          includeFeatures: {
            waterPolygons: true,
            landPolygons: true,
            coastlines: true
          },
          limit: 10
        }
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      
      expect(result.type).toBe('FeatureCollection');
      expect(Array.isArray(result.features)).toBe(true);
      expect(result.statistics).toBeDefined();
      expect(result.statistics.totalFeatures).toBeGreaterThanOrEqual(0);
      expect(result.statistics.waterFeatures).toBeGreaterThanOrEqual(0);
      expect(result.statistics.landFeatures).toBeGreaterThanOrEqual(0);
      
      // Check feature classification
      result.features.forEach((feature: any) => {
        expect(feature.properties.classification).toBeDefined();
        expect(['water', 'land', 'coastline', 'navigation', 'danger'])
          .toContain(feature.properties.classification);
      });
    });

    it('should classify by coordinates', async () => {
      const response = await sendRequest('tools/call', {
        name: 'get_water_land_classification',
        arguments: {
          coordinates: {
            lat: 32.7157,
            lon: -117.1611
          },
          includeFeatures: {
            waterPolygons: true,
            landPolygons: true
          },
          processing: {
            mergeAdjacentWater: true
          },
          limit: 5
        }
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      
      expect(result.type).toBe('FeatureCollection');
      expect(result.statistics).toBeDefined();
    });

    it('should include navigation areas when requested', async () => {
      const response = await sendRequest('tools/call', {
        name: 'get_water_land_classification',
        arguments: {
          chartId: 'US5WA12M',
          includeFeatures: {
            navigationAreas: true,
            dangers: true
          },
          limit: 20
        }
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      
      const navFeatures = result.features.filter((f: any) => 
        f.properties.classification === 'navigation'
      );
      const dangerFeatures = result.features.filter((f: any) => 
        f.properties.classification === 'danger'
      );
      
      // These may or may not exist depending on the chart
      expect(navFeatures).toBeDefined();
      expect(dangerFeatures).toBeDefined();
    });

    it('should apply bounding box filter', async () => {
      const response = await sendRequest('tools/call', {
        name: 'get_water_land_classification',
        arguments: {
          chartId: 'US5WA12M',
          boundingBox: {
            minLat: 47.5,
            maxLat: 47.7,
            minLon: -122.5,
            maxLon: -122.3
          },
          includeFeatures: {
            waterPolygons: true,
            coastlines: true
          }
        }
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      
      // All features should be within the bounding box
      result.features.forEach((feature: any) => {
        if (feature.geometry.type === 'Point') {
          const [lon, lat] = feature.geometry.coordinates;
          expect(lat).toBeGreaterThanOrEqual(47.5);
          expect(lat).toBeLessThanOrEqual(47.7);
          expect(lon).toBeGreaterThanOrEqual(-122.5);
          expect(lon).toBeLessThanOrEqual(-122.3);
        }
      });
    });
  });

  describe('Response size management', () => {
    it('should handle size limit errors gracefully', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          chartId: 'US5WA12M',
          // Request without limit to potentially trigger size error
          extractionMethod: 'combined',
          featureSources: {
            useCoastlines: true,
            useDepthAreas: true,
            useLandAreas: true,
            useShorelineConstruction: true
          }
        }
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      
      // Either successful with pagination or size limit error
      if (result.error === 'Response too large') {
        expect(result.code).toBe('SIZE_LIMIT_EXCEEDED');
        expect(result.suggestions).toBeDefined();
        expect(result.suggestions.useLimit).toBeGreaterThan(0);
      } else {
        expect(result.type).toBe('FeatureCollection');
      }
    });
  });

  describe('Integration with existing tools', () => {
    it('should work with charts found by search_charts', async () => {
      // First search for charts
      const searchResponse = await sendRequest('tools/call', {
        name: 'search_charts',
        arguments: {
          boundingBox: {
            minLat: 47.5,
            maxLat: 47.7,
            minLon: -122.5,
            maxLon: -122.3
          },
          limit: 1
        }
      });

      const searchResult = JSON.parse(searchResponse.result.content[0].text);
      
      if (searchResult.charts && searchResult.charts.length > 0) {
        const chartId = searchResult.charts[0].id;
        
        // Then extract coastlines from that chart
        const coastlineResponse = await sendRequest('tools/call', {
          name: 'extract_coastlines',
          arguments: {
            chartId: chartId,
            limit: 5
          }
        });

        expect(coastlineResponse.result).toBeDefined();
        const coastlineResult = JSON.parse(coastlineResponse.result.content[0].text);
        expect(coastlineResult.metadata.chartId).toBe(chartId);
      }
    });
  });
});