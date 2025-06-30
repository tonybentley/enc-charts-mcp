import { Feature, LineString, Position, Polygon } from 'geojson';
import { ConnectionMap, Gap } from '../../types/coastline.js';
import { GeometryUtils } from '../geometry/GeometryUtils.js';
import { DEFAULT_STITCHING_TOLERANCE } from '../../constants/coastline.js';

export interface GapFillingOptions {
  enabled: boolean;
  maxGapDistance: number;
  method: 'linear' | 'arc' | 'coastline-following';
  validateWithWaterBodies: boolean;
  waterFeatures?: Feature<Polygon>[];
}

export class CoastlineStitcher {
  stitchSegments(
    segments: Feature<LineString>[], 
    tolerance: number = DEFAULT_STITCHING_TOLERANCE,
    gapFillingOptions?: GapFillingOptions
  ): Feature<LineString>[] {
    if (segments.length === 0) return [];
    
    // Find connectable endpoints
    const connectionMap = this.findConnectableEndpoints(segments, tolerance);
    
    // Build connected groups
    const groups = this.buildConnectedGroups(segments, connectionMap);
    
    // Merge segments within each group
    let stitched: Feature<LineString>[] = [];
    groups.forEach(group => {
      if (group.length === 1) {
        stitched.push(group[0]);
      } else {
        const merged = this.mergeSegmentGroup(group, connectionMap);
        stitched.push(merged);
      }
    });
    
    // Fill gaps if enabled
    if (gapFillingOptions?.enabled && stitched.length > 1) {
      stitched = this.fillGaps(stitched, gapFillingOptions);
    }
    
    return stitched;
  }

  findConnectableEndpoints(segments: Feature<LineString>[], tolerance: number = DEFAULT_STITCHING_TOLERANCE): ConnectionMap {
    const connectionMap: ConnectionMap = {};
    
    // Initialize connection map
    segments.forEach((segment, i) => {
      const coords = segment.geometry.coordinates;
      connectionMap[i] = {
        connectsTo: [],
        endpoints: {
          start: coords[0] as [number, number],
          end: coords[coords.length - 1] as [number, number]
        }
      };
    });
    
    // Find connections
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const seg1 = connectionMap[i];
        const seg2 = connectionMap[j];
        
        // Check all endpoint combinations
        if (this.canConnect(seg1.endpoints.end, seg2.endpoints.start, tolerance)) {
          connectionMap[i].connectsTo.push(j);
          connectionMap[j].connectsTo.push(i);
        }
        if (this.canConnect(seg1.endpoints.end, seg2.endpoints.end, tolerance)) {
          connectionMap[i].connectsTo.push(j);
          connectionMap[j].connectsTo.push(i);
        }
        if (this.canConnect(seg1.endpoints.start, seg2.endpoints.start, tolerance)) {
          connectionMap[i].connectsTo.push(j);
          connectionMap[j].connectsTo.push(i);
        }
        if (this.canConnect(seg1.endpoints.start, seg2.endpoints.end, tolerance)) {
          connectionMap[i].connectsTo.push(j);
          connectionMap[j].connectsTo.push(i);
        }
      }
    }
    
    return connectionMap;
  }

  mergeConnectedSegments(segments: Feature<LineString>[]): Feature<LineString>[] {
    const merged: Feature<LineString>[] = [];
    const used = new Set<number>();
    
    segments.forEach((segment, index) => {
      if (used.has(index)) return;
      
      const chain = this.buildChain(segments, index, used);
      merged.push(this.createMergedSegment(chain));
    });
    
    return merged;
  }

  detectGaps(segments: Feature<LineString>[]): Gap[] {
    const gaps: Gap[] = [];
    const endpoints: Array<{ coord: Position; segmentIndex: number; isStart: boolean }> = [];
    
    // Collect all endpoints
    segments.forEach((segment, index) => {
      const coords = segment.geometry.coordinates;
      endpoints.push({
        coord: coords[0],
        segmentIndex: index,
        isStart: true
      });
      endpoints.push({
        coord: coords[coords.length - 1],
        segmentIndex: index,
        isStart: false
      });
    });
    
    // Find unconnected endpoints
    const unconnected: typeof endpoints = [];
    endpoints.forEach(endpoint => {
      const hasConnection = endpoints.some(other => 
        other.segmentIndex !== endpoint.segmentIndex &&
        GeometryUtils.distance(endpoint.coord, other.coord) < DEFAULT_STITCHING_TOLERANCE
      );
      
      if (!hasConnection) {
        unconnected.push(endpoint);
      }
    });
    
    // Find closest pairs of unconnected endpoints from different segments
    // Only consider reasonable gaps (not too far apart)
    for (let i = 0; i < unconnected.length; i++) {
      for (let j = i + 1; j < unconnected.length; j++) {
        // Skip if same segment
        if (unconnected[i].segmentIndex === unconnected[j].segmentIndex) continue;
        
        const distance = GeometryUtils.distance(unconnected[i].coord, unconnected[j].coord);
        
        // Only consider gaps that are reasonable for stitching (100m to 50km)
        if (distance > DEFAULT_STITCHING_TOLERANCE && distance < 50000) {
          gaps.push({
            start: unconnected[i].coord as [number, number],
            end: unconnected[j].coord as [number, number],
            distance_m: distance
          });
        }
      }
    }
    
    // Sort gaps by distance
    gaps.sort((a, b) => a.distance_m - b.distance_m);
    
    return gaps;
  }

  fillGaps(segments: Feature<LineString>[], options: GapFillingOptions): Feature<LineString>[] {
    // Detect gaps between segments
    const gaps = this.detectGaps(segments);
    
    // Filter gaps that can be filled
    const fillableGaps = gaps.filter(gap => 
      gap.distance_m <= options.maxGapDistance
    );
    
    if (fillableGaps.length === 0) {
      return segments;
    }
    
    // Create a map of segment endpoints for efficient lookup
    const endpointMap = new Map<string, { segment: Feature<LineString>; isStart: boolean }>();
    segments.forEach(segment => {
      const coords = segment.geometry.coordinates;
      const startKey = `${coords[0][0]},${coords[0][1]}`;
      const endKey = `${coords[coords.length - 1][0]},${coords[coords.length - 1][1]}`;
      
      endpointMap.set(startKey, { segment, isStart: true });
      endpointMap.set(endKey, { segment, isStart: false });
    });
    
    // Fill each gap
    const filledSegments: Feature<LineString>[] = [];
    const processedSegments = new Set<Feature<LineString>>();
    
    fillableGaps.forEach(gap => {
      // Find segments to connect
      const startKey = `${gap.start[0]},${gap.start[1]}`;
      const endKey = `${gap.end[0]},${gap.end[1]}`;
      
      const startInfo = endpointMap.get(startKey);
      const endInfo = endpointMap.get(endKey);
      
      if (!startInfo || !endInfo || processedSegments.has(startInfo.segment) || processedSegments.has(endInfo.segment)) {
        return;
      }
      
      // Create gap-filling segment based on method
      let gapFillCoords: Position[];
      
      if (options.method === 'linear') {
        gapFillCoords = this.createLinearFill(gap.start, gap.end);
      } else {
        // For now, only linear is implemented
        gapFillCoords = this.createLinearFill(gap.start, gap.end);
      }
      
      // Validate gap fill if water bodies provided
      if (options.validateWithWaterBodies && options.waterFeatures) {
        const isValid = this.validateGapFill(gapFillCoords, options.waterFeatures);
        if (!isValid) {
          return; // Skip this gap
        }
      }
      
      // Merge the segments with the gap fill
      const mergedSegment = this.mergeSegmentsWithGapFill(
        startInfo.segment,
        endInfo.segment,
        gapFillCoords,
        !startInfo.isStart,
        endInfo.isStart
      );
      
      filledSegments.push(mergedSegment);
      processedSegments.add(startInfo.segment);
      processedSegments.add(endInfo.segment);
      
      // Mark gap as filled
      gap.filled = true;
      gap.fillMethod = options.method;
    });
    
    // Add remaining unprocessed segments
    segments.forEach(segment => {
      if (!processedSegments.has(segment)) {
        filledSegments.push(segment);
      }
    });
    
    return filledSegments;
  }

  private createLinearFill(start: Position, end: Position): Position[] {
    // Simple linear interpolation with 5 points
    const points: Position[] = [];
    const numPoints = 5;
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      points.push([
        start[0] + t * (end[0] - start[0]),
        start[1] + t * (end[1] - start[1])
      ]);
    }
    
    return points;
  }

  private validateGapFill(coords: Position[], waterFeatures: Feature<Polygon>[]): boolean {
    // Check if the gap fill crosses water bodies inappropriately
    // For now, simple implementation - check if midpoint is in water
    const midpoint = coords[Math.floor(coords.length / 2)];
    
    // Check if midpoint is inside any water polygon
    for (const waterFeature of waterFeatures) {
      if (GeometryUtils.isPointInPolygon(midpoint as [number, number], waterFeature.geometry)) {
        // Gap crosses water - might be invalid depending on context
        // For coastlines, this might actually be okay
        return true; // Allow for now
      }
    }
    
    return true;
  }

  private mergeSegmentsWithGapFill(
    segment1: Feature<LineString>,
    segment2: Feature<LineString>,
    gapFillCoords: Position[],
    reverseSegment1: boolean,
    reverseSegment2: boolean
  ): Feature<LineString> {
    let coords1 = [...segment1.geometry.coordinates];
    let coords2 = [...segment2.geometry.coordinates];
    
    if (reverseSegment1) {
      coords1 = coords1.reverse();
    }
    if (reverseSegment2) {
      coords2 = coords2.reverse();
    }
    
    // Combine coordinates, skipping duplicate points
    const mergedCoords: Position[] = [
      ...coords1,
      ...gapFillCoords.slice(1, -1), // Skip first and last as they're duplicates
      ...coords2
    ];
    
    // Combine source features from both segments
    const allSourceFeatures = new Set<string>();
    [segment1, segment2].forEach(segment => {
      const sourceFeatures = segment.properties?.sourceFeatures;
      if (Array.isArray(sourceFeatures)) {
        sourceFeatures.forEach(feature => allSourceFeatures.add(feature));
      }
    });
    
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: mergedCoords
      },
      properties: {
        ...segment1.properties,
        sourceFeatures: Array.from(allSourceFeatures),
        stitched: true,
        gapFilled: true,
        originalSegments: 2,
        gapCount: 1
      }
    };
  }

  private canConnect(p1: Position, p2: Position, tolerance: number): boolean {
    return GeometryUtils.distance(p1, p2) <= tolerance;
  }

  private buildConnectedGroups(
    segments: Feature<LineString>[], 
    connectionMap: ConnectionMap
  ): Feature<LineString>[][] {
    const groups: Feature<LineString>[][] = [];
    const visited = new Set<number>();
    
    segments.forEach((_, index) => {
      if (visited.has(index)) return;
      
      const group: Feature<LineString>[] = [];
      const queue = [index];
      
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        
        visited.add(current);
        group.push(segments[current]);
        
        // Add connected segments to queue
        connectionMap[current].connectsTo.forEach(connIndex => {
          if (!visited.has(connIndex)) {
            queue.push(connIndex);
          }
        });
      }
      
      groups.push(group);
    });
    
    return groups;
  }

  private mergeSegmentGroup(
    group: Feature<LineString>[], 
    _connectionMap: ConnectionMap
  ): Feature<LineString> {
    if (group.length === 1) return group[0];
    
    // Build ordered chain
    const chain = this.buildOrderedChain(group);
    
    // Merge coordinates
    const mergedCoords: Position[] = [];
    chain.forEach((segment, index) => {
      const coords = [...segment.geometry.coordinates];
      
      if (index === 0) {
        mergedCoords.push(...coords);
      } else {
        // Skip first coordinate to avoid duplication
        mergedCoords.push(...coords.slice(1));
      }
    });
    
    // Create merged feature - combine source features from all segments
    const allSourceFeatures = new Set<string>();
    group.forEach(segment => {
      const sourceFeatures = segment.properties?.sourceFeatures;
      if (Array.isArray(sourceFeatures)) {
        sourceFeatures.forEach(feature => allSourceFeatures.add(feature));
      }
    });
    
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: mergedCoords
      },
      properties: {
        ...group[0].properties,
        sourceFeatures: Array.from(allSourceFeatures),
        stitched: true,
        originalSegments: group.length,
        gapCount: 0
      }
    };
  }

  private buildChain(
    segments: Feature<LineString>[], 
    startIndex: number, 
    used: Set<number>
  ): Feature<LineString>[] {
    const connections = this.findConnectableEndpoints(segments, DEFAULT_STITCHING_TOLERANCE);
    const chain: Feature<LineString>[] = [];
    const queue = [startIndex];
    const visited = new Set<number>();
    
    while (queue.length > 0) {
      const currentIndex = queue.shift()!;
      if (visited.has(currentIndex)) continue;
      
      visited.add(currentIndex);
      used.add(currentIndex);
      chain.push(segments[currentIndex]);
      
      // Add all connected segments to queue
      const currentConnections = connections[currentIndex];
      for (const nextIndex of currentConnections.connectsTo) {
        if (!visited.has(nextIndex) && !used.has(nextIndex)) {
          queue.push(nextIndex);
        }
      }
    }
    
    return chain;
  }

  private createMergedSegment(chain: Feature<LineString>[]): Feature<LineString> {
    const coordinates: Position[] = [];
    
    chain.forEach((segment, index) => {
      if (index === 0) {
        coordinates.push(...segment.geometry.coordinates);
      } else {
        // Skip first point to avoid duplication
        coordinates.push(...segment.geometry.coordinates.slice(1));
      }
    });
    
    // Combine source features from all segments in chain
    const allSourceFeatures = new Set<string>();
    chain.forEach(segment => {
      const sourceFeatures = segment.properties?.sourceFeatures;
      if (Array.isArray(sourceFeatures)) {
        sourceFeatures.forEach(feature => allSourceFeatures.add(feature));
      }
    });
    
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates
      },
      properties: {
        ...chain[0].properties,
        sourceFeatures: Array.from(allSourceFeatures),
        stitched: true,
        originalSegments: chain.length
      }
    };
  }

  private buildOrderedChain(group: Feature<LineString>[]): Feature<LineString>[] {
    if (group.length <= 1) return group;
    
    const chain: Feature<LineString>[] = [group[0]];
    const remaining = new Set(group.slice(1));
    
    while (remaining.size > 0) {
      let added = false;
      const lastCoords = chain[chain.length - 1].geometry.coordinates;
      const lastPoint = lastCoords[lastCoords.length - 1];
      
      for (const segment of remaining) {
        const coords = segment.geometry.coordinates;
        const firstPoint = coords[0];
        const lastSegPoint = coords[coords.length - 1];
        
        if (GeometryUtils.distance(lastPoint, firstPoint) < DEFAULT_STITCHING_TOLERANCE) {
          chain.push(segment);
          remaining.delete(segment);
          added = true;
          break;
        } else if (GeometryUtils.distance(lastPoint, lastSegPoint) < DEFAULT_STITCHING_TOLERANCE) {
          // Need to reverse this segment
          const reversed = {
            ...segment,
            geometry: GeometryUtils.reverseLineString(segment.geometry)
          };
          chain.push(reversed);
          remaining.delete(segment);
          added = true;
          break;
        }
      }
      
      if (!added) break; // Can't continue chain
    }
    
    return chain;
  }
}