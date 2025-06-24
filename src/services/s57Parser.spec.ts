import { S57Parser } from './s57Parser';
import gdal from '../parsers/s57-adapter';

// Mock s57-adapter
jest.mock('../parsers/s57-adapter', () => ({
  openAsync: jest.fn(),
  wkbPoint: 1,
  wkbPoint25D: 0x80000001,
  wkbLineString: 2,
  wkbLineString25D: 0x80000002,
  wkbPolygon: 3,
  wkbPolygon25D: 0x80000003,
  wkbMultiPoint: 4,
  wkbMultiPoint25D: 0x80000004,
  wkbMultiLineString: 5,
  wkbMultiLineString25D: 0x80000005,
  wkbMultiPolygon: 6,
  wkbMultiPolygon25D: 0x80000006,
  SpatialReference: {
    fromEPSG: jest.fn().mockReturnValue({
      isSame: jest.fn().mockReturnValue(true)
    })
  },
  CoordinateTransformation: jest.fn()
}));

describe('S57Parser', () => {
  let parser: S57Parser;
  let mockDataset: any;
  let mockLayer: any;
  let mockFeature: any;
  let mockGeometry: any;

  beforeEach(() => {
    jest.clearAllMocks();
    parser = new S57Parser();

    // Setup mock geometry
    mockGeometry = {
      srs: null,
      wkbType: gdal.wkbPoint,
      x: -117.2279,
      y: 32.7144,
      z: undefined,
      transform: jest.fn()
    };

    // Setup mock feature
    mockFeature = {
      getGeometry: jest.fn().mockReturnValue(mockGeometry),
      fields: {
        toObject: jest.fn().mockReturnValue({
          OBJNAM: 'Test Feature',
          VALDCO: 10.5,
          LNAM: 'TEST_001'
        })
      }
    };

    // Setup mock layer
    mockLayer = {
      name: 'DEPARE',
      setSpatialFilter: jest.fn(),
      features: {
        forEachAsync: jest.fn().mockImplementation(async (callback) => {
          await callback(mockFeature);
        })
      }
    };

    // Setup mock dataset
    mockDataset = {
      layers: {
        count: jest.fn().mockReturnValue(1),
        get: jest.fn().mockReturnValue(mockLayer)
      },
      getMetadata: jest.fn().mockReturnValue({
        SCALE: '12000',
        ISDT: '2024-01-15',
        UADT: '2024-07-17'
      }),
      getEnvelopeAsync: jest.fn().mockResolvedValue({
        minX: -117.3,
        maxX: -117.1,
        minY: 32.6,
        maxY: 32.8
      })
    };

    (gdal.openAsync as jest.Mock).mockResolvedValue(mockDataset);
  });

  describe('parseChart', () => {
    it('should parse S-57 file and return features', async () => {
      const result = await parser.parseChart('/test/chart.000');

      expect(result).toEqual({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'TEST_001',
            geometry: {
              type: 'Point',
              coordinates: [-117.2279, 32.7144]
            },
            properties: {
              _featureType: 'DEPARE',
              OBJNAM: 'Test Feature',
              VALDCO: 10.5,
              LNAM: 'TEST_001'
            }
          }
        ]
      });

      expect(gdal.openAsync).toHaveBeenCalledWith('/test/chart.000');
    });

    it('should filter by feature types', async () => {
      mockLayer.name = 'SOUNDG';
      
      const result = await parser.parseChart('/test/chart.000', {
        featureTypes: ['DEPARE', 'DEPCNT']
      });

      expect(result.features).toHaveLength(0);
    });

    it('should apply spatial filter when bounding box provided', async () => {
      const bounds = {
        minLat: 32.6,
        maxLat: 32.8,
        minLon: -117.3,
        maxLon: -117.1
      };

      await parser.parseChart('/test/chart.000', {
        boundingBox: bounds
      });

      expect(mockLayer.setSpatialFilter).toHaveBeenCalledWith(
        bounds.minLon,
        bounds.minLat,
        bounds.maxLon,
        bounds.maxLat
      );
    });

    it('should filter by depth range for depth features', async () => {
      mockFeature.fields.toObject.mockReturnValue({
        DRVAL1: 5,
        DRVAL2: 15
      });

      const result = await parser.parseChart('/test/chart.000', {
        depthRange: { min: 10, max: 20 }
      });

      expect(result.features).toHaveLength(1);

      // Test filtering out
      const result2 = await parser.parseChart('/test/chart.000', {
        depthRange: { min: 20, max: 30 }
      });

      expect(result2.features).toHaveLength(0);
    });

    it('should handle LineString geometry', async () => {
      mockGeometry.wkbType = gdal.wkbLineString;
      mockGeometry.points = {
        toArray: jest.fn().mockReturnValue([
          { x: -117.2, y: 32.7 },
          { x: -117.3, y: 32.8 }
        ])
      };

      const result = await parser.parseChart('/test/chart.000');

      expect(result.features[0].geometry).toEqual({
        type: 'LineString',
        coordinates: [[-117.2, 32.7], [-117.3, 32.8]]
      });
    });

    it('should handle Polygon geometry', async () => {
      mockGeometry.wkbType = gdal.wkbPolygon;
      mockGeometry.rings = {
        count: jest.fn().mockReturnValue(1),
        get: jest.fn().mockReturnValue({
          points: {
            toArray: jest.fn().mockReturnValue([
              { x: -117.2, y: 32.7 },
              { x: -117.3, y: 32.7 },
              { x: -117.3, y: 32.8 },
              { x: -117.2, y: 32.8 },
              { x: -117.2, y: 32.7 }
            ])
          }
        })
      };

      const result = await parser.parseChart('/test/chart.000');

      expect(result.features[0].geometry).toEqual({
        type: 'Polygon',
        coordinates: [[
          [-117.2, 32.7],
          [-117.3, 32.7],
          [-117.3, 32.8],
          [-117.2, 32.8],
          [-117.2, 32.7]
        ]]
      });
    });

    it('should handle parse errors gracefully', async () => {
      (gdal.openAsync as jest.Mock).mockRejectedValue(new Error('File not found'));

      await expect(parser.parseChart('/invalid/file.000')).rejects.toThrow(
        'Failed to parse S-57 file: File not found'
      );
    });
  });

  describe('getAvailableFeatureTypes', () => {
    it('should return all layer names', async () => {
      mockDataset.layers.count.mockReturnValue(3);
      mockDataset.layers.get.mockImplementation((index: number) => ({
        name: ['DEPARE', 'SOUNDG', 'LIGHTS'][index]
      }));

      const featureTypes = await parser.getAvailableFeatureTypes('/test/chart.000');

      expect(featureTypes).toEqual(['DEPARE', 'SOUNDG', 'LIGHTS']);
    });
  });

  describe('parseFeatureType', () => {
    it('should parse only specified feature type', async () => {
      const features = await parser.parseFeatureType('/test/chart.000', 'DEPARE');

      expect(features).toHaveLength(1);
      expect(features[0].properties?._featureType).toBe('DEPARE');
    });
  });

  describe('getChartMetadata', () => {
    it('should extract chart metadata', async () => {
      const metadata = await parser.getChartMetadata('/test/chart.000');

      expect(metadata).toEqual({
        name: 'chart',
        scale: 12000,
        issueDate: '2024-01-15',
        updateDate: '2024-07-17',
        bounds: {
          minLon: -117.3,
          maxLon: -117.1,
          minLat: 32.6,
          maxLat: 32.8
        }
      });
    });

    it('should handle missing metadata gracefully', async () => {
      mockDataset.getMetadata.mockReturnValue({});
      mockDataset.getEnvelopeAsync.mockResolvedValue(null);

      const metadata = await parser.getChartMetadata('/test/chart.000');

      expect(metadata).toEqual({
        name: 'chart',
        scale: undefined,
        issueDate: undefined,
        updateDate: undefined,
        bounds: undefined
      });
    });
  });

  describe('coordinate transformation', () => {
    it('should transform coordinates to WGS84 if needed', async () => {
      const mockSrs = {
        isSame: jest.fn().mockReturnValue(false)
      };
      
      const mockTransformation = {};
      (gdal.CoordinateTransformation as jest.Mock).mockReturnValue(mockTransformation);
      
      mockGeometry.srs = mockSrs;

      await parser.parseChart('/test/chart.000');

      expect(gdal.CoordinateTransformation).toHaveBeenCalledWith(
        mockSrs,
        expect.any(Object)
      );
      expect(mockGeometry.transform).toHaveBeenCalledWith(mockTransformation);
    });
  });

  describe('depth filtering', () => {
    it('should filter DEPARE by depth range overlap', async () => {
      mockFeature.fields.toObject.mockReturnValue({
        DRVAL1: 10,
        DRVAL2: 20
      });

      // Should include - ranges overlap
      const result1 = await parser.parseChart('/test/chart.000', {
        depthRange: { min: 15, max: 25 }
      });
      expect(result1.features).toHaveLength(1);

      // Should exclude - no overlap
      const result2 = await parser.parseChart('/test/chart.000', {
        depthRange: { min: 25, max: 30 }
      });
      expect(result2.features).toHaveLength(0);
    });

    it('should filter SOUNDG by exact depth value', async () => {
      mockLayer.name = 'SOUNDG';
      mockFeature.fields.toObject.mockReturnValue({
        VALSOU: 15.5
      });

      // Should include
      const result1 = await parser.parseChart('/test/chart.000', {
        depthRange: { min: 10, max: 20 }
      });
      expect(result1.features).toHaveLength(1);

      // Should exclude
      const result2 = await parser.parseChart('/test/chart.000', {
        depthRange: { min: 20, max: 30 }
      });
      expect(result2.features).toHaveLength(0);
    });
  });
});