export const DATABASE_SCHEMAS = {
  charts: `
    CREATE TABLE IF NOT EXISTS charts (
      chart_id TEXT PRIMARY KEY,
      chart_name TEXT NOT NULL,
      scale INTEGER NOT NULL,
      edition INTEGER,
      update_date TEXT,
      bbox_minlon REAL,
      bbox_minlat REAL,
      bbox_maxlon REAL,
      bbox_maxlat REAL,
      file_path TEXT,
      file_size INTEGER,
      cached_at INTEGER DEFAULT (strftime('%s', 'now')),
      last_accessed INTEGER DEFAULT (strftime('%s', 'now')),
      download_url TEXT,
      chart_purpose TEXT,
      compilation_scale INTEGER
    )
  `,

  chart_features: `
    CREATE TABLE IF NOT EXISTS chart_features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chart_id TEXT NOT NULL,
      object_class TEXT NOT NULL,
      object_id TEXT,
      geometry TEXT NOT NULL,
      properties TEXT,
      bbox_minlon REAL,
      bbox_minlat REAL,
      bbox_maxlon REAL,
      bbox_maxlat REAL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (chart_id) REFERENCES charts(chart_id) ON DELETE CASCADE
    )
  `,

  chart_cache: `
    CREATE TABLE IF NOT EXISTS chart_cache (
      cache_key TEXT PRIMARY KEY,
      chart_id TEXT NOT NULL,
      cache_type TEXT NOT NULL,
      data BLOB,
      metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      expires_at INTEGER,
      FOREIGN KEY (chart_id) REFERENCES charts(chart_id) ON DELETE CASCADE
    )
  `,

  chart_downloads: `
    CREATE TABLE IF NOT EXISTS chart_downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chart_id TEXT NOT NULL,
      download_url TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER DEFAULT (strftime('%s', 'now')),
      completed_at INTEGER,
      file_size INTEGER,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0
    )
  `
};

export const DATABASE_INDEXES = {
  chart_bbox: `
    CREATE INDEX IF NOT EXISTS idx_chart_bbox 
    ON charts(bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat)
  `,
  
  chart_scale: `
    CREATE INDEX IF NOT EXISTS idx_chart_scale 
    ON charts(scale)
  `,
  
  feature_bbox: `
    CREATE INDEX IF NOT EXISTS idx_feature_bbox 
    ON chart_features(bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat)
  `,
  
  feature_class: `
    CREATE INDEX IF NOT EXISTS idx_feature_class 
    ON chart_features(object_class)
  `,
  
  feature_chart: `
    CREATE INDEX IF NOT EXISTS idx_feature_chart 
    ON chart_features(chart_id)
  `,
  
  cache_timestamp: `
    CREATE INDEX IF NOT EXISTS idx_cache_timestamp 
    ON chart_cache(expires_at)
  `
};

export interface ChartRecord {
  chart_id: string;
  chart_name: string;
  scale: number;
  edition?: number | null;
  update_date?: string | null;
  bbox_minlon?: number | null;
  bbox_minlat?: number | null;
  bbox_maxlon?: number | null;
  bbox_maxlat?: number | null;
  file_path?: string | null;
  file_size?: number | null;
  cached_at?: number;
  last_accessed?: number;
  download_url?: string | null;
  chart_purpose?: string | null;
  compilation_scale?: number | null;
}

export interface ChartFeatureRecord {
  id?: number;
  chart_id: string;
  object_class: string;
  object_id?: string | null;
  geometry: string;
  properties?: string | null;
  bbox_minlon?: number | null;
  bbox_minlat?: number | null;
  bbox_maxlon?: number | null;
  bbox_maxlat?: number | null;
  created_at?: number;
}

export interface ChartCacheRecord {
  cache_key: string;
  chart_id: string;
  cache_type: string;
  data?: Buffer | null;
  metadata?: string | null;
  created_at?: number;
  expires_at?: number | null;
}

export interface ChartDownloadRecord {
  id?: number;
  chart_id: string;
  download_url: string;
  status: string;
  started_at?: number;
  completed_at?: number | null;
  file_size?: number | null;
  error_message?: string | null;
  retry_count?: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}