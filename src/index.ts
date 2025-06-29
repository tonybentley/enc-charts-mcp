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
import { DatabaseManager } from './database/DatabaseManager.js';
import { ChartRepository } from './database/repositories/ChartRepository.js';
import { NavigationFeatureRepository } from './database/repositories/NavigationFeatureRepository.js';
import { initializeDatabase, getDatabaseStatus } from './database/init.js';
import { setDatabaseRepositories } from './services/serviceInitializer.js';

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

// Initialize database manager (optional - tools work without it but with enhanced functionality with it)
let dbManager: DatabaseManager | undefined;
let chartRepository: ChartRepository | undefined;
let featureRepository: NavigationFeatureRepository | undefined;

// Initialize database with robust error handling
const dbInit = initializeDatabase({
  memory: false,
  dataDir: process.env.ENC_CACHE_DIR || './cache/database',
  verbose: process.env.NODE_ENV !== 'production'
});

if (dbInit.dbManager) {
  dbManager = dbInit.dbManager;
  chartRepository = dbInit.chartRepository;
  featureRepository = dbInit.featureRepository;
  
  // Set database repositories in service initializer
  setDatabaseRepositories(chartRepository, featureRepository);
  
  // Log initialization status (only in development)
  if (process.env.NODE_ENV !== 'production') {
    getDatabaseStatus(dbManager).then(status => {
      if (status.isOpen) {
        process.stderr.write(`[Database] SQLite ${status.sqliteVersion} initialized successfully\n`);
        process.stderr.write(`[Database] Tables: charts=${status.tableStats.charts}, features=${status.tableStats.features}\n`);
      }
    }).catch(() => {
      // Ignore errors in status logging
    });
  }
} else if (dbInit.error) {
  // Log error but continue - server can work without database
  if (process.env.NODE_ENV !== 'production') {
    process.stderr.write(`[Database] Initialization failed: ${dbInit.error.message}\n`);
    process.stderr.write(`[Database] Running in file-based mode\n`);
  }
}

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
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 20,
          description: 'Maximum number of features to return (default: 20, max: 50)',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          default: 0,
          description: 'Number of features to skip for pagination (default: 0)',
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
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 50,
          description: 'Maximum number of charts to return (default: 50, max: 100)',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          default: 0,
          description: 'Number of charts to skip for pagination (default: 0)',
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
  {
    name: 'get_database_status',
    description: 'Check the status of the database connection and available data',
    inputSchema: {
      type: 'object',
      properties: {},
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
        return await getChartHandler(args, dbManager, chartRepository, featureRepository);
      case 'search_charts':
        return await searchChartsHandler(args, dbManager, chartRepository);
      case 'get_chart_metadata':
        return await getChartMetadataHandler(args, dbManager, chartRepository);
      // case 'calculate_route':
      //   return await calculateRouteHandler(args);
      case 'get_object_classes':
        return await getObjectClassesHandler(args);
      case 'get_database_status': {
        const status = await getDatabaseStatus(dbManager || new DatabaseManager({ memory: true }));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                database: {
                  isOpen: status.isOpen,
                  sqliteVersion: status.sqliteVersion,
                  memoryUsage: status.memoryUsage,
                  tables: status.tableStats,
                  totalSize: status.totalSize,
                  mode: dbManager ? 'file-based' : 'fallback',
                },
                environment: {
                  ENC_CACHE_DIR: process.env.ENC_CACHE_DIR || 'Not set',
                  NODE_ENV: process.env.NODE_ENV || 'Not set',
                },
                initialization: dbInit.error ? {
                  error: dbInit.error.message
                } : 'Success'
              }, null, 2),
            },
          ],
        };
      }
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

main().catch(() => {
  // Exit silently on error to avoid corrupting JSON-RPC stream
  process.exit(1);
});