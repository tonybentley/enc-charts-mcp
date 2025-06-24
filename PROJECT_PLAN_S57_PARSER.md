# Project Plan: Cross-Platform S-57 Parser Replacement

## Executive Summary
Replace the native `gdal-async` dependency with a cross-platform solution that maintains 100% API compatibility while eliminating compilation requirements and platform-specific issues.

## Testing Philosophy: Test-First Development

### Core Principles
1. **No Code Without Tests**: Every function, method, and feature must have tests written BEFORE implementation
2. **Tests as Specification**: Tests define the expected behavior and serve as living documentation
3. **Continuous Validation**: Every change must pass all tests before proceeding
4. **Fail Fast**: If tests fail, development stops until they pass

### Testing Hierarchy
1. **Unit Tests** (90%+ coverage required)
   - Test individual functions in isolation
   - Mock all external dependencies
   - Fast execution (<100ms per test)

2. **Integration Tests** (All public APIs)
   - Test component interactions
   - Use real implementations where possible
   - Validate data flow between components

3. **Comparison Tests** (100% compatibility)
   - Compare output with gdal-async byte-for-byte
   - Ensure zero breaking changes
   - Performance benchmarking

4. **E2E Tests** (Complete workflows)
   - Test real S-57 files from NOAA
   - Validate complete parsing pipeline
   - Cross-platform verification

## Current State Analysis

### Dependencies
- **gdal-async v3.11.0**: Native Node.js binding requiring GDAL system libraries
- **@types/gdal v0.9.6**: TypeScript definitions

### Usage Locations
- **Primary**: `src/services/s57Parser.ts` (396 lines)
- **Test**: `src/services/s57Parser.spec.ts` (mocked)
- **No other files** directly import gdal-async

### GDAL Functions Used
1. **File Operations**:
   - `gdal.openAsync(filePath)` - Opens S-57 files
   - Dataset metadata access

2. **Layer Operations**:
   - `dataset.layers.count()` - Get layer count
   - `dataset.layers.get(index)` - Access layers
   - `layer.setSpatialFilter()` - Spatial filtering
   - Async iteration over features

3. **Geometry Operations**:
   - Geometry type constants (wkbPoint, wkbLineString, etc.)
   - Coordinate transformation
   - Geometry property access (x, y, z)

4. **Feature Operations**:
   - `feature.getGeometry()` - Extract geometry
   - `feature.fields.toObject()` - Extract attributes

## Implementation Plan (Test-First Approach)

### Phase 0: GDAL Environment Validation (Pre-requisite)

#### 0.1 GitHub Actions for GDAL Detection
**Create `.github/workflows/gdal-detection.yml`:**
```yaml
name: GDAL Detection Test
on: [push, pull_request]

jobs:
  test-detection:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        python-version: [3.8, 3.9, 3.10, 3.11]
    runs-on: ${{ matrix.os }}
    
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}
    
    - name: Test GDAL Detection
      run: |
        python src/parsers/detect_gdal.py
        
    - name: Report Detection Results
      if: always()
      run: |
        echo "OS: ${{ matrix.os }}"
        echo "Python: ${{ matrix.python-version }}"
        cat gdal_detection_report.json
```

#### 0.2 GDAL Auto-Installation Validation
**Create `.github/workflows/gdal-installation.yml`:**
```yaml
name: GDAL Auto-Installation Test
on: [push, pull_request]

jobs:
  test-installation:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        scenario: [no-gdal, partial-gdal, wrong-version]
    runs-on: ${{ matrix.os }}
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Simulate ${{ matrix.scenario }}
      run: |
        # Remove or misconfigure GDAL based on scenario
        
    - name: Test Auto-Installation
      run: |
        python src/parsers/install_gdal.py --auto
        
    - name: Verify Installation
      run: |
        python -c "from osgeo import gdal; print(gdal.__version__)"
        ogrinfo --version
```

#### 0.3 Environment Detection Implementation
**First, write detection tests:**
```typescript
// environment.spec.ts
describe('GDAL Environment Detection', () => {
  it('should detect GDAL Python bindings', async () => {
    const result = await environment.detectGDAL();
    expect(result.pythonBindings).toBeDefined();
  });
  
  it('should detect GDAL command-line tools', async () => {
    const result = await environment.detectGDAL();
    expect(result.commandLineTools).toContain('ogrinfo');
  });
  
  it('should provide installation instructions when missing', async () => {
    const result = await environment.detectGDAL();
    if (!result.isComplete) {
      expect(result.installInstructions).toBeDefined();
    }
  });
  
  it('should auto-install when requested', async () => {
    const result = await environment.autoInstall();
    expect(result.success).toBe(true);
  });
});
```

#### 0.4 GDAL Environment Implementation Strategy

**Environment Module (`src/parsers/environment.ts`):**
```typescript
export class GDALEnvironment {
  // Detection capabilities
  async detect(): Promise<GDALDetectionResult> {
    return {
      pythonBindings: await this.detectPythonBindings(),
      commandLineTools: await this.detectCommandLineTools(),
      version: await this.detectVersion(),
      isComplete: false, // Set based on detection
      missingComponents: [],
      installInstructions: {}
    };
  }

  // Auto-installation
  async autoInstall(): Promise<InstallationResult> {
    const platform = process.platform;
    switch(platform) {
      case 'darwin': return this.installMacOS();
      case 'linux': return this.installLinux();
      case 'win32': return this.installWindows();
    }
  }

  // Platform-specific installation
  private async installMacOS(): Promise<InstallationResult> {
    // Try: brew, conda, pip
  }

  private async installLinux(): Promise<InstallationResult> {
    // Try: apt-get, yum, conda, pip
  }

  private async installWindows(): Promise<InstallationResult> {
    // Try: conda, OSGeo4W, pip
  }
}
```

**Python Detection Script (`src/parsers/detect_gdal.py`):**
```python
#!/usr/bin/env python3
import json
import sys
import subprocess

def detect_gdal():
    """Detect GDAL installation and capabilities"""
    result = {
        "python_bindings": False,
        "version": None,
        "gdal_data": None,
        "command_line_tools": [],
        "errors": []
    }
    
    # Test Python bindings
    try:
        from osgeo import gdal, ogr
        result["python_bindings"] = True
        result["version"] = gdal.__version__
        result["gdal_data"] = gdal.GetConfigOption('GDAL_DATA')
    except ImportError as e:
        result["errors"].append(f"Python bindings not found: {e}")
    
    # Test command-line tools
    for tool in ['ogrinfo', 'ogr2ogr', 'gdalinfo']:
        try:
            subprocess.run([tool, '--version'], 
                         capture_output=True, check=True)
            result["command_line_tools"].append(tool)
        except:
            result["errors"].append(f"Tool {tool} not found")
    
    return result

if __name__ == "__main__":
    result = detect_gdal()
    with open('gdal_detection_report.json', 'w') as f:
        json.dump(result, f, indent=2)
    
    # Exit with error if incomplete
    if not result["python_bindings"] or len(result["command_line_tools"]) < 2:
        sys.exit(1)
```

**Continuous Feedback Loop:**
1. **Push to Branch** → Triggers GitHub Actions
2. **GDAL Detection** → Reports what's found/missing
3. **Auto-Installation** → Attempts to fix missing components
4. **Re-Detection** → Validates installation worked
5. **Results Upload** → Creates artifact for debugging
6. **Matrix Results** → Shows which OS/Python combos work
7. **Fail Fast** → Stops if environment not ready

**Validation Gate**: GDAL detection must work on all target platforms before proceeding

### Phase 1: Infrastructure Setup with Testing

#### 1.1 Test-Driven Directory Structure
```
src/
├── parsers/
│   ├── s57-adapter.ts          # Main gdal-async replacement
│   ├── s57-adapter.spec.ts     # Tests MUST pass before proceeding
│   ├── gdal-bridge.ts          # Subprocess management
│   ├── gdal-bridge.spec.ts     # Tests for subprocess handling
│   ├── data-transformer.ts     # Data format conversion
│   ├── data-transformer.spec.ts # Tests for data transformation
│   └── environment.ts          # GDAL detection/setup
│   └── environment.spec.ts     # Tests for environment detection
└── python/
    ├── s57_parser.py           # Python GDAL script
    └── test_s57_parser.py      # Python unit tests
.github/
└── workflows/
    ├── gdal-detection.yml      # Test GDAL detection on all platforms
    └── gdal-installation.yml   # Test auto-installation capabilities
```

#### 1.2 Python Parser Script (Test-First)
**Step 1: Write Tests First**
```python
# test_s57_parser.py
def test_open_s57_file():
    """Test that parser can open valid S-57 file"""
    
def test_extract_layers():
    """Test layer extraction returns correct count and names"""
    
def test_coordinate_transformation():
    """Test WGS84 transformation is applied correctly"""
    
def test_geojson_output_format():
    """Test output matches expected GeoJSON structure"""
    
def test_error_handling():
    """Test graceful handling of invalid files"""
```

**Step 2: Implement to Pass Tests**
- Create S-57 parser that passes all tests
- Validate each feature against test cases
- No code moves forward without passing tests

**Validation Gate**: All Python tests must pass before proceeding

### Phase 2: Core Implementation (Test-Driven)

#### 2.1 S57 Adapter Tests First
**Step 1: Write Adapter Tests**
```typescript
// s57-adapter.spec.ts
describe('S57 Adapter', () => {
  it('should export all gdal-async constants', () => {
    expect(gdal.wkbPoint).toBe(1);
    expect(gdal.wkbLineString).toBe(2);
    // Test ALL constants used in codebase
  });

  it('should implement openAsync with same signature', async () => {
    const dataset = await gdal.openAsync('test.000');
    expect(dataset).toHaveProperty('layers');
  });

  it('should match exact gdal-async API surface', () => {
    // Verify every method/property exists
  });
});
```

**Step 2: Implement Adapter**
- Build adapter to pass all API compatibility tests
- Ensure 100% interface coverage

**Validation Gate**: Adapter tests must achieve 100% API coverage

#### 2.2 GDAL Bridge (Test-Driven)
**Step 1: Bridge Tests**
```typescript
// gdal-bridge.spec.ts
describe('GDAL Bridge', () => {
  it('should spawn Python process successfully', async () => {});
  it('should handle process errors gracefully', async () => {});
  it('should timeout long-running operations', async () => {});
  it('should clean up resources on exit', async () => {});
  it('should handle concurrent requests', async () => {});
});
```

**Step 2: Implement Bridge**
- Build subprocess management to pass all tests
- Verify error handling and resource cleanup

**Validation Gate**: All subprocess tests must pass

#### 2.3 Data Transformer (Test-Driven)
**Step 1: Transformer Tests**
```typescript
// data-transformer.spec.ts
describe('Data Transformer', () => {
  it('should convert Python geometry to gdal-async format', () => {
    const input = { type: 'Point', coordinates: [1, 2] };
    const output = transformer.convertGeometry(input);
    expect(output.x).toBe(1);
    expect(output.y).toBe(2);
  });

  it('should preserve all feature properties', () => {});
  it('should handle nested geometries correctly', () => {});
  it('should maintain numeric precision', () => {});
});
```

**Step 2: Implement Transformer**
- Build transformations to pass all format tests
- Validate against real gdal-async output

**Validation Gate**: 100% data format compatibility

### Phase 3: Integration Testing

#### 3.1 Pre-Integration Tests
**Step 1: Write Integration Tests**
```typescript
// tests/integration/s57-adapter-integration.spec.ts
describe('S57 Adapter Integration', () => {
  it('should parse real S-57 file identically to gdal-async', async () => {
    // Compare outputs between gdal-async and new adapter
    const gdalResult = await originalGdal.openAsync('test.000');
    const adapterResult = await newAdapter.openAsync('test.000');
    expect(adapterResult).toDeepEqual(gdalResult);
  });
});
```

**Step 2: Import Updates**
- Update imports ONLY after integration tests pass
- Keep gdal-async temporarily for comparison testing

**Validation Gate**: Output must be identical to gdal-async

#### 3.2 Regression Testing
**Before removing gdal-async:**
1. Run all existing tests with both implementations
2. Compare outputs byte-for-byte
3. Benchmark performance differences
4. Document any discrepancies

### Phase 4: Continuous Validation

#### 4.1 Test Coverage Requirements
- **Unit Tests**: Minimum 90% coverage per component
- **Integration Tests**: Cover all public APIs
- **E2E Tests**: Test complete workflows
- **Performance Tests**: Run on every change

#### 4.2 Testing Matrix
| Component | Unit Tests | Integration | E2E | Performance |
|-----------|------------|-------------|-----|-------------|
| Python Parser | ✓ | ✓ | ✓ | ✓ |
| S57 Adapter | ✓ | ✓ | ✓ | ✓ |
| GDAL Bridge | ✓ | ✓ | ✓ | ✓ |
| Data Transformer | ✓ | ✓ | ✓ | ✓ |

#### 4.3 Automated Testing Pipeline
```bash
# Run before EVERY commit
npm run test:unit        # Must pass 100%
npm run test:integration # Must pass 100%
npm run test:e2e        # Must pass 100%
npm run test:performance # Must meet benchmarks
```

#### 4.4 Cross-Platform CI/CD with Feedback Loop
**Primary CI Pipeline (`.github/workflows/main-ci.yml`):**
```yaml
name: Cross-Platform CI
on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  gdal-environment:
    name: GDAL Environment Validation
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        python: [3.8, 3.9, 3.10, 3.11]
        gdal: [3.0, 3.1, 3.2, 3.3]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v3
      
      # Test GDAL detection first
      - name: Test GDAL Detection
        run: npm run test:environment
        
      # Test auto-installation if needed
      - name: Test GDAL Installation
        if: failure()
        run: npm run gdal:install
        
      # Verify environment is ready
      - name: Validate Environment
        run: npm run gdal:validate

  unit-tests:
    needs: gdal-environment
    name: Unit Tests
    runs-on: ${{ matrix.os }}
    steps:
      - name: Run Unit Tests
        run: npm run test:unit

  integration-tests:
    needs: unit-tests
    name: Integration Tests
    runs-on: ${{ matrix.os }}
    steps:
      - name: Run Integration Tests
        run: npm run test:integration

  comparison-tests:
    needs: integration-tests
    name: gdal-async Comparison
    runs-on: ${{ matrix.os }}
    steps:
      - name: Install both implementations
        run: |
          npm install gdal-async  # Temporarily for comparison
          
      - name: Run Comparison Tests
        run: npm run test:comparison
        
      - name: Upload Diff Reports
        uses: actions/upload-artifact@v3
        with:
          name: comparison-reports-${{ matrix.os }}
          path: test-reports/comparison/
```

**Feedback Loop Implementation:**
1. Every push triggers full environment validation
2. Failed detection triggers auto-installation attempt
3. Installation results feed back into detection logic
4. Comparison reports show exact differences
5. Matrix testing ensures all platform combinations work

## Success Metrics

1. **API Compatibility**: 100% - No changes to consuming code
2. **Test Coverage**: All existing tests pass without modification
3. **Performance**: Within 10% of gdal-async performance
4. **Platform Support**: Works on Linux, macOS, Windows
5. **Installation**: No compilation required

## Risk Mitigation

1. **GDAL Availability**:
   - Detect GDAL at runtime
   - Provide clear installation instructions
   - Consider bundling minimal GDAL tools

2. **Performance**:
   - Cache parsed data when possible
   - Reuse Python processes
   - Implement streaming for large files

3. **Compatibility**:
   - Extensive testing with real S-57 files
   - Validate against NOAA chart samples
   - Handle edge cases gracefully

## Deliverables

1. **Week 1**: Infrastructure and Python parser
2. **Week 2**: Complete adapter implementation
3. **Week 3**: Integration and dependency updates
4. **Week 4**: Testing, documentation, and deployment

## Project Completion Checklist (Test-First Requirements)

### Phase 1: Infrastructure & Testing
- [ ] Write Python unit tests (test_s57_parser.py)
- [ ] Python tests achieve 90%+ coverage
- [ ] Python S-57 parser passes all tests
- [ ] Write TypeScript test files for all parsers
- [ ] Test files achieve 90%+ coverage
- [ ] All infrastructure tests passing

### Phase 2: Component Implementation
- [ ] S57 adapter tests written and passing
- [ ] S57 adapter achieves 100% API compatibility
- [ ] GDAL bridge tests written and passing
- [ ] GDAL bridge handles all edge cases
- [ ] Data transformer tests written and passing
- [ ] Data transformer maintains exact format
- [ ] Environment detection tests written and passing
- [ ] All component tests passing with 90%+ coverage

### Phase 3: Integration & Validation
- [ ] Integration tests comparing gdal-async output
- [ ] Output identical to gdal-async (byte-for-byte)
- [ ] Performance within 10% of gdal-async
- [ ] Import statements updated (ONLY after tests pass)
- [ ] Package.json updated (ONLY after validation)
- [ ] All existing s57Parser tests still passing
- [ ] Regression tests documented and passing

### Phase 4: Cross-Platform & CI/CD
- [ ] Linux tests passing (Ubuntu 20.04+)
- [ ] macOS tests passing (12.0+)
- [ ] Windows tests passing (10/11)
- [ ] Python 3.8-3.11 compatibility verified
- [ ] GDAL 3.0-3.3 compatibility verified
- [ ] GitHub Actions CI/CD pipeline configured
- [ ] All tests in CI/CD passing

### Final Validation Gates
- [ ] 100% of existing tests pass unchanged
- [ ] 90%+ code coverage across all components
- [ ] Zero breaking changes verified
- [ ] Performance benchmarks met
- [ ] Documentation includes test examples
- [ ] No code deployed without passing tests

## Progress Tracking

### Completed Tasks
- [x] Analyze current gdal-async usage in the codebase
- [x] Document project plan with test-first approach
- [x] Add GDAL environment validation phase
- [x] Design GitHub Actions feedback loop

### Current Status
- **Phase**: Planning
- **Next Step**: Create GDAL detection/installation scripts

### NPM Scripts to Add
```json
{
  "scripts": {
    // GDAL Environment Scripts
    "gdal:detect": "python src/parsers/detect_gdal.py",
    "gdal:install": "python src/parsers/install_gdal.py --auto",
    "gdal:validate": "npm run test:environment && npm run gdal:detect",
    "test:environment": "jest src/parsers/environment.spec.ts",
    
    // Test Scripts with Gates
    "test:phase0": "npm run gdal:validate",
    "test:phase1": "npm run test:phase0 && jest src/python/test_s57_parser.py",
    "test:phase2": "npm run test:phase1 && jest src/parsers/*.spec.ts",
    "test:phase3": "npm run test:phase2 && jest tests/integration/*.spec.ts",
    "test:comparison": "jest tests/comparison/*.spec.ts",
    
    // CI Helper Scripts
    "ci:environment": "npm run gdal:detect || npm run gdal:install",
    "ci:full": "npm run ci:environment && npm run test:all"
  }
}
```

### File Modifications Required

1. **New Implementation Files** (7 files):
   - `src/parsers/s57-adapter.ts`
   - `src/parsers/gdal-bridge.ts`
   - `src/parsers/data-transformer.ts`
   - `src/parsers/environment.ts`
   - `src/parsers/detect_gdal.py`
   - `src/parsers/install_gdal.py`
   - `src/python/s57_parser.py`

2. **New Test Files** (6 files):
   - `src/parsers/s57-adapter.spec.ts`
   - `src/parsers/gdal-bridge.spec.ts`
   - `src/parsers/data-transformer.spec.ts`
   - `src/parsers/environment.spec.ts`
   - `src/python/test_s57_parser.py`
   - `tests/integration/s57-adapter-integration.spec.ts`

3. **New GitHub Actions** (3 files):
   - `.github/workflows/gdal-detection.yml`
   - `.github/workflows/gdal-installation.yml`
   - `.github/workflows/main-ci.yml`

4. **Modified Files** (3 files):
   - `src/services/s57Parser.ts` - Update import
   - `src/services/s57Parser.spec.ts` - Update mock import
   - `package.json` - Remove gdal-async dependencies

5. **Total Changes**: 19 files (16 new, 3 modified)

### Development Validation Gates

Each phase has strict validation gates that must be passed before proceeding:

#### Gate 0: GDAL Environment Validation (NEW)
- [ ] GDAL detection works on Ubuntu/macOS/Windows
- [ ] Auto-installation succeeds when GDAL missing
- [ ] Correct version detection (3.0+)
- [ ] Python bindings accessible
- [ ] Command-line tools accessible (ogrinfo, ogr2ogr)
- [ ] GitHub Actions passing for all OS/Python combinations
- **Block**: No parser work until environment validated

#### Gate 1: Python Parser Validation
- [ ] All Python unit tests passing (100%)
- [ ] Test coverage ≥ 90%
- [ ] Manual test with real S-57 file
- [ ] Output matches expected GeoJSON format
- **Block**: No TypeScript work until Python tests pass

#### Gate 2: Component Validation
- [ ] Each component has tests written first
- [ ] All component tests passing (100%)
- [ ] Test coverage ≥ 90% per component
- [ ] API compatibility verified
- **Block**: No integration until components validated

#### Gate 3: Integration Validation
- [ ] Side-by-side comparison with gdal-async
- [ ] Output identical (use diff tools)
- [ ] Performance within 10%
- [ ] Memory usage acceptable
- **Block**: No import changes until validated

#### Gate 4: Production Validation
- [ ] All existing tests pass unchanged
- [ ] Cross-platform tests passing
- [ ] CI/CD pipeline green
- [ ] Zero breaking changes confirmed
- **Block**: No deployment until all gates passed

## Notes

This plan ensures a seamless transition from gdal-async to a cross-platform solution with zero breaking changes and improved deployment flexibility. The key principle is maintaining exact API compatibility so that all existing code continues to work without modification.