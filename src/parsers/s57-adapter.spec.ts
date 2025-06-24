import { GdalBridge } from './gdal-bridge';

// Mock the gdal-bridge module
jest.mock('./gdal-bridge');

// Import after mock to ensure it uses the mocked GdalBridge
import gdal from './s57-adapter';

describe('S57 Adapter - gdal-async compatibility', () => {
  let mockBridge: jest.Mocked<GdalBridge>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a new mock instance
    mockBridge = {
      openDataset: jest.fn(),
      executeOgrInfo: jest.fn(),
      cleanup: jest.fn()
    } as unknown as jest.Mocked<GdalBridge>;
    
    // Mock the constructor to return our mock instance
    (GdalBridge as jest.MockedClass<typeof GdalBridge>).mockImplementation(() => mockBridge);
  });

  describe('gdal.openAsync', () => {
    it('should open a dataset and return adapter with gdal-async compatible API', async () => {
      const mockFeatures = [
        {
          type: 'Feature' as const,
          id: 'DEPARE.1',
          geometry: { type: 'Polygon', coordinates: [[]] },
          properties: { DRVAL1: 0, DRVAL2: 10, _featureType: 'DEPARE' }
        }
      ];

      const mockSubprocessDataset = {
        layers: jest.fn().mockResolvedValue([
          {
            name: 'DEPARE',
            getFeatures: jest.fn().mockResolvedValue([
              {
                fid: 'DEPARE.1',
                geometry: mockFeatures[0].geometry,
                fields: mockFeatures[0].properties
              }
            ]),
            getFeature: jest.fn(),
            getExtent: jest.fn().mockResolvedValue({ minX: -180, maxX: 180, minY: -90, maxY: 90 })
          }
        ]),
        getLayer: jest.fn().mockImplementation(async (index) => {
          if (index === 0) {
            return {
              name: 'DEPARE',
              getFeatures: jest.fn().mockResolvedValue([
                {
                  fid: 'DEPARE.1',
                  geometry: mockFeatures[0].geometry,
                  fields: mockFeatures[0].properties
                }
              ]),
              getFeature: jest.fn(),
              getExtent: jest.fn().mockResolvedValue({ minX: -180, maxX: 180, minY: -90, maxY: 90 })
            };
          }
          throw new Error('Layer index out of range');
        }),
        close: jest.fn()
      };

      mockBridge.openDataset.mockResolvedValue(mockSubprocessDataset as any);

      // Test opening dataset
      const dataset = await gdal.openAsync('test.000');
      expect(mockBridge.openDataset).toHaveBeenCalledWith('test.000');
      expect(dataset).toBeDefined();

      // Test layer count (after ensureLoaded)
      expect(dataset.layers.count()).toBe(1);

      // Test getting layer by index
      const layer = await dataset.layers.get(0);
      expect(layer.name).toBe('DEPARE');

      // Test async iteration over layers
      const layers = [];
      for await (const layer of dataset.layers) {
        layers.push(layer);
      }
      expect(layers).toHaveLength(1);
      expect(layers[0].name).toBe('DEPARE');

      // Test feature iteration
      const features = [];
      for await (const feature of layer.features) {
        features.push(feature);
      }
      expect(features).toHaveLength(1);
      expect(features[0].fid).toBe('DEPARE.1');

      // Test geometry access
      const geometry = features[0].getGeometry();
      expect(geometry).toBeDefined();
      expect(geometry?.toObject()).toEqual(mockFeatures[0].geometry);
      expect(geometry?.wkbTypeStr()).toBe('Polygon');

      // Test fields access
      expect(features[0].fields.get('DRVAL1')).toBe(0);
      expect(features[0].fields.get('DRVAL2')).toBe(10);
      expect(features[0].fields.toObject()).toEqual(mockFeatures[0].properties);

      // Test dataset close
      await dataset.close();
      expect(mockSubprocessDataset.close).toHaveBeenCalled();
    });

    it('should throw error for synchronous open()', () => {
      expect(() => gdal.open('test.000')).toThrow('Synchronous open() is not supported');
    });
  });

  describe('API compatibility', () => {
    it('should support typical S57Parser usage pattern', async () => {
      // Mock a more complex dataset
      const mockLayers = ['DEPARE', 'LIGHTS', 'BOYLAT'].map((layerName, idx) => ({
        name: layerName,
        getFeatures: jest.fn().mockResolvedValue([
          {
            fid: `${layerName}.1`,
            geometry: { type: 'Point', coordinates: [-122 - idx, 47 + idx] },
            fields: { _featureType: layerName, testProp: idx }
          }
        ]),
        getFeature: jest.fn(),
        getExtent: jest.fn().mockResolvedValue({ minX: -180, maxX: 180, minY: -90, maxY: 90 })
      }));

      const mockSubprocessDataset = {
        layers: jest.fn().mockResolvedValue(mockLayers),
        getLayer: jest.fn().mockImplementation(async (index) => {
          if (index >= 0 && index < mockLayers.length) {
            return mockLayers[index];
          }
          throw new Error('Layer index out of range');
        }),
        close: jest.fn()
      };

      mockBridge.openDataset.mockResolvedValue(mockSubprocessDataset as any);

      // Simulate S57Parser usage
      const dataset = await gdal.openAsync('test.000');
      const features = [];

      // Typical iteration pattern from S57Parser
      const layerCount = dataset.layers.count();
      expect(layerCount).toBe(3);

      for (let i = 0; i < layerCount; i++) {
        const layer = await dataset.layers.get(i);
        const layerName = layer.name;

        for await (const feature of layer.features) {
          const geometry = feature.getGeometry();
          const properties = feature.fields.toObject();
          
          features.push({
            type: 'Feature',
            id: feature.fid,
            geometry: geometry?.toObject(),
            properties: {
              ...properties,
              layerName
            }
          });
        }
      }

      expect(features).toHaveLength(3);
      expect(features[0].id).toBe('DEPARE.1');
      expect(features[1].id).toBe('LIGHTS.1');
      expect(features[2].id).toBe('BOYLAT.1');
    });
  });

  describe('Layer methods', () => {
    it('should handle setSpatialFilter with warning', async () => {
      const mockSubprocessDataset = {
        layers: jest.fn().mockResolvedValue([
          {
            name: 'DEPARE',
            getFeatures: jest.fn().mockResolvedValue([]),
            getFeature: jest.fn(),
            getExtent: jest.fn().mockResolvedValue({ minX: -180, maxX: 180, minY: -90, maxY: 90 })
          }
        ]),
        getLayer: jest.fn().mockResolvedValue({
          name: 'DEPARE',
          getFeatures: jest.fn().mockResolvedValue([]),
          getFeature: jest.fn(),
          getExtent: jest.fn().mockResolvedValue({ minX: -180, maxX: 180, minY: -90, maxY: 90 })
        }),
        close: jest.fn()
      };

      mockBridge.openDataset.mockResolvedValue(mockSubprocessDataset as any);

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const dataset = await gdal.openAsync('test.000');
      const layer = await dataset.layers.get(0);
      
      layer.setSpatialFilter(-122.5, 47.5, -122.0, 48.0);
      
      expect(consoleSpy).toHaveBeenCalledWith('setSpatialFilter is not implemented in subprocess adapter');
      
      consoleSpy.mockRestore();
    });

    it('should support getExtent on layers', async () => {
      const expectedExtent = { minX: -123, maxX: -122, minY: 47, maxY: 48 };
      
      const mockSubprocessDataset = {
        layers: jest.fn().mockResolvedValue([
          {
            name: 'DEPARE',
            getFeatures: jest.fn().mockResolvedValue([]),
            getFeature: jest.fn(),
            getExtent: jest.fn().mockResolvedValue(expectedExtent)
          }
        ]),
        getLayer: jest.fn().mockResolvedValue({
          name: 'DEPARE',
          getFeatures: jest.fn().mockResolvedValue([]),
          getFeature: jest.fn(),
          getExtent: jest.fn().mockResolvedValue(expectedExtent)
        }),
        close: jest.fn()
      };

      mockBridge.openDataset.mockResolvedValue(mockSubprocessDataset as any);

      const dataset = await gdal.openAsync('test.000');
      const layer = await dataset.layers.get(0);
      const extent = await layer.getExtent();
      
      expect(extent).toEqual(expectedExtent);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup bridge on process exit', () => {
      // Save original listeners
      const exitListeners = process.listeners('exit');
      const sigintListeners = process.listeners('SIGINT');
      const sigtermListeners = process.listeners('SIGTERM');
      
      // Remove all listeners
      process.removeAllListeners('exit');
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
      
      // Re-require to register listeners
      jest.resetModules();
      require('./s57-adapter');
      
      // Emit exit event
      process.emit('exit', 0);
      
      // Restore original listeners
      exitListeners.forEach(listener => process.on('exit', listener as any));
      sigintListeners.forEach(listener => process.on('SIGINT', listener as any));
      sigtermListeners.forEach(listener => process.on('SIGTERM', listener as any));
    });
  });
});