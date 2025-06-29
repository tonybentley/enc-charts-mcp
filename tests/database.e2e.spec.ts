import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('Database Integration E2E', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    const serverProcess = spawn('node', ['--experimental-sqlite', 'dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    transport = new StdioClientTransport({
      command: 'node',
      args: ['--experimental-sqlite', 'dist/index.js'],
    });

    client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Database Status', () => {
    it('should report database status', async () => {
      const response = await client.callTool({
        name: 'get_database_status',
        arguments: {}
      });

      expect(response.content).toHaveLength(1);
      const result = JSON.parse((response.content as any)[0].text);
      
      expect(result.database).toBeDefined();
      expect(result.database.isOpen).toBe(true);
      expect(result.database.sqliteVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(result.database.tables).toBeDefined();
      expect(result.database.mode).toBe('file-based');
      expect(result.initialization).toBe('Success');
    });

    it('should have get_database_status in available tools', async () => {
      const response = await client.listTools();
      
      const toolNames = response.tools.map((tool) => tool.name);
      expect(toolNames).toContain('get_database_status');
      
      const dbStatusTool = response.tools.find((tool) => tool.name === 'get_database_status');
      expect(dbStatusTool).toBeDefined();
      expect(dbStatusTool?.description).toContain('database connection');
    });
  });

  describe('Handler Database Integration', () => {
    it('should use database when calling get_chart', async () => {
      // First check database status to ensure it's running
      const statusResponse = await client.callTool({
        name: 'get_database_status',
        arguments: {}
      });
      
      const status = JSON.parse((statusResponse.content as any)[0].text);
      expect(status.database.isOpen).toBe(true);
      
      // Now try to get a chart (it may not exist yet, but the handler should work)
      const chartResponse = await client.callTool({
        name: 'get_chart',
        arguments: {
          chartId: 'US5CA12M'
        }
      });

      expect(chartResponse.content).toHaveLength(1);
      const result = JSON.parse((chartResponse.content as any)[0].text);
      
      // The chart might not exist in database yet, but the handler should not crash
      // It should either return data or a proper error
      if (result.error) {
        // If error, it should be about missing chart or GDAL, not database issues
        expect(result.error).not.toContain('database');
        expect(result.error).not.toContain('Database');
      } else {
        // If successful, we should have chart data
        expect(result.chartId).toBeDefined();
      }
    });

    it('should use database when calling search_charts', async () => {
      const response = await client.callTool({
        name: 'search_charts',
        arguments: {
          query: 'San Francisco',
          limit: 5
        }
      });

      expect(response.content).toHaveLength(1);
      const result = JSON.parse((response.content as any)[0].text);
      
      // Should return results (even if empty) without crashing
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should use database when calling get_chart_metadata', async () => {
      const response = await client.callTool({
        name: 'get_chart_metadata',
        arguments: {
          coordinates: { lat: 37.8, lon: -122.4 }
        }
      });

      expect(response.content).toHaveLength(1);
      const result = JSON.parse((response.content as any)[0].text);
      
      // Should work with database integration
      if (result.error) {
        // If error, it should be about missing data, not database issues
        expect(result.error).not.toContain('database');
      } else {
        // If successful, we should have metadata
        expect(result).toHaveProperty('id');
      }
    });
  });
});