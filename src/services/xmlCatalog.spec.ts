import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { XMLCatalogService } from './xmlCatalog.js';
import axios from 'axios';
import { promises as fs } from 'fs';
import { parseStringPromise } from 'xml2js';

jest.mock('axios');
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    stat: jest.fn(),
    rm: jest.fn(),
    unlink: jest.fn(),
    access: jest.fn()
  }
}));
jest.mock('xml2js');

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('XMLCatalogService', () => {
  let service: XMLCatalogService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new XMLCatalogService('/test/cache');
  });

  describe('getCatalog', () => {
    const mockCatalogXML = `<?xml version="1.0"?>
      <EncProductCatalog>
        <cell>
          <name>US5CA52M</name>
          <lname>San Francisco Bay</lname>
          <cscale>40000</cscale>
          <status>Active</status>
          <edtn>25</edtn>
          <updn>10</updn>
          <uadt>20240115</uadt>
          <isdt>20230101</isdt>
          <zipfile_location>https://www.charts.noaa.gov/ENCs/US5CA52M.zip</zipfile_location>
          <zipfile_size>1048576</zipfile_size>
          <cov>
            <panel>
              <vertex><lat>37.7</lat><long>-122.5</long></vertex>
              <vertex><lat>37.8</lat><long>-122.5</long></vertex>
              <vertex><lat>37.8</lat><long>-122.4</long></vertex>
              <vertex><lat>37.7</lat><long>-122.4</long></vertex>
            </panel>
          </cov>
        </cell>
      </EncProductCatalog>`;

    it('should download and parse catalog', async () => {
      mockAxios.get.mockResolvedValue({ data: mockCatalogXML });
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.stat.mockRejectedValue(new Error('Not found'));
      (parseStringPromise as jest.MockedFunction<typeof parseStringPromise>).mockResolvedValue({
        EncProductCatalog: {
          cell: [{
            name: ['US5CA52M'],
            lname: ['San Francisco Bay'],
            cscale: ['40000'],
            status: ['Active'],
            edtn: ['25'],
            updn: ['10'],
            uadt: ['20240115'],
            isdt: ['20230101'],
            zipfile_location: ['https://www.charts.noaa.gov/ENCs/US5CA52M.zip'],
            zipfile_size: ['1048576'],
            cov: [{
              panel: [{
                vertex: [
                  { lat: ['37.7'], long: ['-122.5'] },
                  { lat: ['37.8'], long: ['-122.5'] },
                  { lat: ['37.8'], long: ['-122.4'] },
                  { lat: ['37.7'], long: ['-122.4'] }
                ]
              }]
            }]
          }]
        }
      });

      const catalog = await service.getCatalog();

      expect(catalog).toHaveLength(1);
      expect(catalog[0].name).toBe('US5CA52M');
      expect(catalog[0].longName).toBe('San Francisco Bay');
      expect(catalog[0].scale).toBe(40000);
      expect(catalog[0].coverage.minLat).toBe(37.7);
      expect(catalog[0].coverage.maxLat).toBe(37.8);
    });

    it('should use cached catalog when available', async () => {
      const cachedData = [{
        name: 'US5CA52M',
        longName: 'Cached Chart',
        scale: 40000,
        coverage: { minLat: 37.7, maxLat: 37.8, minLon: -122.5, maxLon: -122.4, vertices: [] }
      }];

      mockFs.stat.mockResolvedValue({ mtimeMs: Date.now() - 1000, mtime: new Date() } as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(cachedData) as any);

      const catalog = await service.getCatalog();

      expect(catalog[0].longName).toBe('Cached Chart');
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it('should force refresh when requested', async () => {
      mockAxios.get.mockResolvedValue({ data: mockCatalogXML });
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      (parseStringPromise as jest.MockedFunction<typeof parseStringPromise>).mockResolvedValue({
        EncProductCatalog: {
          cell: [{
            name: ['US5CA52M'],
            lname: ['San Francisco Bay'],
            cscale: ['40000'],
            status: ['Active'],
            cov: [{
              panel: [{
                vertex: [
                  { lat: ['37.7'], long: ['-122.5'] },
                  { lat: ['37.8'], long: ['-122.5'] },
                  { lat: ['37.8'], long: ['-122.4'] },
                  { lat: ['37.7'], long: ['-122.4'] }
                ]
              }]
            }]
          }]
        }
      });

      await service.getCatalog(true);

      expect(mockAxios.get).toHaveBeenCalled();
    });
  });

  describe('findChartsByCoordinates', () => {
    it('should find charts containing coordinates', async () => {
      const mockCharts = [{
        name: 'US5CA52M',
        longName: 'San Francisco Bay',
        scale: 40000,
        status: 'Active',
        coverage: {
          minLat: 37.7,
          maxLat: 37.8,
          minLon: -122.5,
          maxLon: -122.4,
          vertices: [
            { lat: 37.7, lon: -122.5 },
            { lat: 37.8, lon: -122.5 },
            { lat: 37.8, lon: -122.4 },
            { lat: 37.7, lon: -122.4 }
          ]
        }
      }];

      jest.spyOn(service, 'getCatalog').mockResolvedValue(mockCharts as any);

      const results = await service.findChartsByCoordinates(37.75, -122.45);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('US5CA52M');
    });

    it('should exclude charts not containing coordinates', async () => {
      const mockCharts = [{
        name: 'US5CA52M',
        coverage: {
          minLat: 37.7,
          maxLat: 37.8,
          minLon: -122.5,
          maxLon: -122.4,
          vertices: []
        }
      }];

      jest.spyOn(service, 'getCatalog').mockResolvedValue(mockCharts as any);

      const results = await service.findChartsByCoordinates(40.0, -120.0);
      expect(results).toHaveLength(0);
    });
  });

  describe('findChartsByBounds', () => {
    it('should find charts intersecting bounds', async () => {
      const mockCharts = [{
        name: 'US5CA52M',
        coverage: {
          minLat: 37.7,
          maxLat: 37.8,
          minLon: -122.5,
          maxLon: -122.4
        }
      }, {
        name: 'US5CA53M',
        coverage: {
          minLat: 40.0,
          maxLat: 41.0,
          minLon: -124.0,
          maxLon: -123.0
        }
      }];

      jest.spyOn(service, 'getCatalog').mockResolvedValue(mockCharts as any);

      const results = await service.findChartsByBounds({
        minLat: 37.6,
        maxLat: 37.9,
        minLon: -122.6,
        maxLon: -122.3
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('US5CA52M');
    });
  });

  describe('findChartById', () => {
    it('should find chart by ID', async () => {
      const mockCharts = [{
        name: 'US5CA52M',
        longName: 'San Francisco Bay'
      }];

      jest.spyOn(service, 'getCatalog').mockResolvedValue(mockCharts as any);

      const result = await service.findChartById('US5CA52M');
      expect(result?.name).toBe('US5CA52M');
    });

    it('should return null for non-existent chart', async () => {
      jest.spyOn(service, 'getCatalog').mockResolvedValue([]);

      const result = await service.findChartById('UNKNOWN');
      expect(result).toBeNull();
    });
  });

  describe('selectBestChart', () => {
    const charts = [{
      name: 'US5CA52M',
      scale: 80000,
      status: 'Active'
    }, {
      name: 'US5CA53M',
      scale: 40000,
      status: 'Active'
    }, {
      name: 'US5CA54M',
      scale: 20000,
      status: 'Active'
    }];

    it('should select harbor chart when available', () => {
      const best = service.selectBestChart(charts as any, 37.75, -122.45);
      expect(best?.scale).toBe(20000);
    });

    it('should filter out inactive charts', () => {
      const chartsWithInactive = [...charts, { name: 'US5CA55M', scale: 10000, status: 'Inactive' }];
      const best = service.selectBestChart(chartsWithInactive as any, 37.75, -122.45);
      expect(best?.scale).toBe(20000);
    });

    it('should return null for empty list', () => {
      const best = service.selectBestChart([], 37.75, -122.45);
      expect(best).toBeNull();
    });
  });

  describe('convertToChartMetadata', () => {
    it('should convert catalog chart to metadata format', () => {
      const catalogChart = {
        name: 'US5CA52M',
        longName: 'San Francisco Bay',
        scale: 40000,
        edition: '25',
        updateDate: '2024-01-15',
        coverage: {
          minLat: 37.7,
          maxLat: 37.8,
          minLon: -122.5,
          maxLon: -122.4,
          vertices: []
        },
        zipfileLocation: 'https://example.com/chart.zip',
        zipfileSize: 1048576,
        status: 'Active'
      };

      const metadata = service.convertToChartMetadata(catalogChart as any);

      expect(metadata.id).toBe('US5CA52M');
      expect(metadata.name).toBe('San Francisco Bay');
      expect(metadata.scale).toBe(40000);
      expect(metadata.bounds).toEqual({
        minLat: 37.7,
        maxLat: 37.8,
        minLon: -122.5,
        maxLon: -122.4
      });
    });
  });

  describe('clearCache', () => {
    it('should clear cache', async () => {
      mockFs.unlink.mockResolvedValue(undefined);

      await service.clearCache();

      expect(mockFs.unlink).toHaveBeenCalledWith('/test/cache/enc-catalog.json');
    });
  });
});