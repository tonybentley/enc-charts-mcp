import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getChartHandler } from './handlers/getChart.js';
import { searchChartsHandler } from './handlers/searchCharts.js';
import { getChartMetadataHandler } from './handlers/getChartMetadata.js';
// import { calculateRouteHandler } from './handlers/calculateRoute.js';
import { getObjectClassesHandler } from './handlers/getObjectClasses.js';

const server = new Server(
  {
    name: 'enc-charts-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const TOOLS: Tool[] = [
  {
    name: 'get_chart',
    description: 'Retrieve chart data for a specific area by chart ID or coordinates',
    inputSchema: {
      type: 'object',
      properties: {
        chartId: {
          type: 'string',
          description: 'The unique identifier of the chart',
        },
        coordinates: {
          type: 'object',
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lon: { type: 'number', minimum: -180, maximum: 180 },
          },
          required: ['lat', 'lon'],
          description: 'GPS coordinates to find chart for',
        },
        boundingBox: {
          type: 'object',
          properties: {
            minLat: { type: 'number' },
            maxLat: { type: 'number' },
            minLon: { type: 'number' },
            maxLon: { type: 'number' },
          },
          description: 'Optional bounding box to filter chart data',
        },
        featureTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'S-57 object classes to include (e.g., DEPARE, LIGHTS)',
        },
        depthRange: {
          type: 'object',
          properties: {
            min: { type: 'number' },
            max: { type: 'number' },
          },
          description: 'Filter features by depth range in meters',
        },
        includeNearby: {
          type: 'boolean',
          description: 'Include features within reasonable distance of coordinates',
        },
      },
      oneOf: [
        { required: ['chartId'] },
        { required: ['coordinates'] },
      ],
    },
  },
  {
    name: 'search_charts',
    description: 'Search available charts by criteria',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for chart name or producer',
        },
        scale: {
          type: 'object',
          properties: {
            min: { type: 'number' },
            max: { type: 'number' },
          },
          description: 'Scale range to filter charts',
        },
        boundingBox: {
          type: 'object',
          properties: {
            minLat: { type: 'number' },
            maxLat: { type: 'number' },
            minLon: { type: 'number' },
            maxLon: { type: 'number' },
          },
          description: 'Geographic area to search within',
        },
        format: {
          type: 'string',
          enum: ['S-57', 'S-101'],
          description: 'Chart format filter',
        },
      },
    },
  },
  {
    name: 'get_chart_metadata',
    description: 'Get information about a specific chart by ID or coordinates',
    inputSchema: {
      type: 'object',
      properties: {
        chartId: {
          type: 'string',
          description: 'The unique identifier of the chart',
        },
        coordinates: {
          type: 'object',
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lon: { type: 'number', minimum: -180, maximum: 180 },
          },
          required: ['lat', 'lon'],
          description: 'GPS coordinates to find chart for',
        },
      },
      oneOf: [
        { required: ['chartId'] },
        { required: ['coordinates'] },
      ],
    },
  },
  // {
  //   name: 'calculate_route',
  //   description: 'Calculate navigation route between waypoints',
  //   inputSchema: {
  //     type: 'object',
  //     properties: {
  //       waypoints: {
  //         type: 'array',
  //         items: {
  //           type: 'object',
  //           properties: {
  //             lat: { type: 'number' },
  //             lon: { type: 'number' },
  //             name: { type: 'string' },
  //           },
  //           required: ['lat', 'lon'],
  //         },
  //         minItems: 2,
  //         description: 'List of waypoints for the route',
  //       },
  //       checkHazards: {
  //         type: 'boolean',
  //         description: 'Check for navigation hazards along the route',
  //       },
  //       minDepth: {
  //         type: 'number',
  //         description: 'Minimum safe depth in meters for the vessel',
  //       },
  //       avoidAreas: {
  //         type: 'array',
  //         items: { type: 'string' },
  //         description: 'S-57 area types to avoid (e.g., RESARE, PRCARE)',
  //       },
  //     },
  //     required: ['waypoints'],
  //   },
  // },
  {
    name: 'get_object_classes',
    description: 'Get information about S-57 object classes and their representations',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['navAids', 'depths', 'areas', 'infrastructure', 'natural', 'administrative', 'hazards', 'traffic', 'services', 'signals', 'other'],
          description: 'Filter by category',
        },
        search: {
          type: 'string',
          description: 'Search by acronym or description',
        },
        includeAttributes: {
          type: 'boolean',
          description: 'Include standard attributes for each class',
        },
      },
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_chart':
        return await getChartHandler(args);
      case 'search_charts':
        return await searchChartsHandler(args);
      case 'get_chart_metadata':
        return await getChartMetadataHandler(args);
      // case 'calculate_route':
      //   return await calculateRouteHandler(args);
      case 'get_object_classes':
        return await getObjectClassesHandler(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is running - no console output to avoid interfering with JSON-RPC
}

main().catch((error) => {
  // Exit silently on error to avoid corrupting JSON-RPC stream
  process.exit(1);
});