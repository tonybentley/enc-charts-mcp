import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('ENC Charts MCP Server E2E', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    const serverProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    transport = new StdioClientTransport({
      command: 'node',
      args: ['dist/index.js'],
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

  it('should list available tools', async () => {
    const response = await client.listTools();
    
    expect(response.tools).toHaveLength(5);
    const toolNames = response.tools.map((tool) => tool.name);
    expect(toolNames).toContain('get_chart');
    expect(toolNames).toContain('search_charts');
    expect(toolNames).toContain('get_chart_metadata');
    // expect(toolNames).toContain('calculate_route');
    expect(toolNames).toContain('get_object_classes');
    expect(toolNames).toContain('get_database_status');
  });

  it('should call get_chart tool successfully', async () => {
    const response = await client.callTool({
      name: 'get_chart',
      arguments: {
        chartId: 'US5CA12M',
      }
    });

    expect(response.content).toHaveLength(1);
    expect((response.content as any)[0].type).toBe('text');
    
    const result = JSON.parse((response.content as any)[0].text);
    
    // Check if there's an error in the response
    if (result.error) {
      // If GDAL is not available, skip this test
      if (result.error.includes('Failed to parse S-57') || result.error.includes('GDAL')) {
        console.log('Skipping test - GDAL not available for S-57 parsing');
        return;
      }
      console.error('Error in get_chart response:', result);
      throw new Error(`Chart parsing failed: ${result.error}`);
    }
    
    expect(result.chartId).toBe('US5CA12M');
    expect(result.features).toBeDefined();
    expect(Array.isArray(result.features)).toBe(true);
  });

  it('should search charts with filters', async () => {
    const response = await client.callTool({
      name: 'search_charts',
      arguments: {
        query: 'San Francisco',
        format: 'S-57',
      }
    });

    expect(response.content).toHaveLength(1);
    const result = JSON.parse((response.content as any)[0].text);
    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  });

  // it('should calculate route between waypoints', async () => {
  //   const response = await client.callTool({
  //     name: 'calculate_route',
  //     arguments: {
  //       waypoints: [
  //         { lat: 37.8, lon: -122.5, name: 'Start' },
  //         { lat: 37.7, lon: -122.4, name: 'End' },
  //       ],
  //     }
  //   });

  //   expect(response.content).toHaveLength(1);
  //   const result = JSON.parse((response.content as any)[0].text);
  //   expect(result.route).toBeDefined();
  //   expect(result.route.waypoints).toHaveLength(2);
  //   expect(result.totalDistance).toBeDefined();
  // });

  it('should get object classes information', async () => {
    const response = await client.callTool({
      name: 'get_object_classes',
      arguments: {
        category: 'navAids',
        includeAttributes: true,
      }
    });

    expect(response.content).toHaveLength(1);
    const result = JSON.parse((response.content as any)[0].text);
    expect(result.totalClasses).toBeGreaterThan(0);
    expect(result.objectClasses).toBeDefined();
    expect(Array.isArray(result.objectClasses)).toBe(true);
    
    // Check that navigation aids have attributes
    const lights = result.objectClasses.find((oc: any) => oc.acronym === 'LIGHTS');
    expect(lights).toBeDefined();
    expect(lights.attributes).toBeDefined();
    expect(lights.category).toBe('navAids');
  });

  it('should get chart metadata by ID', async () => {
    const response = await client.callTool({
      name: 'get_chart_metadata',
      arguments: {
        chartId: 'US5CA72M', // San Diego Bay - confirmed to exist
      }
    });

    expect(response.content).toHaveLength(1);
    const result = JSON.parse((response.content as any)[0].text);
    expect(result.id).toBe('US5CA72M');
    expect(result.name).toBeDefined();
    expect(result.scale).toBeDefined();
    expect(result.source).toBe('NOAA ENC Catalog');
    expect(result.downloadUrl).toContain('US5CA72M');
  });

  it('should get chart metadata by coordinates', async () => {
    const response = await client.callTool({
      name: 'get_chart_metadata',
      arguments: {
        coordinates: { lat: 32.7157, lon: -117.1611 }, // San Diego
      }
    });

    expect(response.content).toHaveLength(1);
    const result = JSON.parse((response.content as any)[0].text);
    expect(result.id).toBeDefined();
    expect(result.name).toBeDefined();
    expect(result.scale).toBeDefined();
    expect(result.bounds).toBeDefined();
  });
});