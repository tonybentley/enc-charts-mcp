/**
 * Mock S57 Adapter for testing without GDAL
 */

export class MockDataset {
  layers = {
    count: () => 2,
    get: (index: number) => {
      if (index === 0) {
        return {
          name: 'DEPARE',
          setSpatialFilter: () => {},
          features: {
            async *[Symbol.asyncIterator]() {
              yield {
                getGeometry: () => ({
                  toObject: () => ({
                    type: 'Polygon',
                    coordinates: [[[-117.17, 32.71], [-117.16, 32.71], [-117.16, 32.72], [-117.17, 32.72], [-117.17, 32.71]]]
                  })
                }),
                fields: {
                  toObject: () => ({
                    DRVAL1: 0,
                    DRVAL2: 10,
                    OBJNAM: 'Test Depth Area'
                  })
                }
              };
            }
          }
        };
      } else {
        return {
          name: 'LIGHTS',
          setSpatialFilter: () => {},
          features: {
            async *[Symbol.asyncIterator]() {
              yield {
                getGeometry: () => ({
                  toObject: () => ({
                    type: 'Point',
                    coordinates: [-117.165, 32.715]
                  })
                }),
                fields: {
                  toObject: () => ({
                    LITCHR: '2',
                    SIGPER: 4,
                    COLOUR: '3',
                    OBJNAM: 'Test Light'
                  })
                }
              };
            }
          }
        };
      }
    }
  };
  
  srs = {
    toWKT: () => 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
  };
  
  rasterSize = { x: 0, y: 0 };
  
  close() {}
}

const gdal = {
  openAsync: async (filePath: string) => {
    // Return mock dataset for testing
    return new MockDataset();
  }
};

export default gdal;