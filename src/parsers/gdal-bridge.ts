import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * GdalBridge - Subprocess interface to Python S-57 parser
 * Provides a gdal-async compatible API using subprocess communication
 */

interface ParsedFeature {
  type: 'Feature';
  id: string;
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown> | null;
}

interface FeatureCollection {
  type: 'FeatureCollection';
  features: ParsedFeature[];
}

export class GdalBridge {
  private pythonCommand: string;
  private parserPath: string;
  private activeProcesses: Set<ChildProcess>;

  constructor(pythonCommand: string = 'python3') {
    this.pythonCommand = pythonCommand;
    this.parserPath = this.detectParserPath();
    this.activeProcesses = new Set();
  }

  private detectParserPath(): string {
    // Since we know the exact location, let's use it directly
    // This avoids issues with working directory changes
    const absolutePath = '/Users/tonybentley/Projects/enc-charts-mcp/src/python/s57_parser.py';
    
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
    
    // Fallback: try from current working directory
    const relativePath = path.join(process.cwd(), 'src', 'python', 's57_parser.py');
    if (fs.existsSync(relativePath)) {
      return relativePath;
    }
    
    throw new Error('Could not find s57_parser.py');
  }

  async openDataset(filePath: string): Promise<SubprocessDataset> {
    return new Promise((resolve, reject) => {
      try {
        const process = spawn(this.pythonCommand, [this.parserPath, filePath], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        this.activeProcesses.add(process);

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        process.on('close', (code) => {
          this.activeProcesses.delete(process);

          if (code !== 0) {
            // Extract error message from stderr
            const errorMatch = stderr.match(/Error: (.+)/);
            const errorMessage = errorMatch ? errorMatch[1] : stderr.trim();
            reject(new Error(errorMessage || `Process exited with code ${code}`));
            return;
          }

          try {
            // Clean stdout by removing any non-JSON content
            const jsonStart = stdout.indexOf('{');
            const jsonEnd = stdout.lastIndexOf('}');
            
            if (jsonStart === -1 || jsonEnd === -1) {
              reject(new Error(`No valid JSON found in output. Stderr: ${stderr || 'none'}`));
              return;
            }
            
            const cleanJson = stdout.substring(jsonStart, jsonEnd + 1);
            const result = JSON.parse(cleanJson);
            
            // Check if it's an error response
            if ('error' in result && typeof result.error === 'string') {
              reject(new Error(result.error));
              return;
            }
            
            // Otherwise, it should be a FeatureCollection
            const featureCollection = result as FeatureCollection;
            const dataset = new SubprocessDataset(filePath, featureCollection.features);
            resolve(dataset);
          } catch (e) {
            // Include both stdout and stderr in error for debugging
            const errorDetails = `Parse error: ${e instanceof Error ? e.message : String(e)}. Stdout preview: ${stdout.substring(0, 100)}... Stderr: ${stderr || 'none'}`;
            reject(new Error(errorDetails));
          }
        });

        process.on('error', (err) => {
          this.activeProcesses.delete(process);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async executeOgrInfo(filePath: string, options: any = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [filePath];
      
      if (options.summary) {
        args.push('-summary');
      }

      const process = spawn('ogrinfo', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.activeProcesses.add(process);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        this.activeProcesses.delete(process);

        if (code !== 0) {
          reject(new Error(stderr || `ogrinfo exited with code ${code}`));
          return;
        }

        resolve(stdout);
      });

      process.on('error', (err) => {
        this.activeProcesses.delete(process);
        reject(err);
      });
    });
  }

  cleanup(): void {
    // Terminate all active processes
    for (const process of this.activeProcesses) {
      process.kill();
    }
    this.activeProcesses.clear();
  }
}

export class SubprocessDataset {
  private filePath: string;
  private features: ParsedFeature[];
  private layerCache: Map<string, SubprocessLayer>;

  constructor(filePath: string, features: ParsedFeature[]) {
    this.filePath = filePath;
    this.features = features;
    this.layerCache = new Map();
  }

  async layers(): Promise<SubprocessLayer[]> {
    // Group features by layer name (featureType)
    const layerMap = new Map<string, ParsedFeature[]>();

    for (const feature of this.features) {
      const layerName = String(feature.properties?._featureType || 'Unknown');
      if (!layerMap.has(layerName)) {
        layerMap.set(layerName, []);
      }
      layerMap.get(layerName)!.push(feature);
    }

    // Create layer objects
    const layers: SubprocessLayer[] = [];
    for (const [name, features] of layerMap) {
      const layer = new SubprocessLayer(name, features);
      this.layerCache.set(name, layer);
      layers.push(layer);
    }

    return layers;
  }

  async getLayer(index: number): Promise<SubprocessLayer> {
    const layers = await this.layers();
    if (index < 0 || index >= layers.length) {
      throw new Error('Layer index out of range');
    }
    return layers[index];
  }

  async close(): Promise<void> {
    // Clear internal data
    this.features = [];
    this.layerCache.clear();
  }
}

export class SubprocessLayer {
  public name: string;
  private features: ParsedFeature[];
  private featureMap: Map<string, SubprocessFeature>;

  constructor(name: string, features: ParsedFeature[]) {
    this.name = name;
    this.features = features;
    this.featureMap = new Map();
  }

  async getFeatures(): Promise<SubprocessFeature[]> {
    const result: SubprocessFeature[] = [];
    
    for (const feature of this.features) {
      const subprocessFeature = new SubprocessFeature(feature);
      this.featureMap.set(feature.id, subprocessFeature);
      result.push(subprocessFeature);
    }

    return result;
  }

  async getFeature(fid: string): Promise<SubprocessFeature> {
    // Check cache first
    if (this.featureMap.has(fid)) {
      return this.featureMap.get(fid)!;
    }

    // Find in features
    const feature = this.features.find(f => f.id === fid);
    if (!feature) {
      throw new Error('Feature not found');
    }

    const subprocessFeature = new SubprocessFeature(feature);
    this.featureMap.set(fid, subprocessFeature);
    return subprocessFeature;
  }

  async getExtent(): Promise<{ minX: number; maxX: number; minY: number; maxY: number }> {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const feature of this.features) {
      if (!feature.geometry) continue;

      const coords = this.extractCoordinates(feature.geometry);
      for (const coord of coords) {
        minX = Math.min(minX, coord[0]);
        maxX = Math.max(maxX, coord[0]);
        minY = Math.min(minY, coord[1]);
        maxY = Math.max(maxY, coord[1]);
      }
    }

    return { minX, maxX, minY, maxY };
  }

  private extractCoordinates(geometry: any): number[][] {
    const coords: number[][] = [];

    switch (geometry.type) {
      case 'Point':
        coords.push(geometry.coordinates);
        break;
      case 'LineString':
        coords.push(...geometry.coordinates);
        break;
      case 'Polygon':
        for (const ring of geometry.coordinates) {
          coords.push(...ring);
        }
        break;
      case 'MultiPoint':
        coords.push(...geometry.coordinates);
        break;
      case 'MultiLineString':
        for (const line of geometry.coordinates) {
          coords.push(...line);
        }
        break;
      case 'MultiPolygon':
        for (const polygon of geometry.coordinates) {
          for (const ring of polygon) {
            coords.push(...ring);
          }
        }
        break;
    }

    return coords;
  }
}

export class SubprocessFeature {
  public fid: string;
  public geometry: any;
  public fields: Record<string, any>;

  constructor(feature: ParsedFeature) {
    this.fid = feature.id;
    this.geometry = feature.geometry;
    this.fields = feature.properties || {};
  }
}
// Export mock bridge for testing
export const __mockBridge = new GdalBridge();
