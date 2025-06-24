# ENC Charts MCP Server

An MCP (Model Context Protocol) server for Electronic Navigational Charts (ENC) data, supporting S-57 and S-101 formats.

## Features

- **Chart Data Retrieval**: Get chart features for specific areas
- **Chart Search**: Search charts by name, scale, format, and geographic area
- **Metadata Access**: Retrieve detailed information about specific charts
- **Route Calculation**: Calculate navigation routes between waypoints

## Installation

### From Repository

```bash
# Clone the repository
git clone https://github.com/tonybentley/enc-charts-mcp.git
cd enc-charts-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Claude Desktop Integration

### Configuration

To use this MCP server with Claude Desktop, you need to add it to your Claude Desktop configuration:

1. Open Claude Desktop settings
2. Navigate to the "Developer" section
3. Add the following to your MCP servers configuration:

```json
{
  "mcpServers": {
    "enc-charts": {
      "command": "node",
      "args": ["/path/to/enc-charts-mcp/dist/index.js"],
      "transport": {
        "type": "stdio"
      },
      "env": {
        "ENC_CACHE_DIR": "/path/to/your/cache/directory"
      }
    }
  }
}
```

**Important**: Replace `/path/to/enc-charts-mcp` with the absolute path to your cloned repository.

### Platform-Specific Paths

#### macOS/Linux
```json
{
  "mcpServers": {
    "enc-charts": {
      "command": "node",
      "args": ["/Users/yourname/Projects/enc-charts-mcp/dist/index.js"],
      "transport": {
        "type": "stdio"
      },
      "env": {
        "ENC_CACHE_DIR": "/Users/yourname/.enc-charts/cache"
      }
    }
  }
}
```

#### Windows
```json
{
  "mcpServers": {
    "enc-charts": {
      "command": "node",
      "args": ["C:\\Users\\yourname\\Projects\\enc-charts-mcp\\dist\\index.js"],
      "transport": {
        "type": "stdio"
      },
      "env": {
        "ENC_CACHE_DIR": "C:\\Users\\yourname\\AppData\\Local\\enc-charts\\cache"
      }
    }
  }
}
```

### Development Mode

For active development with hot reload:

```json
{
  "mcpServers": {
    "enc-charts-dev": {
      "command": "npx",
      "args": ["tsx", "/path/to/enc-charts-mcp/src/index.ts"],
      "transport": {
        "type": "stdio"
      },
      "env": {
        "ENC_CACHE_DIR": "/path/to/your/cache/directory",
        "NODE_ENV": "development"
      }
    }
  }
}
```

This allows you to make changes to the TypeScript source without rebuilding.

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Build the project
npm run build

# Run tests
npm test
npm run test:unit    # Unit tests only (.spec.ts)
npm run test:e2e     # E2E tests only (.e2e.spec.ts)

# Linting and formatting
npm run lint
npm run lint:fix
npm run format
npm run typecheck
```

## Usage

### Starting the Server

```bash
npm start
```

The server runs on stdio and implements the MCP protocol.

### Available Tools

#### `get_chart`
Retrieve chart data for a specific area.

Parameters:
- `chartId` (required): The unique identifier of the chart
- `boundingBox` (optional): Filter features by geographic bounds

#### `search_charts`
Search available charts by various criteria.

Parameters:
- `query` (optional): Search by chart name or producer
- `scale` (optional): Filter by scale range
- `boundingBox` (optional): Search within geographic area
- `format` (optional): Filter by format (S-57 or S-101)

#### `get_chart_metadata`
Get detailed information about a specific chart.

Parameters:
- `chartId` (required): The unique identifier of the chart

#### `calculate_route`
Calculate navigation route between waypoints.

Parameters:
- `waypoints` (required): Array of waypoints (minimum 2)
- `avoidAreas` (optional): Areas to avoid in route calculation

## Project Structure

```
enc-charts-mcp/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── handlers/          # Request handlers for each tool
│   ├── utils/             # Utility functions
│   └── types/             # TypeScript type definitions
├── tests/                 # E2E test files
└── data/                  # Chart data storage (if applicable)
```

## Testing

Tests are organized as:
- `*.spec.ts` - Unit tests for individual components
- `*.e2e.spec.ts` - End-to-end tests for the MCP server

## Future Enhancements

- Implement actual chart data parsing (S-57/S-101 formats)
- Add database integration for chart storage
- Implement spatial indexing for performance
- Add chart data streaming for large datasets
- Support for additional ENC formats
- Advanced route calculation with hazard avoidance

## Troubleshooting

### Claude Desktop Issues

#### Server Not Appearing in Claude
1. Ensure the project is built: `npm run build`
2. Check that the path in your configuration is absolute, not relative
3. Restart Claude Desktop after configuration changes

#### Permission Errors
On macOS/Linux, ensure the built file is executable:
```bash
chmod +x dist/index.js
```

#### Cache Directory Issues
- Ensure the cache directory exists and is writable
- Use an absolute path for `ENC_CACHE_DIR`
- Create the directory if it doesn't exist:
  ```bash
  mkdir -p ~/.enc-charts/cache
  ```

#### Development Mode Not Working
1. Ensure `tsx` is installed: `npm install -D tsx`
2. Check that npx can find tsx: `npx tsx --version`
3. Use the full path to src/index.ts

### Common Error Messages

- **"Cannot find module"**: Run `npm install` and `npm run build`
- **"EACCES: permission denied"**: Check file permissions and cache directory ownership
- **"ENOENT: no such file or directory"**: Verify all paths in configuration are correct

## License

ISC