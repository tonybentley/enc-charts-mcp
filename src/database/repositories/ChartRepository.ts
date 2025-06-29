import type { DatabaseManager } from '../DatabaseManager.js';
import type { ChartRecord, BoundingBox } from '../schemas.js';

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export class ChartRepository {
  constructor(private dbManager: DatabaseManager) {}

  public async insert(chart: ChartRecord): Promise<void> {
    const stmt = this.dbManager.prepare<unknown[]>(`
      INSERT OR REPLACE INTO charts (
        chart_id, chart_name, scale, edition, update_date,
        bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat,
        file_path, file_size, cached_at, last_accessed,
        download_url, chart_purpose, compilation_scale
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const now = Date.now();
    stmt.run([
      chart.chart_id,
      chart.chart_name,
      chart.scale,
      chart.edition ?? null,
      chart.update_date ?? null,
      chart.bbox_minlon ?? null,
      chart.bbox_minlat ?? null,
      chart.bbox_maxlon ?? null,
      chart.bbox_maxlat ?? null,
      chart.file_path ?? null,
      chart.file_size ?? null,
      chart.cached_at ?? now,
      chart.last_accessed ?? now,
      chart.download_url ?? null,
      chart.chart_purpose ?? null,
      chart.compilation_scale ?? null
    ]);
  }

  public async insertBatch(charts: ChartRecord[]): Promise<void> {
    const stmt = this.dbManager.prepare<unknown[]>(`
      INSERT OR REPLACE INTO charts (
        chart_id, chart_name, scale, edition, update_date,
        bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat,
        file_path, file_size, cached_at, last_accessed,
        download_url, chart_purpose, compilation_scale
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await this.dbManager.transaction(() => {
      const now = Date.now();
      for (const chart of charts) {
        stmt.run([
          chart.chart_id,
          chart.chart_name,
          chart.scale,
          chart.edition ?? null,
          chart.update_date ?? null,
          chart.bbox_minlon ?? null,
          chart.bbox_minlat ?? null,
          chart.bbox_maxlon ?? null,
          chart.bbox_maxlat ?? null,
          chart.file_path ?? null,
          chart.file_size ?? null,
          chart.cached_at ?? now,
          chart.last_accessed ?? now,
          chart.download_url ?? null,
          chart.chart_purpose ?? null,
          chart.compilation_scale ?? null
        ]);
      }
    });
  }

  public async getById(chartId: string): Promise<ChartRecord | null> {
    const stmt = this.dbManager.prepare<[string], ChartRecord>(`
      SELECT * FROM charts WHERE chart_id = ?
    `);
    
    const result = stmt.get([chartId]);
    return result ?? null;
  }

  public async findByCoordinates(lat: number, lon: number): Promise<ChartRecord[]> {
    const stmt = this.dbManager.prepare<[number, number, number, number], ChartRecord>(`
      SELECT * FROM charts 
      WHERE bbox_minlon <= ? AND bbox_maxlon >= ?
        AND bbox_minlat <= ? AND bbox_maxlat >= ?
      ORDER BY scale ASC
    `);
    
    return stmt.all([lon, lon, lat, lat]);
  }

  public async findByBounds(bounds: BoundingBox): Promise<ChartRecord[]> {
    const stmt = this.dbManager.prepare<[number, number, number, number], ChartRecord>(`
      SELECT * FROM charts 
      WHERE NOT (bbox_maxlon < ? OR bbox_minlon > ? OR bbox_maxlat < ? OR bbox_minlat > ?)
      ORDER BY scale ASC
    `);
    
    return stmt.all([bounds.minLon, bounds.maxLon, bounds.minLat, bounds.maxLat]);
  }

  public async findByScaleRange(minScale: number, maxScale: number): Promise<ChartRecord[]> {
    const stmt = this.dbManager.prepare<[number, number], ChartRecord>(`
      SELECT * FROM charts 
      WHERE scale >= ? AND scale <= ?
      ORDER BY scale ASC
    `);
    
    return stmt.all([minScale, maxScale]);
  }

  public async findAll(options?: PaginationOptions): Promise<ChartRecord[]> {
    let query = 'SELECT * FROM charts ORDER BY chart_id';
    const params: unknown[] = [];
    
    if (options?.limit !== undefined) {
      query += ' LIMIT ?';
      params.push(options.limit);
      
      if (options.offset !== undefined) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }
    
    const stmt = this.dbManager.prepare<unknown[], ChartRecord>(query);
    return stmt.all(params);
  }

  public async count(): Promise<number> {
    const stmt = this.dbManager.prepare<[], { count: number }>(`
      SELECT COUNT(*) as count FROM charts
    `);
    
    const result = stmt.get([]);
    return result?.count ?? 0;
  }

  public async updateLastAccessed(chartId: string): Promise<void> {
    const stmt = this.dbManager.prepare<[number, string]>(`
      UPDATE charts SET last_accessed = ? WHERE chart_id = ?
    `);
    
    stmt.run([Date.now(), chartId]);
  }

  public async updateFileInfo(chartId: string, filePath: string, fileSize: number): Promise<void> {
    const stmt = this.dbManager.prepare<[string, number, string]>(`
      UPDATE charts SET file_path = ?, file_size = ? WHERE chart_id = ?
    `);
    
    stmt.run([filePath, fileSize, chartId]);
  }

  public async delete(chartId: string): Promise<boolean> {
    const stmt = this.dbManager.prepare<[string]>(`
      DELETE FROM charts WHERE chart_id = ?
    `);
    
    const result = stmt.run([chartId]);
    return result.changes > 0;
  }

  public async deleteOlderThan(timestamp: number): Promise<number> {
    const stmt = this.dbManager.prepare<[number]>(`
      DELETE FROM charts WHERE cached_at < ?
    `);
    
    const result = stmt.run([timestamp]);
    return result.changes;
  }

  public async getTotalCacheSize(): Promise<number> {
    const stmt = this.dbManager.prepare<[], { total_size: number | null }>(`
      SELECT SUM(file_size) as total_size FROM charts
    `);
    
    const result = stmt.get([]);
    return result?.total_size ?? 0;
  }

  public async findByUpdateDateRange(startDate: string, endDate: string): Promise<ChartRecord[]> {
    const stmt = this.dbManager.prepare<[string, string], ChartRecord>(`
      SELECT * FROM charts 
      WHERE update_date >= ? AND update_date <= ?
      ORDER BY update_date DESC
    `);
    
    return stmt.all([startDate, endDate]);
  }

  public async exists(chartId: string): Promise<boolean> {
    const stmt = this.dbManager.prepare<[string], { count: number }>(`
      SELECT COUNT(*) as count FROM charts WHERE chart_id = ?
    `);
    
    const result = stmt.get([chartId]);
    return (result?.count ?? 0) > 0;
  }
}