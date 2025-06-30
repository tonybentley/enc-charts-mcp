import type { DatabaseManager } from '../DatabaseManager.js';
import type { ChartFeatureRecord, BoundingBox } from '../schemas.js';

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface ObjectClassStats {
  object_class: string;
  count: number;
}

export interface ChartFeatureStats {
  chart_id: string;
  feature_count: number;
}

export class NavigationFeatureRepository {
  constructor(private dbManager: DatabaseManager) {}

  public async insert(feature: ChartFeatureRecord): Promise<void> {
    const stmt = this.dbManager.prepare<unknown[]>(`
      INSERT INTO chart_features (
        chart_id, object_class, object_id, geometry, properties,
        bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run([
      feature.chart_id,
      feature.object_class,
      feature.object_id ?? null,
      feature.geometry,
      feature.properties ?? null,
      feature.bbox_minlon ?? null,
      feature.bbox_minlat ?? null,
      feature.bbox_maxlon ?? null,
      feature.bbox_maxlat ?? null
    ]);
  }

  public async insertBatch(features: ChartFeatureRecord[]): Promise<void> {
    const stmt = this.dbManager.prepare<unknown[]>(`
      INSERT INTO chart_features (
        chart_id, object_class, object_id, geometry, properties,
        bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await this.dbManager.transaction(() => {
      for (const feature of features) {
        stmt.run([
          feature.chart_id,
          feature.object_class,
          feature.object_id ?? null,
          feature.geometry,
          feature.properties ?? null,
          feature.bbox_minlon ?? null,
          feature.bbox_minlat ?? null,
          feature.bbox_maxlon ?? null,
          feature.bbox_maxlat ?? null
        ]);
      }
    });
  }

  public async findByBounds(bounds: BoundingBox, objectClasses?: string[]): Promise<ChartFeatureRecord[]> {
    let query = `
      SELECT * FROM chart_features 
      WHERE NOT (bbox_maxlon < ? OR bbox_minlon > ? OR bbox_maxlat < ? OR bbox_minlat > ?)
    `;
    const params: unknown[] = [bounds.minLon, bounds.maxLon, bounds.minLat, bounds.maxLat];
    
    if (objectClasses && objectClasses.length > 0) {
      const placeholders = objectClasses.map(() => '?').join(', ');
      query += ` AND object_class IN (${placeholders})`;
      params.push(...objectClasses);
    }
    
    query += ' ORDER BY object_class, id';
    
    const stmt = this.dbManager.prepare<unknown[], ChartFeatureRecord>(query);
    return stmt.all(params);
  }

  public async findByChartId(chartId: string, options?: PaginationOptions): Promise<ChartFeatureRecord[]> {
    let query = 'SELECT * FROM chart_features WHERE chart_id = ? ORDER BY object_class, id';
    const params: unknown[] = [chartId];
    
    if (options?.limit !== undefined) {
      query += ' LIMIT ?';
      params.push(options.limit);
      
      if (options.offset !== undefined) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }
    
    const stmt = this.dbManager.prepare<unknown[], ChartFeatureRecord>(query);
    return stmt.all(params);
  }

  public async findByChartIdAndClasses(chartId: string, objectClasses: string[], options?: PaginationOptions): Promise<ChartFeatureRecord[]> {
    const placeholders = objectClasses.map(() => '?').join(', ');
    let query = `SELECT * FROM chart_features WHERE chart_id = ? AND object_class IN (${placeholders}) ORDER BY object_class, id`;
    const params: unknown[] = [chartId, ...objectClasses];
    
    if (options?.limit !== undefined) {
      query += ' LIMIT ?';
      params.push(options.limit);
      
      if (options.offset !== undefined) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }
    
    const stmt = this.dbManager.prepare<unknown[], ChartFeatureRecord>(query);
    return stmt.all(params);
  }

  public async findByObjectClass(objectClass: string): Promise<ChartFeatureRecord[]> {
    const stmt = this.dbManager.prepare<[string], ChartFeatureRecord>(`
      SELECT * FROM chart_features 
      WHERE object_class = ?
      ORDER BY chart_id, id
    `);
    
    return stmt.all([objectClass]);
  }

  public async countByChartId(chartId: string): Promise<number> {
    const stmt = this.dbManager.prepare<[string], { count: number }>(`
      SELECT COUNT(*) as count FROM chart_features WHERE chart_id = ?
    `);
    
    const result = stmt.get([chartId]);
    return result?.count ?? 0;
  }

  public async deleteByChartId(chartId: string): Promise<number> {
    const stmt = this.dbManager.prepare<[string]>(`
      DELETE FROM chart_features WHERE chart_id = ?
    `);
    
    const result = stmt.run([chartId]);
    return result.changes;
  }

  public async deleteByObjectClass(chartId: string, objectClass: string): Promise<number> {
    const stmt = this.dbManager.prepare<[string, string]>(`
      DELETE FROM chart_features WHERE chart_id = ? AND object_class = ?
    `);
    
    const result = stmt.run([chartId, objectClass]);
    return result.changes;
  }

  public async getObjectClassStats(): Promise<ObjectClassStats[]> {
    const stmt = this.dbManager.prepare<[], ObjectClassStats>(`
      SELECT object_class, COUNT(*) as count
      FROM chart_features
      GROUP BY object_class
      ORDER BY count DESC
    `);
    
    return stmt.all([]);
  }

  public async getFeatureCountByChart(): Promise<ChartFeatureStats[]> {
    const stmt = this.dbManager.prepare<[], ChartFeatureStats>(`
      SELECT chart_id, COUNT(*) as feature_count
      FROM chart_features
      GROUP BY chart_id
      ORDER BY feature_count DESC
    `);
    
    return stmt.all([]);
  }

  public async searchByProperty(propertyKey: string, propertyValue: string): Promise<ChartFeatureRecord[]> {
    const stmt = this.dbManager.prepare<[string, string], ChartFeatureRecord>(`
      SELECT * FROM chart_features
      WHERE json_extract(properties, '$.' || ?) = ?
      ORDER BY chart_id, object_class
    `);
    
    return stmt.all([propertyKey, propertyValue]);
  }

  public async searchByObjectName(namePart: string): Promise<ChartFeatureRecord[]> {
    const stmt = this.dbManager.prepare<[string], ChartFeatureRecord>(`
      SELECT * FROM chart_features
      WHERE json_extract(properties, '$.OBJNAM') LIKE '%' || ? || '%'
      ORDER BY chart_id, object_class
    `);
    
    return stmt.all([namePart]);
  }
}