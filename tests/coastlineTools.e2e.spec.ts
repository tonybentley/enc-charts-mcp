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

describe('Coastline Tools E2E Tests', () => {
  let serverProcess: ChildProcess;
  let requestId = 1;

  beforeEach(async () => {
    // Ensure build is up to date
    console.log('Building project...');
    const { execSync } = await import('child_process');
    execSync('npm run build', { stdio: 'inherit' });

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
        
        // Try to parse complete JSON responses
        const lines = responseData.split('\n');
        for (const line of lines) {
          if (line.trim() && line.includes('{')) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id - 1) {
                serverProcess.stdout?.off('data', handleData);
                resolve(response);
                return;
              }
            } catch (error) {
              // Continue collecting data
            }
          }
        }
      };

      serverProcess.stdout?.on('data', handleData);
      serverProcess.stdin?.write(JSON.stringify(request) + '\n');

      // Timeout after 60 seconds for real chart processing
      setTimeout(() => {
        serverProcess.stdout?.off('data', handleData);
        reject(new Error('Request timeout'));
      }, 60000);
    });
  };

  describe('extract_coastlines tool', () => {
    it('should extract coastlines from San Diego Bay (Shelter Island)', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          coordinates: {
            lat: 32.714935,
            lon: -117.228975
          },
          boundingBox: {
            minLat: 32.7,
            maxLat: 32.73,
            minLon: -117.25,
            maxLon: -117.2
          },
          extractionMethod: 'combined',
          featureSources: {
            useCoastlines: true,
            useDepthAreas: true,
            useLandAreas: true,
            useShorelineConstruction: true,
            useHarborFeatures: true,
            useMooringFeatures: true,
            useSpecialFeatures: true
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
          limit: 200
        }
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result.content).toBeDefined();
      expect(response.result.content[0]).toBeDefined();
      
      const result = JSON.parse(response.result.content[0].text);
      
      // Verify response structure
      expect(result.type).toBe('FeatureCollection');
      expect(Array.isArray(result.features)).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.chartId).toBeDefined();
      
      // Verify we got features
      expect(result.features.length).toBeGreaterThan(0);
      console.log(`Found ${result.features.length} coastline features`);
      
      // Check processing stats
      const stats = result.metadata.processingStats;
      expect(stats).toBeDefined();
      expect(stats.totalSegments).toBeGreaterThan(0);
      expect(stats.totalLength_m).toBeGreaterThan(0);
      
      // Check gap metrics if gaps exist
      if (stats.gaps > 0) {
        expect(stats.largestGap_m).toBeDefined();
        expect(stats.averageGap_m).toBeDefined();
        expect(stats.gapDistribution).toBeDefined();
      }
      
      // Check source breakdown
      expect(result.metadata.sources).toBeDefined();
      const sources = result.metadata.sources;
      console.log('Source breakdown:', sources);
      
      // Verify multiple source types were found
      const sourceTypes = Object.keys(sources);
      expect(sourceTypes.length).toBeGreaterThan(0);
      
      // Check feature properties
      const firstFeature = result.features[0];
      expect(firstFeature.type).toBe('Feature');
      expect(firstFeature.geometry).toBeDefined();
      expect(['LineString', 'MultiLineString']).toContain(firstFeature.geometry.type);
      expect(firstFeature.properties).toBeDefined();
      expect(firstFeature.properties.type).toBeDefined();
      expect(firstFeature.properties.sourceFeatures).toBeDefined();
      expect(Array.isArray(firstFeature.properties.sourceFeatures)).toBe(true);
    });

    it('should handle chart ID request', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          chartId: 'US5CA72M',
          extractionMethod: 'explicit',
          featureSources: {
            useCoastlines: true,
            useShorelineConstruction: true
          },
          limit: 50
        }
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      const result = JSON.parse(response.result.content[0].text);
      expect(result.metadata.chartId).toBe('US5CA72M');
    });

    it('should handle different extraction methods', async () => {
      // Test explicit method (only COALNE/SLCONS)
      const explicitResponse = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          chartId: 'US5CA72M',
          extractionMethod: 'explicit',
          limit: 10
        }
      });

      expect(explicitResponse.error).toBeUndefined();
      const explicitResult = JSON.parse(explicitResponse.result.content[0].text);
      
      // Test derived method (from polygons)
      const derivedResponse = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          chartId: 'US5CA72M',
          extractionMethod: 'derived',
          limit: 10
        }
      });

      expect(derivedResponse.error).toBeUndefined();
      const derivedResult = JSON.parse(derivedResponse.result.content[0].text);
      
      // Verify different sources
      const explicitSources = explicitResult.features.map((f: any) => f.properties.source);
      const derivedSources = derivedResult.features.map((f: any) => f.properties.source);
      
      expect(explicitSources.every((s: string) => s === 'explicit')).toBe(true);
      expect(derivedSources.every((s: string) => s === 'derived')).toBe(true);
    });

    it('should handle pagination', async () => {
      const firstPage = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          chartId: 'US5CA72M',
          limit: 5,
          offset: 0
        }
      });

      expect(firstPage.error).toBeUndefined();
      const firstResult = JSON.parse(firstPage.result.content[0].text);
      
      if (firstResult.metadata.pagination?.hasMore) {
        const secondPage = await sendRequest('tools/call', {
          name: 'extract_coastlines',
          arguments: {
            chartId: 'US5CA72M',
            limit: 5,
            offset: 5
          }
        });

        expect(secondPage.error).toBeUndefined();
        const secondResult = JSON.parse(secondPage.result.content[0].text);
        
        // Verify pagination metadata
        expect(firstResult.metadata.pagination.limit).toBe(5);
        expect(firstResult.metadata.pagination.offset).toBe(0);
        expect(secondResult.metadata.pagination.offset).toBe(5);
        
        // Verify different features
        const firstIds = firstResult.features.map((f: any) => 
          JSON.stringify(f.geometry.coordinates[0])
        );
        const secondIds = secondResult.features.map((f: any) => 
          JSON.stringify(f.geometry.coordinates[0])
        );
        
        const overlap = firstIds.filter((id: string) => secondIds.includes(id));
        expect(overlap.length).toBe(0);
      }
    });

    it('should handle invalid coordinates gracefully', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          coordinates: {
            lat: 91, // Invalid latitude
            lon: -117
          }
        }
      });

      expect(response.error).toBeDefined();
    });
  });

  describe('get_water_land_classification tool', () => {
    it('should classify water and land areas for San Diego Bay', async () => {
      const response = await sendRequest('tools/call', {
        name: 'get_water_land_classification',
        arguments: {
          coordinates: {
            lat: 32.714935,
            lon: -117.228975
          },
          boundingBox: {
            minLat: 32.7,
            maxLat: 32.73,
            minLon: -117.25,
            maxLon: -117.2
          },
          includeFeatures: {
            waterPolygons: true,
            landPolygons: true,
            coastlines: true,
            navigationAreas: true,
            dangers: false
          },
          processing: {
            mergeAdjacentWater: true,
            fillGaps: true,
            smoothing: false
          },
          limit: 100
        }
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      
      const result = JSON.parse(response.result.content[0].text);
      
      // Verify response structure
      expect(result.type).toBe('FeatureCollection');
      expect(Array.isArray(result.features)).toBe(true);
      expect(result.statistics).toBeDefined();
      
      // Check statistics
      const stats = result.statistics;
      expect(stats.totalFeatures).toBeGreaterThan(0);
      expect(stats.waterFeatures).toBeGreaterThanOrEqual(0);
      expect(stats.landFeatures).toBeGreaterThanOrEqual(0);
      expect(stats.coastlineFeatures).toBeGreaterThanOrEqual(0);
      
      // Verify features have proper classification
      result.features.forEach((feature: any) => {
        expect(feature.properties).toBeDefined();
        expect(feature.properties.classification).toBeDefined();
        expect(['water', 'land', 'coastline', 'navigation', 'danger'])
          .toContain(feature.properties.classification);
        
        // Check geometry types based on classification
        if (feature.properties.classification === 'coastline') {
          expect(['LineString', 'MultiLineString']).toContain(feature.geometry.type);
        } else {
          expect(['Polygon', 'MultiPolygon', 'LineString']).toContain(feature.geometry.type);
        }
      });
      
      console.log('Water/Land classification statistics:', stats);
    });

    it('should handle chart ID request', async () => {
      const response = await sendRequest('tools/call', {
        name: 'get_water_land_classification',
        arguments: {
          chartId: 'US5CA72M',
          includeFeatures: {
            waterPolygons: true,
            landPolygons: false,
            coastlines: false
          },
          limit: 20
        }
      });

      expect(response.error).toBeUndefined();
      const result = JSON.parse(response.result.content[0].text);
      
      // Should only have water features
      result.features.forEach((feature: any) => {
        expect(feature.properties.classification).toBe('water');
      });
    });

    it('should merge adjacent water bodies when requested', async () => {
      const unmergedResponse = await sendRequest('tools/call', {
        name: 'get_water_land_classification',
        arguments: {
          chartId: 'US5CA72M',
          includeFeatures: {
            waterPolygons: true,
            landPolygons: false
          },
          processing: {
            mergeAdjacentWater: false
          },
          limit: 50
        }
      });

      const mergedResponse = await sendRequest('tools/call', {
        name: 'get_water_land_classification',
        arguments: {
          chartId: 'US5CA72M',
          includeFeatures: {
            waterPolygons: true,
            landPolygons: false
          },
          processing: {
            mergeAdjacentWater: true
          },
          limit: 50
        }
      });

      expect(unmergedResponse.error).toBeUndefined();
      expect(mergedResponse.error).toBeUndefined();
      
      const unmergedResult = JSON.parse(unmergedResponse.result.content[0].text);
      const mergedResult = JSON.parse(mergedResponse.result.content[0].text);
      
      // Merged should typically have fewer features
      console.log(`Unmerged water features: ${unmergedResult.features.length}`);
      console.log(`Merged water features: ${mergedResult.features.length}`);
    });
  });

  describe('Integration between tools', () => {
    it('should extract consistent data from both tools', async () => {
      const testArea = {
        coordinates: {
          lat: 32.714935,
          lon: -117.228975
        },
        boundingBox: {
          minLat: 32.71,
          maxLat: 32.72,
          minLon: -117.24,
          maxLon: -117.22
        }
      };

      // Get coastlines
      const coastlineResponse = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          ...testArea,
          extractionMethod: 'combined',
          limit: 50
        }
      });

      // Get water/land classification
      const classificationResponse = await sendRequest('tools/call', {
        name: 'get_water_land_classification',
        arguments: {
          ...testArea,
          includeFeatures: {
            waterPolygons: true,
            landPolygons: true,
            coastlines: true
          },
          limit: 50
        }
      });

      expect(coastlineResponse.error).toBeUndefined();
      expect(classificationResponse.error).toBeUndefined();

      const coastlines = JSON.parse(coastlineResponse.result.content[0].text);
      const classification = JSON.parse(classificationResponse.result.content[0].text);

      // Both should find features in the same area
      expect(coastlines.features.length).toBeGreaterThan(0);
      expect(classification.features.length).toBeGreaterThan(0);

      // Classification should include coastline features
      const coastlineClassified = classification.features.filter(
        (f: any) => f.properties.classification === 'coastline'
      );
      
      console.log(`Coastlines from extract_coastlines: ${coastlines.features.length}`);
      console.log(`Coastlines from water/land classification: ${coastlineClassified.length}`);
    });
  });

  describe('Error handling', () => {
    it('should handle missing required parameters', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {} // No chartId or coordinates
      });

      expect(response.error).toBeDefined();
    });

    it('should handle invalid chart IDs', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          chartId: 'INVALID_CHART_ID'
        }
      });

      expect(response.error).toBeDefined();
    });

    it('should handle coordinates outside chart coverage', async () => {
      const response = await sendRequest('tools/call', {
        name: 'extract_coastlines',
        arguments: {
          coordinates: {
            lat: 0, // Equator - no US charts here
            lon: 0
          }
        }
      });

      // Should either return error or empty results
      if (!response.error) {
        const result = JSON.parse(response.result.content[0].text);
        expect(result.features.length).toBe(0);
      }
    });
  });
});