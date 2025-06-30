# Database Query Guide

## Overview

The `execute_query` tool provides direct SQL access to the ENC chart database, similar to the functionality in the openmaptiles-mcp project. This allows for custom analysis, debugging, and exploration of chart data stored in the SQLite database.

## Database Schema

The ENC chart database contains the following tables:

### `charts`
Chart metadata and information
```sql
- chart_id (TEXT PRIMARY KEY) - Unique chart identifier (e.g., 'US5CA72M')
- chart_name (TEXT) - Human-readable chart name
- scale (INTEGER) - Chart scale (e.g., 12000)
- edition (INTEGER) - Chart edition number
- update_date (TEXT) - Last update date
- bbox_* (REAL) - Bounding box coordinates
- file_path (TEXT) - Local file path
- cached_at (INTEGER) - Cache timestamp
- download_url (TEXT) - Original download URL
```

### `chart_features`
Individual S-57 features extracted from charts
```sql
- id (INTEGER PRIMARY KEY) - Auto-increment ID
- chart_id (TEXT) - Reference to charts table
- object_class (TEXT) - S-57 object class (e.g., 'COALNE', 'DEPARE')
- object_id (TEXT) - Feature object ID
- geometry (TEXT) - GeoJSON geometry
- properties (TEXT) - JSON properties
- bbox_* (REAL) - Feature bounding box
- created_at (INTEGER) - Creation timestamp
```

### `chart_cache`
Processing cache for coastlines and other derived data
```sql
- cache_key (TEXT PRIMARY KEY) - Unique cache identifier
- chart_id (TEXT) - Reference to charts table  
- cache_type (TEXT) - Type of cached data
- data (BLOB) - Cached binary data
- metadata (TEXT) - JSON metadata
- expires_at (INTEGER) - Expiration timestamp
```

### `chart_downloads`
Download tracking and status
```sql
- id (INTEGER PRIMARY KEY) - Auto-increment ID
- chart_id (TEXT) - Chart being downloaded
- download_url (TEXT) - Source URL
- status (TEXT) - Download status
- started_at (INTEGER) - Start timestamp
- completed_at (INTEGER) - Completion timestamp
- file_size (INTEGER) - Downloaded file size
- error_message (TEXT) - Error details if failed
```

### `coastline_cache`
Processed coastline segments
```sql
- id (INTEGER PRIMARY KEY) - Auto-increment ID
- chart_id (TEXT) - Reference to charts table
- cache_key (TEXT) - Cache identifier
- coastline_type (TEXT) - Type of coastline
- geometry (TEXT) - GeoJSON LineString
- properties (TEXT) - JSON properties
- length_m (REAL) - Length in meters
- created_at (INTEGER) - Creation timestamp
```

## Query Examples

### Basic Information Queries

**List all available charts:**
```sql
SELECT chart_id, chart_name, scale, edition 
FROM charts 
ORDER BY scale;
```

**Get chart coverage area:**
```sql
SELECT chart_id, 
       bbox_minlon, bbox_minlat, 
       bbox_maxlon, bbox_maxlat,
       (bbox_maxlon - bbox_minlon) * (bbox_maxlat - bbox_minlat) as coverage_area
FROM charts
ORDER BY coverage_area DESC;
```

**Database status and sizes:**
```sql
SELECT 'charts' as table_name, COUNT(*) as count FROM charts
UNION ALL
SELECT 'features' as table_name, COUNT(*) as count FROM chart_features
UNION ALL  
SELECT 'cache' as table_name, COUNT(*) as count FROM chart_cache;
```

### Feature Analysis Queries

**Most common S-57 feature types:**
```sql
SELECT object_class, COUNT(*) as feature_count
FROM chart_features 
GROUP BY object_class 
ORDER BY feature_count DESC 
LIMIT 20;
```

**Features by chart:**
```sql
SELECT cf.chart_id, c.chart_name, 
       COUNT(*) as total_features,
       COUNT(DISTINCT cf.object_class) as unique_types
FROM chart_features cf
JOIN charts c ON cf.chart_id = c.chart_id
GROUP BY cf.chart_id, c.chart_name
ORDER BY total_features DESC;
```

**Find specific feature types in a chart:**
```sql
SELECT object_class, COUNT(*) as count
FROM chart_features 
WHERE chart_id = 'US5CA72M' 
  AND object_class IN ('COALNE', 'SLCONS', 'DEPARE', 'DEPCNT')
GROUP BY object_class
ORDER BY count DESC;
```

**Features within a geographic area:**
```sql
SELECT chart_id, object_class, COUNT(*) as count
FROM chart_features
WHERE bbox_minlon >= -117.25 AND bbox_maxlon <= -117.20
  AND bbox_minlat >= 32.70 AND bbox_maxlat <= 32.73
GROUP BY chart_id, object_class
ORDER BY count DESC;
```

### Coastline Analysis Queries

**Coastline cache statistics:**
```sql
SELECT coastline_type, 
       COUNT(*) as segment_count,
       SUM(length_m) / 1000 as total_length_km,
       AVG(length_m) as avg_length_m
FROM coastline_cache
GROUP BY coastline_type
ORDER BY total_length_km DESC;
```

**Coastline segments by chart:**
```sql
SELECT cc.chart_id, c.chart_name,
       COUNT(*) as segments,
       SUM(cc.length_m) / 1000 as total_km
FROM coastline_cache cc
JOIN charts c ON cc.chart_id = c.chart_id
GROUP BY cc.chart_id, c.chart_name
ORDER BY total_km DESC;
```

### Depth and Navigation Queries

**Depth area analysis:**
```sql
SELECT cf.chart_id,
       COUNT(*) as depth_areas,
       json_extract(cf.properties, '$.DRVAL1') as min_depth,
       json_extract(cf.properties, '$.DRVAL2') as max_depth
FROM chart_features cf
WHERE cf.object_class = 'DEPARE'
  AND json_extract(cf.properties, '$.DRVAL1') IS NOT NULL
GROUP BY cf.chart_id, min_depth, max_depth
ORDER BY min_depth, max_depth;
```

**Navigation aids in area:**
```sql
SELECT object_class, COUNT(*) as count,
       GROUP_CONCAT(DISTINCT json_extract(properties, '$.OBJNAM')) as names
FROM chart_features
WHERE object_class IN ('LIGHTS', 'BOYLAT', 'BCNLAT', 'BOYCAR')
  AND chart_id = 'US5CA72M'
GROUP BY object_class
ORDER BY count DESC;
```

### Cache and Performance Queries

**Cache utilization:**
```sql
SELECT cache_type, 
       COUNT(*) as entries,
       SUM(LENGTH(data)) / 1024 / 1024 as size_mb,
       MIN(created_at) as oldest,
       MAX(created_at) as newest
FROM chart_cache
GROUP BY cache_type
ORDER BY size_mb DESC;
```

**Download history:**
```sql
SELECT chart_id, status, 
       COUNT(*) as attempts,
       AVG(file_size) / 1024 / 1024 as avg_size_mb,
       MAX(completed_at) - MIN(started_at) as total_duration_ms
FROM chart_downloads
GROUP BY chart_id, status
ORDER BY attempts DESC;
```

## Usage with MCP

### Basic Query
```javascript
const result = await mcp.callTool('execute_query', {
  query: "SELECT COUNT(*) as total_charts FROM charts"
});
```

### Parameterized Query
```javascript
const result = await mcp.callTool('execute_query', {
  query: "SELECT * FROM chart_features WHERE chart_id = ? AND object_class = ? LIMIT ?",
  params: ["US5CA72M", "COALNE", 10]
});
```

### Analysis Query
```javascript
const result = await mcp.callTool('execute_query', {
  query: `
    SELECT cf.object_class, 
           COUNT(*) as feature_count,
           AVG(cf.bbox_maxlon - cf.bbox_minlon) as avg_width,
           AVG(cf.bbox_maxlat - cf.bbox_minlat) as avg_height
    FROM chart_features cf
    WHERE cf.chart_id = ?
    GROUP BY cf.object_class
    HAVING feature_count > 10
    ORDER BY feature_count DESC
  `,
  params: ["US5CA72M"]
});
```

## Safety Features

### Readonly Mode (Default)
- **Default**: `readonly: true` prevents write operations
- **Protection**: Blocks INSERT, UPDATE, DELETE, DROP, CREATE, ALTER
- **Override**: Set `readonly: false` only when write access is needed

### Parameterized Queries
- **Recommended**: Use `?` placeholders with `params` array
- **Security**: Prevents SQL injection attacks
- **Types**: Supports string, number, boolean, null values

### Error Handling
- **Timeout**: Queries have built-in execution time limits
- **Validation**: Input validation for query syntax
- **Logging**: Execution time and row count reporting

## Performance Tips

1. **Use LIMIT**: Always limit large result sets
2. **Index Usage**: Leverage existing spatial and feature indexes
3. **Parameterization**: Use parameters instead of string concatenation
4. **Specific Columns**: Select only needed columns, avoid `SELECT *`
5. **Proper JOINs**: Use appropriate join types for multi-table queries

## Database Indexes

The database includes optimized indexes for common queries:

- `idx_chart_bbox` - Spatial queries on charts
- `idx_chart_scale` - Scale-based filtering
- `idx_feature_bbox` - Spatial queries on features  
- `idx_feature_class` - Feature type filtering
- `idx_feature_chart` - Chart-specific feature queries
- `idx_coastline_cache_chart` - Coastline queries by chart
- `idx_coastline_type` - Coastline type filtering

## Common Use Cases

### 1. Chart Discovery
Find charts covering a specific area or with certain characteristics.

### 2. Feature Analysis
Analyze distribution and properties of S-57 features across charts.

### 3. Coastline Research
Study coastline extraction results and processing statistics.

### 4. Performance Monitoring
Monitor cache usage, download performance, and database size.

### 5. Data Validation
Verify data integrity and feature consistency across charts.

### 6. Custom Processing
Create custom aggregations and analysis not available through standard tools.

## Integration with Other Tools

The `execute_query` tool complements other MCP tools:

- **get_chart**: Use queries to identify charts, then extract specific data
- **search_charts**: Query-based chart discovery for complex criteria  
- **extract_coastlines**: Analyze coastline processing results
- **get_water_land_classification**: Study classification performance

This direct database access enables powerful custom analysis while maintaining the safety and convenience of the MCP protocol.