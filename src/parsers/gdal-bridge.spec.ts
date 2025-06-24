import { GdalBridge, SubprocessDataset, SubprocessLayer, SubprocessFeature } from './gdal-bridge';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process');

describe('GdalBridge', () => {
  let bridge: GdalBridge;
  let mockSpawn: jest.MockedFunction<typeof spawn>;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = new GdalBridge();
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
  });

  afterEach(() => {
    bridge.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with default Python command', () => {
      expect(bridge).toBeDefined();
      expect(bridge['pythonCommand']).toBe('python3');
    });

    it('should detect parser path correctly', () => {
      const parserPath = bridge['parserPath'];
      expect(parserPath).toContain('s57_parser.py');
    });
  });

  describe('openDataset', () => {
    it('should spawn Python process for parsing S-57 file', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: jest.fn(), end: jest.fn() };
      
      mockSpawn.mockReturnValue(mockProcess);

      const datasetPromise = bridge.openDataset('test.000');

      // Simulate successful parse
      const mockGeoJSON = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'DEPARE.1',
            geometry: { type: 'Polygon', coordinates: [[]] },
            properties: { DRVAL1: 0, DRVAL2: 10, _featureType: 'DEPARE' }
          }
        ]
      };

      mockProcess.stdout.emit('data', JSON.stringify(mockGeoJSON));
      mockProcess.emit('close', 0);

      const dataset = await datasetPromise;
      expect(dataset).toBeInstanceOf(SubprocessDataset);
      expect(mockSpawn).toHaveBeenCalledWith(
        'python3',
        [expect.stringContaining('s57_parser.py'), 'test.000'],
        expect.any(Object)
      );
    });

    it('should handle parsing errors', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = { write: jest.fn(), end: jest.fn() };
      
      mockSpawn.mockReturnValue(mockProcess);

      const datasetPromise = bridge.openDataset('invalid.000');

      mockProcess.stderr.emit('data', 'Error: Could not open file');
      mockProcess.emit('close', 1);

      await expect(datasetPromise).rejects.toThrow('Could not open file');
    });

    it('should handle process spawn errors', async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error('spawn error');
      });

      await expect(bridge.openDataset('test.000')).rejects.toThrow('spawn error');
    });
  });

  describe('executeOgrInfo', () => {
    it('should execute ogrinfo command', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      
      mockSpawn.mockReturnValue(mockProcess);

      const infoPromise = bridge.executeOgrInfo('test.000', { summary: true });

      mockProcess.stdout.emit('data', 'Layer: DEPARE (Polygon)');
      mockProcess.emit('close', 0);

      const result = await infoPromise;
      expect(result).toBe('Layer: DEPARE (Polygon)');
      expect(mockSpawn).toHaveBeenCalledWith(
        'ogrinfo',
        expect.arrayContaining(['test.000']),
        expect.any(Object)
      );
    });
  });

  describe('cleanup', () => {
    it('should terminate active processes on cleanup', () => {
      const mockProcess1 = new EventEmitter() as any;
      mockProcess1.kill = jest.fn();
      mockProcess1.stdout = new EventEmitter();
      mockProcess1.stderr = new EventEmitter();
      
      const mockProcess2 = new EventEmitter() as any;
      mockProcess2.kill = jest.fn();
      mockProcess2.stdout = new EventEmitter();
      mockProcess2.stderr = new EventEmitter();
      
      bridge['activeProcesses'].add(mockProcess1);
      bridge['activeProcesses'].add(mockProcess2);

      bridge.cleanup();

      expect(mockProcess1.kill).toHaveBeenCalled();
      expect(mockProcess2.kill).toHaveBeenCalled();
      expect(bridge['activeProcesses'].size).toBe(0);
    });
  });
});

describe('SubprocessDataset', () => {
  let dataset: SubprocessDataset;
  const mockFeatures = [
    {
      type: 'Feature' as const,
      id: 'DEPARE.1',
      geometry: { type: 'Polygon', coordinates: [[]] },
      properties: { DRVAL1: 0, DRVAL2: 10, _featureType: 'DEPARE' }
    },
    {
      type: 'Feature' as const,
      id: 'LIGHTS.1',
      geometry: { type: 'Point', coordinates: [-122, 47] },
      properties: { COLOUR: '1,3', _featureType: 'LIGHTS' }
    }
  ];

  beforeEach(() => {
    dataset = new SubprocessDataset('test.000', mockFeatures);
  });

  describe('layers', () => {
    it('should return unique layers from features', async () => {
      const layers = await dataset.layers();
      expect(layers).toHaveLength(2);
      expect(layers[0]).toBeInstanceOf(SubprocessLayer);
      expect(layers[0].name).toBe('DEPARE');
      expect(layers[1].name).toBe('LIGHTS');
    });

    it('should handle empty features', async () => {
      const emptyDataset = new SubprocessDataset('test.000', []);
      const layers = await emptyDataset.layers();
      expect(layers).toHaveLength(0);
    });
  });

  describe('getLayer', () => {
    it('should return layer by index', async () => {
      const layer = await dataset.getLayer(0);
      expect(layer).toBeInstanceOf(SubprocessLayer);
      expect(layer.name).toBe('DEPARE');
    });

    it('should throw for invalid index', async () => {
      await expect(dataset.getLayer(10)).rejects.toThrow('Layer index out of range');
    });
  });

  describe('close', () => {
    it('should clear internal data', async () => {
      await dataset.close();
      const layers = await dataset.layers();
      expect(layers).toHaveLength(0);
    });
  });
});

describe('SubprocessLayer', () => {
  let layer: SubprocessLayer;
  const mockFeatures = [
    {
      type: 'Feature' as const,
      id: 'DEPARE.1',
      geometry: { type: 'Polygon', coordinates: [[]] },
      properties: { DRVAL1: 0, DRVAL2: 10, _featureType: 'DEPARE' }
    },
    {
      type: 'Feature' as const,
      id: 'DEPARE.2',
      geometry: { type: 'Polygon', coordinates: [[]] },
      properties: { DRVAL1: 10, DRVAL2: 20, _featureType: 'DEPARE' }
    }
  ];

  beforeEach(() => {
    layer = new SubprocessLayer('DEPARE', mockFeatures);
  });

  describe('features', () => {
    it('should return all features for the layer', async () => {
      const features = await layer.getFeatures();
      expect(features).toHaveLength(2);
      expect(features[0]).toBeInstanceOf(SubprocessFeature);
      expect(features[0].fid).toBe('DEPARE.1');
    });
  });

  describe('getFeature', () => {
    it('should return feature by FID', async () => {
      const feature = await layer.getFeature('DEPARE.1');
      expect(feature).toBeInstanceOf(SubprocessFeature);
      expect(feature.fid).toBe('DEPARE.1');
    });

    it('should throw for invalid FID', async () => {
      await expect(layer.getFeature('INVALID')).rejects.toThrow('Feature not found');
    });
  });

  describe('getExtent', () => {
    it('should calculate extent from features', async () => {
      const layerWithPoints = new SubprocessLayer('LIGHTS', [
        {
          type: 'Feature' as const,
          id: 'LIGHTS.1',
          geometry: { type: 'Point', coordinates: [-122, 47] },
          properties: { _featureType: 'LIGHTS' }
        },
        {
          type: 'Feature' as const,
          id: 'LIGHTS.2',
          geometry: { type: 'Point', coordinates: [-123, 48] },
          properties: { _featureType: 'LIGHTS' }
        }
      ]);

      const extent = await layerWithPoints.getExtent();
      expect(extent).toEqual({
        minX: -123,
        maxX: -122,
        minY: 47,
        maxY: 48
      });
    });
  });
});

describe('SubprocessFeature', () => {
  const mockFeature = {
    type: 'Feature' as const,
    id: 'DEPARE.1',
    geometry: { 
      type: 'Polygon' as const, 
      coordinates: [[[-122, 47], [-121, 47], [-121, 48], [-122, 48], [-122, 47]]] 
    },
    properties: { 
      DRVAL1: 0, 
      DRVAL2: 10, 
      _featureType: 'DEPARE' 
    }
  };

  let feature: SubprocessFeature;

  beforeEach(() => {
    feature = new SubprocessFeature(mockFeature);
  });

  it('should expose feature properties', () => {
    expect(feature.fid).toBe('DEPARE.1');
    expect(feature.geometry).toEqual(mockFeature.geometry);
    expect(feature.fields).toEqual(mockFeature.properties);
  });

  it('should handle missing properties', () => {
    const featureNoProps = new SubprocessFeature({
      ...mockFeature,
      properties: null
    });
    expect(featureNoProps.fields).toEqual({});
  });
});