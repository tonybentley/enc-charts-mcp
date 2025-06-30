# ENC Charts MCP Render Tests

This directory contains visual render tests that demonstrate the capabilities of the ENC Charts MCP server through actual chart data visualization.

## Available Render Tests

### 1. [PONTON Features Investigation](./ponton-features-investigation/)
**Purpose**: Investigation and fix for missing PONTON (pontoon) features in coastline extraction.

**Key Features**:
- Comparison visualization (baseline vs enhanced)
- Debug analysis of missing features
- Implementation fix verification
- Focus on marina pontoon/floating dock features

**Status**: ✅ Completed - PONTON features now properly extracted

---

### 2. [Filled Navigation Features](./filled-navigation-features/)
**Purpose**: Comprehensive visualization of all navigation features with filled shapes.

**Key Features**:
- Single comprehensive visualization
- All major S-57 navigation feature types
- Filled shapes with transparency
- Color-coded feature types
- Complete marina and harbor visualization

**Status**: ✅ Completed - Reference implementation for AI clients

**AI Client Tool Call**: See README for exact JSON-RPC parameters

---

### 3. [San Diego Bay Overview](./san-diego-bay-overview/)
**Purpose**: Large-scale navigation feature visualization covering northern San Diego Bay and Point Loma.

**Key Features**:
- Expanded geographic coverage (11.1km × 14.5km)
- Point Loma peninsula to eastern bay
- 94 features across 13 different types
- 2,552 PONTON features processed
- Complex maritime infrastructure
- Commercial ports and naval facilities

**Status**: ✅ Completed - Large-scale coastal visualization

**Coverage**: 32.65-32.75°N, -117.25 to -117.08°W

---

### 4. [Point Loma Entrance](./point-loma-entrance/)
**Purpose**: Harbor entrance navigation visualization focusing on the critical Point Loma entrance to San Diego Bay.

**Key Features**:
- Harbor entrance and western Pacific approach
- Point Loma Lighthouse and navigation landmarks
- Critical depth contours and anchorage areas
- Navigation-optimized visualization (6.7km × 11.0km)
- 86 features including 2,439 processed PONTON features
- Professional maritime chart styling

**Status**: ✅ Completed - Harbor entrance navigation reference

**Coverage**: 32.67-32.73°N, -117.28 to -117.15°W

---

## How to Run Render Tests

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Navigate to test directory**:
   ```bash
   cd docs/renders/[test-name]/
   ```

3. **Run the render script**:
   ```bash
   node render-[script-name].js
   ```

4. **View results**:
   - Open the generated HTML file in a browser
   - Review the generated JSON data files
   - Check console output for statistics

## Test Locations

All render tests use the same test location for consistency:

- **Chart**: US5CA72M (San Diego Bay)
- **Location**: Shelter Island Marina, San Diego, California
- **Coordinates**: 32.714935°N, 117.228975°W
- **Area**: ~3km × 3km bounding box

This location was chosen because it contains:
- Complex marina structures with pontoons
- Multiple feature types (land, water, constructed)
- High-density navigation features
- Real-world complexity for testing

## Contributing New Render Tests

When adding new render tests:

1. Create a new directory: `docs/renders/[test-name]/`
2. Include these files:
   - `README.md` - Test documentation and AI tool call examples
   - `render-[name].js` - Test script
   - Generated artifacts (HTML, JSON, images)
3. Update this index README
4. Follow the established patterns for consistency

## Dependencies

Render tests require:
- Node.js 18+
- Built project (`npm run build`)
- Database with chart data (automatically downloaded)
- Modern web browser for viewing results