import { Feature, Polygon, MultiPolygon, LineString, Position, FeatureCollection } from 'geojson';
import union from '@turf/union';
import difference from '@turf/difference';
import buffer from '@turf/buffer';
import * as turf from '@turf/helpers';
import { 
  ClassifiedFeature, 
  NavigationArea, 
  ClassificationType,
  WaterLandProperties 
} from '../../types/coastline.js';
import {
  S57_WATER_FEATURES,
  S57_LAND_FEATURES,
  S57_NAVIGATION_FEATURES,
  S57_DANGER_FEATURES
} from '../../constants/coastline.js';
import { GeometryUtils } from '../geometry/GeometryUtils.js';

export class WaterLandClassifier {
  classifyFeatures(features: Feature[]): ClassifiedFeature[] {
    return features.map(feature => this.classifyFeature(feature));
  }

  mergeWaterPolygons(features: Feature<Polygon | MultiPolygon>[]): Feature<Polygon | MultiPolygon>[] {
    if (features.length === 0) return [];
    if (features.length === 1) return features;

    // Group connected water features
    const groups = this.findConnectedGroups(features);
    const merged: Feature<Polygon | MultiPolygon>[] = [];

    groups.forEach(group => {
      if (group.length === 1) {
        merged.push(group[0]);
      } else {
        const mergedPolygon = this.mergePolygonGroup(group);
        if (mergedPolygon) {
          merged.push(mergedPolygon);
        }
      }
    });

    return merged;
  }

  deriveLandPolygons(
    bounds: [number, number, number, number], 
    waterPolygons: Feature<Polygon | MultiPolygon>[]
  ): Feature<Polygon | MultiPolygon>[] {
    // Create bounding box polygon
    const [minLon, minLat, maxLon, maxLat] = bounds;
    const boundingPolygon = turf.polygon([[
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat]
    ]]);

    // If no water polygons, entire area is land
    if (waterPolygons.length === 0) {
      return [{
        ...boundingPolygon,
        properties: {
          classification: 'land' as ClassificationType,
          subType: 'mainland',
          source: 'derived'
        }
      }];
    }

    // Merge all water polygons into one
    let combinedWater = waterPolygons[0];
    for (let i = 1; i < waterPolygons.length; i++) {
      const fc = turf.featureCollection([combinedWater, waterPolygons[i]]);
      const merged = union(fc);
      if (merged) {
        combinedWater = merged as Feature<Polygon | MultiPolygon>;
      }
    }

    // Subtract water from bounding box to get land
    const fc = turf.featureCollection([boundingPolygon, combinedWater]);
    const landPolygon = difference(fc);
    
    if (!landPolygon) return [];

    return [{
      ...landPolygon,
      properties: {
        classification: 'land' as ClassificationType,
        subType: 'mainland',
        source: 'derived',
        area_km2: this.calculateArea(landPolygon)
      }
    } as Feature<Polygon | MultiPolygon>];
  }

  extractNavigationAreas(features: Feature[]): NavigationArea[] {
    const navAreas: NavigationArea[] = [];

    features
      .filter(f => 
        (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') &&
        S57_NAVIGATION_FEATURES.includes(f.properties?.['S57_TYPE'] || f.properties?.['OBJNAM'])
      )
      .forEach(feature => {
        const featureType = feature.properties?.['S57_TYPE'] || feature.properties?.['OBJNAM'];
        let navType: NavigationArea['properties']['type'] = 'channel';

        if (featureType === 'FAIRWY') navType = 'fairway';
        else if (featureType === 'ACHARE') navType = 'anchorage';
        else if (featureType === 'RESARE' || featureType === 'PRCARE') navType = 'restricted';

        navAreas.push({
          ...feature,
          properties: {
            type: navType,
            name: feature.properties?.['OBJNAM'] || undefined,
            depth_min: feature.properties?.['DRVAL1'] || undefined,
            depth_max: feature.properties?.['DRVAL2'] || undefined,
            navigable: navType !== 'restricted'
          }
        } as NavigationArea);
      });

    return navAreas;
  }

  classifyWaterLandFeatures(
    features: Feature[],
    options: {
      includeNavigation?: boolean;
      includeDangers?: boolean;
    } = {}
  ): {
    water: Feature<Polygon | MultiPolygon, WaterLandProperties>[];
    land: Feature<Polygon | MultiPolygon, WaterLandProperties>[];
    navigation: NavigationArea[];
    dangers: Feature[];
  } {
    const water: Feature<Polygon | MultiPolygon, WaterLandProperties>[] = [];
    const land: Feature<Polygon | MultiPolygon, WaterLandProperties>[] = [];
    const navigation: NavigationArea[] = [];
    const dangers: Feature[] = [];

    features.forEach(feature => {
      const featureType = feature.properties?.['S57_TYPE'] || feature.properties?.['OBJNAM'];
      
      if (S57_WATER_FEATURES.includes(featureType)) {
        if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
          water.push(this.createWaterFeature(feature));
        }
      } else if (S57_LAND_FEATURES.includes(featureType)) {
        if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
          land.push(this.createLandFeature(feature));
        }
      } else if (options.includeNavigation && S57_NAVIGATION_FEATURES.includes(featureType)) {
        const navArea = this.createNavigationArea(feature);
        if (navArea) navigation.push(navArea);
      } else if (options.includeDangers && S57_DANGER_FEATURES.includes(featureType)) {
        dangers.push(this.createDangerFeature(feature));
      }
    });

    return { water, land, navigation, dangers };
  }

  private classifyFeature(feature: Feature): ClassifiedFeature {
    const featureType = feature.properties?.['S57_TYPE'] || feature.properties?.['OBJNAM'] || '';
    let classification: ClassificationType = 'land';

    if (S57_WATER_FEATURES.includes(featureType)) {
      classification = 'water';
    } else if (S57_NAVIGATION_FEATURES.includes(featureType)) {
      classification = 'navigation';
    } else if (S57_DANGER_FEATURES.includes(featureType)) {
      classification = 'danger';
    } else if (feature.geometry?.type === 'LineString') {
      classification = 'coastline';
    }

    return {
      ...feature,
      properties: {
        ...feature.properties,
        classification,
        originalType: featureType
      }
    };
  }

  private findConnectedGroups(
    polygons: Feature<Polygon | MultiPolygon>[]
  ): Feature<Polygon | MultiPolygon>[][] {
    const groups: Feature<Polygon | MultiPolygon>[][] = [];
    const used = new Set<number>();

    polygons.forEach((polygon, index) => {
      if (used.has(index)) return;

      const group: Feature<Polygon | MultiPolygon>[] = [polygon];
      used.add(index);

      // Find all polygons that touch this one
      let foundNew = true;
      while (foundNew) {
        foundNew = false;
        
        polygons.forEach((otherPolygon, otherIndex) => {
          if (used.has(otherIndex)) return;
          
          // Check if this polygon touches any in the group
          const touches = group.some(groupPolygon => 
            this.polygonsTouchOrOverlap(groupPolygon, otherPolygon)
          );
          
          if (touches) {
            group.push(otherPolygon);
            used.add(otherIndex);
            foundNew = true;
          }
        });
      }

      groups.push(group);
    });

    return groups;
  }

  private mergePolygonGroup(
    group: Feature<Polygon | MultiPolygon>[]
  ): Feature<Polygon | MultiPolygon> | null {
    if (group.length === 0) return null;
    if (group.length === 1) return group[0];

    try {
      let merged = group[0];
      
      for (let i = 1; i < group.length; i++) {
        const fc = turf.featureCollection([merged, group[i]]);
        const result = union(fc);
        if (result) {
          merged = result as Feature<Polygon | MultiPolygon>;
        }
      }

      // Preserve properties from the largest original polygon
      const largestOriginal = group.reduce((largest, current) => {
        const currentArea = this.calculateArea(current);
        const largestArea = this.calculateArea(largest);
        return currentArea > largestArea ? current : largest;
      });

      merged.properties = {
        ...largestOriginal.properties,
        merged: true,
        originalCount: group.length
      };

      return merged;
    } catch (error) {
      console.error('Error merging polygon group:', error);
      return group[0]; // Return largest if merge fails
    }
  }

  private polygonsTouchOrOverlap(
    poly1: Feature<Polygon | MultiPolygon>,
    poly2: Feature<Polygon | MultiPolygon>
  ): boolean {
    try {
      // Buffer slightly to catch near-touches
      const buffered1 = buffer(poly1, 0.00001, { units: 'degrees' });
      const buffered2 = buffer(poly2, 0.00001, { units: 'degrees' });
      
      if (buffered1 && buffered2) {
        const fc = turf.featureCollection([buffered1, buffered2]);
        const intersection = union(fc);
        return intersection !== null;
      }
      return false;
    } catch {
      return false;
    }
  }

  private calculateArea(feature: Feature<Polygon | MultiPolygon>): number {
    if (feature.geometry.type === 'Polygon') {
      return GeometryUtils.calculatePolygonArea(feature.geometry);
    } else {
      return feature.geometry.coordinates.reduce((sum, polygon) => {
        return sum + GeometryUtils.calculatePolygonArea({ 
          type: 'Polygon', 
          coordinates: polygon 
        });
      }, 0);
    }
  }

  private createWaterFeature(
    feature: Feature
  ): Feature<Polygon | MultiPolygon, WaterLandProperties> {
    const area_km2 = this.calculateArea(feature as Feature<Polygon | MultiPolygon>);
    const depthRange = feature.properties?.['DRVAL1'] !== undefined
      ? {
          min: feature.properties['DRVAL1'],
          max: feature.properties['DRVAL2'] || feature.properties['DRVAL1']
        }
      : undefined;

    return {
      ...feature,
      properties: {
        classification: 'water',
        subType: this.getWaterSubType(feature),
        area_km2,
        depth_range: depthRange,
        navigable: true,
        source: feature.properties?.['S57_TYPE'] || 'unknown'
      }
    } as Feature<Polygon | MultiPolygon, WaterLandProperties>;
  }

  private createLandFeature(
    feature: Feature
  ): Feature<Polygon | MultiPolygon, WaterLandProperties> {
    const area_km2 = this.calculateArea(feature as Feature<Polygon | MultiPolygon>);

    return {
      ...feature,
      properties: {
        classification: 'land',
        subType: this.getLandSubType(feature),
        area_km2,
        source: feature.properties?.['S57_TYPE'] || 'unknown'
      }
    } as Feature<Polygon | MultiPolygon, WaterLandProperties>;
  }

  private createNavigationArea(feature: Feature): NavigationArea | null {
    if (feature.geometry?.type !== 'Polygon' && feature.geometry?.type !== 'MultiPolygon') {
      return null;
    }

    const featureType = feature.properties?.['S57_TYPE'] || feature.properties?.['OBJNAM'];
    let navType: NavigationArea['properties']['type'] = 'channel';

    if (featureType === 'FAIRWY') navType = 'fairway';
    else if (featureType === 'ACHARE') navType = 'anchorage';
    else if (featureType === 'RESARE' || featureType === 'PRCARE') navType = 'restricted';

    return {
      ...feature,
      properties: {
        type: navType,
        name: feature.properties?.['OBJNAM'] || undefined,
        depth_min: feature.properties?.['DRVAL1'] || undefined,
        depth_max: feature.properties?.['DRVAL2'] || undefined,
        navigable: navType !== 'restricted'
      }
    } as NavigationArea;
  }

  private createDangerFeature(feature: Feature): Feature {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        classification: 'danger',
        subType: this.getDangerSubType(feature)
      }
    };
  }

  private getWaterSubType(feature: Feature): string {
    const featureType = feature.properties?.['S57_TYPE'] || '';
    
    if (featureType === 'DEPARE') return 'ocean';
    if (featureType === 'LAKARE') return 'lake';
    if (featureType === 'RIVERS') return 'river';
    if (featureType === 'CANALS') return 'canal';
    if (featureType === 'DRGARE') return 'dredged_area';
    
    return 'water';
  }

  private getLandSubType(feature: Feature): string {
    const featureType = feature.properties?.['S57_TYPE'] || '';
    
    if (featureType === 'LNDARE') return 'mainland';
    if (featureType === 'BUAARE') return 'built_up';
    if (featureType === 'LNDRGN') return 'region';
    
    // Check if it's an island based on size
    const area = this.calculateArea(feature as Feature<Polygon | MultiPolygon>);
    if (area < 10) return 'island'; // Less than 10 km²
    
    return 'mainland';
  }

  private getDangerSubType(feature: Feature): string {
    const featureType = feature.properties?.['S57_TYPE'] || '';
    
    if (featureType === 'OBSTRN') return 'obstruction';
    if (featureType === 'WRECKS') return 'wreck';
    if (featureType === 'ROCKS') return 'rock';
    if (featureType === 'UWTROC') return 'underwater_rock';
    
    return 'hazard';
  }
}