export const createMockS57Parser = () => {
  return {
    parseChart: jest.fn().mockResolvedValue({
      type: 'FeatureCollection',
      features: [
        {
          id: 'mock-feature-1',
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-117.1611, 32.7157]
          },
          properties: {
            _featureType: 'DEPARE',
            DRVAL1: 0,
            DRVAL2: 10
          }
        },
        {
          id: 'mock-feature-2',
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [-117.162, 32.716]
          },
          properties: {
            _featureType: 'LIGHTS',
            LITCHR: '2',
            SIGPER: 4
          }
        }
      ]
    }),
    getChartMetadata: jest.fn().mockResolvedValue({
      name: 'Mock Chart',
      bounds: {
        minLat: 32.7,
        maxLat: 32.8,
        minLon: -117.2,
        maxLon: -117.1
      },
      scale: 40000,
      edition: 25,
      updateDate: '2024-01-15'
    }),
    getAvailableFeatureTypes: jest.fn().mockResolvedValue(['DEPARE', 'LIGHTS', 'BOYLAT'])
  };
};