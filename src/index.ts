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
import { extractCoastlinesHandler } from './handlers/extractCoastlines.js';
import { getWaterLandClassificationHandler } from './handlers/getWaterLandClassification.js';
import { executeQueryHandler } from './handlers/executeQuery.js';
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
  setDatabaseRepositories(chartRepository, featureRepository, dbManager);
  
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
  {
    name: 'extract_coastlines',
    description: 'Extract and process coastlines from a single ENC chart with automatic stitching and classification',
    inputSchema: {
      type: 'object',
      properties: {
        chartId: {
          type: 'string',
          description: 'Direct chart identifier (e.g., "US5CA12M")',
        },
        coordinates: {
          type: 'object',
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lon: { type: 'number', minimum: -180, maximum: 180 },
          },
          required: ['lat', 'lon'],
          description: 'GPS coordinates for automatic chart selection',
        },
        extractionMethod: {
          type: 'string',
          enum: ['explicit', 'derived', 'combined'],
          default: 'combined',
          description: 'Method for extracting coastlines',
        },
        featureSources: {
          type: 'object',
          properties: {
            useCoastlines: { type: 'boolean', default: true },
            useDepthAreas: { type: 'boolean', default: true },
            useLandAreas: { type: 'boolean', default: true },
            useShorelineConstruction: { type: 'boolean', default: true },
          },
          description: 'Feature types to use for coastline extraction',
        },
        stitching: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            tolerance: { type: 'number', default: 10 },
            mergeConnected: { type: 'boolean', default: true },
          },
          description: 'Options for connecting coastline segments',
        },
        simplification: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: false },
            tolerance: { type: 'number', default: 5 },
            preserveTopology: { type: 'boolean', default: true },
          },
          description: 'Douglas-Peucker simplification options',
        },
        classification: {
          type: 'object',
          properties: {
            separateByType: { type: 'boolean', default: true },
            includeMetadata: { type: 'boolean', default: true },
          },
          description: 'Classification and metadata options',
        },
        boundingBox: {
          type: 'object',
          properties: {
            minLat: { type: 'number' },
            maxLat: { type: 'number' },
            minLon: { type: 'number' },
            maxLon: { type: 'number' },
          },
          description: 'Area filter for coastline extraction',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          default: 100,
          description: 'Maximum features per response',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          default: 0,
          description: 'Skip N features for pagination',
        },
      },
      oneOf: [
        { required: ['chartId'] },
        { required: ['coordinates'] },
      ],
    },
  },
  {
    name: 'get_water_land_classification',
    description: 'Get comprehensive water/land classification with boundaries',
    inputSchema: {
      type: 'object',
      properties: {
        chartId: {
          type: 'string',
          description: 'Direct chart identifier (e.g., "US5CA12M")',
        },
        coordinates: {
          type: 'object',
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lon: { type: 'number', minimum: -180, maximum: 180 },
          },
          required: ['lat', 'lon'],
          description: 'GPS coordinates for automatic chart selection',
        },
        includeFeatures: {
          type: 'object',
          properties: {
            waterPolygons: { type: 'boolean', default: true },
            landPolygons: { type: 'boolean', default: true },
            coastlines: { type: 'boolean', default: true },
            navigationAreas: { type: 'boolean', default: false },
            dangers: { type: 'boolean', default: false },
          },
          description: 'Feature types to include in classification',
        },
        processing: {
          type: 'object',
          properties: {
            mergeAdjacentWater: { type: 'boolean', default: true },
            fillGaps: { type: 'boolean', default: true },
            smoothing: { type: 'boolean', default: false },
          },
          description: 'Processing options for water/land features',
        },
        boundingBox: {
          type: 'object',
          properties: {
            minLat: { type: 'number' },
            maxLat: { type: 'number' },
            minLon: { type: 'number' },
            maxLon: { type: 'number' },
          },
          description: 'Geographic area filter',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          default: 100,
          description: 'Maximum features per response',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          default: 0,
          description: 'Skip N features for pagination',
        },
      },
      oneOf: [
        { required: ['chartId'] },
        { required: ['coordinates'] },
      ],
    },
  },
  {
    name: 'execute_query',
    description: 'Execute SQL queries directly on the ENC chart database. Provides read-only access to chart metadata, features, and processing cache. Useful for custom analysis, debugging, and exploring the database structure.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL query to execute. Examples: "SELECT * FROM charts LIMIT 10", "SELECT COUNT(*) FROM chart_features WHERE object_class = \'COALNE\'", "SELECT chart_id, COUNT(*) as feature_count FROM chart_features GROUP BY chart_id"',
        },
        params: {
          type: 'array',
          items: {
            oneOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              { type: 'null' }
            ]
          },
          description: 'Optional parameters for parameterized queries (e.g., [\'US5CA72M\', 50] for "SELECT * FROM chart_features WHERE chart_id = ? LIMIT ?")',
        },
        readonly: {
          type: 'boolean',
          default: true,
          description: 'When true (default), prevents write operations for safety. Set to false only if you need to perform INSERT/UPDATE/DELETE operations.',
        },
      },
      required: ['query'],
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
      case 'extract_coastlines': {
        const result = await extractCoastlinesHandler(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      case 'get_water_land_classification': {
        const result = await getWaterLandClassificationHandler(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      case 'execute_query': {
        const result = await executeQueryHandler(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
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