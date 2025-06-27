# E2E Tests Status

## Test Files
All E2E tests are now consolidated in `/tests/` directory with `.e2e.spec.ts` extension:

1. **chartDownload.e2e.spec.ts** - Tests chart download functionality
2. **chartIntegration.e2e.spec.ts** - Tests integration between services  
3. **mcpProtocol.e2e.spec.ts** - Tests MCP JSON-RPC protocol
4. **pagination.e2e.spec.ts** - Tests pagination functionality
5. **searchCharts.e2e.spec.ts** - Tests chart search functionality
6. **server.e2e.spec.ts** - Tests MCP server through client

## Known Issues

### GDAL Dependency
Several tests require GDAL Python bindings to parse S-57 chart files. Without GDAL installed:
- Chart parsing will fail
- Tests that depend on parsed chart data will fail

To install GDAL:
```bash
# macOS
brew install gdal
pip install GDAL==$(gdal-config --version)

# Linux
sudo apt-get install gdal-bin python3-gdal

# Or use conda
conda install -c conda-forge gdal
```

### Test Fixes Applied
1. Fixed import paths (changed from `../../src` to `../src`)
2. Added TypeScript type annotations for implicit any types
3. Fixed TypeScript errors for ES modules
4. Added null safety operators for child process streams
5. Updated test cache directories to use temporary locations
6. Consolidated all tests into single `/tests/` directory

### Running Tests
```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx jest tests/server.e2e.spec.ts

# Run with debug output
DEBUG=1 npm run test:e2e
```

## Test Status
- ✅ Tests are properly organized and named
- ✅ Import paths are fixed
- ✅ TypeScript errors are resolved
- ⚠️  GDAL dependency may cause failures if not installed
- ⚠️  Some tests may need mocking for CI environments without GDAL