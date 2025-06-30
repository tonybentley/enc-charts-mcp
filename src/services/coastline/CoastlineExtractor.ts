import { Feature, LineString, Polygon, MultiPolygon, Position } from 'geojson';
import * as turf from '@turf/helpers';
import polygonToLine from '@turf/polygon-to-line';
import { CoastlineType, CoastlineSubType } from '../../types/coastline.js';
import { 
  S57_COASTLINE_FEATURES, 
  S57_WATER_FEATURES, 
  S57_LAND_FEATURES,
  S57_SHORELINE_CONSTRUCTION_FEATURES,
  S57_HARBOR_FEATURES,
  S57_SPECIAL_FEATURES,
  S57_INFRASTRUCTURE_FEATURES,
  S57_PORT_FEATURES,
  S57_BOUNDARY_FEATURES,
  S57_TIDAL_FEATURES,
  S57_NATURAL_BOUNDARY_FEATURES,
  S57_ADDITIONAL_INFRASTRUCTURE_FEATURES,
  S57_ADMINISTRATIVE_BOUNDARY_FEATURES,
  S57_SPECIALIZED_PORT_FEATURES,
  S57_DEPTH_CHANNEL_FEATURES,
  S57_RESTRICTED_AREA_FEATURES,
  S57_VALIDATION_FEATURES
} from '../../constants/coastline.js';
import { GeometryUtils } from '../geometry/GeometryUtils.js';

export class CoastlineExtractor {
  extractFromDepthAreas(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    // Extract from DEPARE with DRVAL1=0 (exposed at low tide)
    features
      .filter(f => 
        f.geometry?.type === 'Polygon' && 
        f.properties?.['_featureType'] === 'DEPARE' &&
        f.properties?.['DRVAL1'] === 0
      )
      .forEach(feature => {
        const polygon = feature as Feature<Polygon>;
        const lines = this.polygonToLines(polygon);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: ['DEPARE'],
              type: 'coastline' as CoastlineType,
              subType: 'lowtide',
              depthValue: 0,
              originalProperties: feature.properties
            }
          });
        });
      });

    // Extract from shallow DEPARE (0-2m) for tidal zones
    features
      .filter(f => 
        f.geometry?.type === 'Polygon' && 
        f.properties?.['_featureType'] === 'DEPARE' &&
        typeof f.properties?.['DRVAL1'] === 'number' &&
        f.properties?.['DRVAL1'] > 0 &&
        f.properties?.['DRVAL1'] <= 2
      )
      .forEach(feature => {
        const polygon = feature as Feature<Polygon>;
        const lines = this.polygonToLines(polygon);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: ['DEPARE'],
              type: 'shoreline' as CoastlineType,
              subType: 'shallow',
              depthValue: feature.properties?.['DRVAL1'],
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  extractFromDepthContours(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    // Extract DEPCNT features with VALDCO=0 (0m depth contours)
    features
      .filter(f => 
        f.geometry?.type === 'LineString' &&
        f.properties?.['_featureType'] === 'DEPCNT' &&
        f.properties?.['VALDCO'] === 0
      )
      .forEach(feature => {
        const line = feature as Feature<LineString>;
        coastlines.push({
          type: 'Feature',
          geometry: line.geometry,
          properties: {
            ...line.properties,
            source: 'explicit',
            sourceFeatures: ['DEPCNT'],
            type: 'coastline' as CoastlineType,
            subType: 'contour',
            depthValue: 0,
            originalProperties: feature.properties
          }
        });
      });

    // Extract shallow depth contours (1-2m) for reference
    features
      .filter(f => 
        f.geometry?.type === 'LineString' &&
        f.properties?.['_featureType'] === 'DEPCNT' &&
        typeof f.properties?.['VALDCO'] === 'number' &&
        f.properties?.['VALDCO'] > 0 &&
        f.properties?.['VALDCO'] <= 2
      )
      .forEach(feature => {
        const line = feature as Feature<LineString>;
        coastlines.push({
          type: 'Feature',
          geometry: line.geometry,
          properties: {
            ...line.properties,
            source: 'explicit',
            sourceFeatures: ['DEPCNT'],
            type: 'shoreline' as CoastlineType,
            subType: 'shallow_contour',
            depthValue: feature.properties?.['VALDCO'],
            originalProperties: feature.properties
          }
        });
      });

    return coastlines;
  }

  extractFromLandAreas(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => 
        (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') &&
        S57_LAND_FEATURES.includes(f.properties?.['_featureType'])
      )
      .forEach(feature => {
        const lines = this.geometryToLines(feature);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: [feature.properties?.['_featureType'] || 'LNDARE'],
              type: 'coastline' as CoastlineType,
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  extractExplicitCoastlines(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => 
        f.geometry?.type === 'LineString' &&
        S57_COASTLINE_FEATURES.includes(f.properties?.['_featureType'])
      )
      .forEach(feature => {
        const line = feature as Feature<LineString>;
        coastlines.push({
          type: 'Feature',
          geometry: line.geometry,
          properties: {
            ...line.properties,
            source: 'explicit',
            sourceFeatures: [feature.properties?.['_featureType'] || 'COALNE'],
            type: this.determineCoastlineType(feature),
            originalProperties: feature.properties
          }
        });
      });

    return coastlines;
  }

  classifyCoastlineType(line: Feature<LineString>, context: Feature[]): CoastlineSubType {
    const lineCoords = line.geometry.coordinates;
    const lineLength = GeometryUtils.lineLength(line.geometry);
    
    // Check if it's a closed loop (potential island)
    const isClosed = GeometryUtils.pointsEqual(
      lineCoords[0], 
      lineCoords[lineCoords.length - 1],
      0.0001
    );

    // Closed loops are likely islands (especially smaller ones)
    if (isClosed) {
      return 'island';
    }

    // Check for man-made structures based on properties
    const props = line.properties || {};
    const sourceType = props.sourceFeatures?.[0];
    
    if (sourceType === 'SLCONS') {
      const category = props.originalProperties?.['CATSLC'];
      if (category === 6) return 'pier';
      if (category === 15) return 'seawall';
      if (category === 16) return 'wharf';
    }

    // Check geometry characteristics
    const bearing = GeometryUtils.averageBearing(line.geometry);
    const bearingVariation = this.calculateBearingVariation(line.geometry);
    
    // Straight lines with low variation might be constructed
    if (bearingVariation < 10 && lineLength < 1000) {
      return 'pier';
    }

    // Default to mainland for larger or open features
    return 'mainland';
  }

  private determineCoastlineType(feature: Feature): CoastlineType {
    const featureType = feature.properties?.['_featureType'];
    
    if (featureType === 'SLCONS') {
      return 'constructed';
    } else if (featureType === 'COALNE') {
      return 'coastline';
    }
    
    return 'shoreline';
  }

  private polygonToLines(polygon: Feature<Polygon>): Feature<LineString>[] {
    try {
      // Ensure 2D coordinates for turf
      const coords2D = polygon.geometry.coordinates.map(ring => 
        ring.map(coord => [coord[0], coord[1]] as [number, number])
      );
      
      const polygon2D: Feature<Polygon> = {
        ...polygon,
        geometry: {
          type: 'Polygon',
          coordinates: coords2D
        }
      };
      
      const result = polygonToLine(polygon2D);
      if (result.type === 'Feature') {
        return [result as Feature<LineString>];
      } else if (result.type === 'FeatureCollection') {
        return result.features as Feature<LineString>[];
      }
      return [];
    } catch (error) {
      console.error('Error converting polygon to lines:', error);
      return [];
    }
  }

  private geometryToLines(feature: Feature): Feature<LineString>[] {
    if (!feature.geometry) return [];

    switch (feature.geometry.type) {
      case 'LineString':
        return [{
          type: 'Feature',
          geometry: feature.geometry,
          properties: {}
        }];
      case 'Polygon':
        return this.polygonToLines(feature as Feature<Polygon>);
      case 'MultiPolygon':
        const lines: Feature<LineString>[] = [];
        const multiPolygon = feature as Feature<MultiPolygon>;
        
        multiPolygon.geometry.coordinates.forEach(polygonCoords => {
          // Ensure 2D coordinates
          const coords2D = polygonCoords.map(ring => 
            ring.map(coord => [coord[0], coord[1]] as [number, number])
          );
          const polygon = turf.polygon(coords2D);
          lines.push(...this.polygonToLines(polygon));
        });
        
        return lines;
      default:
        return [];
    }
  }

  extractFromHarborFeatures(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => 
        (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') &&
        S57_HARBOR_FEATURES.includes(f.properties?.['_featureType'])
      )
      .forEach(feature => {
        const lines = this.geometryToLines(feature);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: [feature.properties?.['_featureType'] || 'HRBARE'],
              type: 'constructed' as CoastlineType,
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  extractFromMooringFeatures(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => 
        S57_SHORELINE_CONSTRUCTION_FEATURES.includes(f.properties?.['_featureType'])
      )
      .forEach(feature => {
        let lines: Feature<LineString>[] = [];
        
        if (feature.geometry?.type === 'LineString') {
          lines = [feature as Feature<LineString>];
        } else if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
          lines = this.geometryToLines(feature);
        }
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'explicit',
              sourceFeatures: [feature.properties?.['_featureType'] || 'MORFAC'],
              type: 'constructed' as CoastlineType,
              originalProperties: feature.properties
            }
          });
        });
      });

    console.log(`DEBUG: extractFromMooringFeatures returning ${coastlines.length} coastlines`);
    return coastlines;
  }

  extractFromSpecialFeatures(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => 
        S57_SPECIAL_FEATURES.includes(f.properties?.['_featureType'])
      )
      .forEach(feature => {
        let lines: Feature<LineString>[] = [];
        
        if (feature.geometry?.type === 'LineString') {
          lines = [feature as Feature<LineString>];
        } else if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
          // For features like causeways, we might want both edges
          const featureType = feature.properties?.['_featureType'];
          if (featureType === 'CAUSWY') {
            // Causeways have coastlines on both sides
            lines = this.geometryToLines(feature);
          } else {
            lines = this.geometryToLines(feature);
          }
        }
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: [feature.properties?.['_featureType'] || 'CAUSWY'],
              type: 'constructed' as CoastlineType,
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  // Infrastructure feature extraction methods
  extractFromBridges(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => f.properties?.['_featureType'] === 'BRIDGE')
      .forEach(feature => {
        const lines = this.geometryToLines(feature);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: ['BRIDGE'],
              type: 'constructed' as CoastlineType,
              subType: 'bridge',
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  extractFromPylons(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => f.properties?.['_featureType'] === 'PYLONS')
      .forEach(feature => {
        const lines = this.geometryToLines(feature);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: ['PYLONS'],
              type: 'constructed' as CoastlineType,
              subType: 'pylon',
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  extractFromCranes(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => f.properties?.['_featureType'] === 'CRANES')
      .forEach(feature => {
        const lines = this.geometryToLines(feature);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: ['CRANES'],
              type: 'constructed' as CoastlineType,
              subType: 'crane',
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  extractFromConveyors(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => f.properties?.['_featureType'] === 'CONVYR')
      .forEach(feature => {
        const lines = this.geometryToLines(feature);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: ['CONVYR'],
              type: 'constructed' as CoastlineType,
              subType: 'conveyor',
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  // Port feature extraction methods
  extractFromBerths(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => f.properties?.['_featureType'] === 'BERTHS')
      .forEach(feature => {
        const lines = this.geometryToLines(feature);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'explicit',
              sourceFeatures: ['BERTHS'],
              type: 'constructed' as CoastlineType,
              subType: 'berth',
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  extractFromTerminals(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => f.properties?.['_featureType'] === 'TERMNL')
      .forEach(feature => {
        const lines = this.geometryToLines(feature);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: ['TERMNL'],
              type: 'constructed' as CoastlineType,
              subType: 'terminal',
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  extractFromDryDocks(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => f.properties?.['_featureType'] === 'DRYDOC')
      .forEach(feature => {
        const lines = this.geometryToLines(feature);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'explicit',
              sourceFeatures: ['DRYDOC'],
              type: 'constructed' as CoastlineType,
              subType: 'drydock',
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  extractFromLockBasins(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => f.properties?.['_featureType'] === 'LOKBSN')
      .forEach(feature => {
        const lines = this.geometryToLines(feature);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'explicit',
              sourceFeatures: ['LOKBSN'],
              type: 'constructed' as CoastlineType,
              subType: 'lockbasin',
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  // Boundary feature extraction methods
  extractFromFenceLines(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => f.properties?.['_featureType'] === 'FNCLNE')
      .forEach(feature => {
        // For fence lines, we should only include those adjacent to water
        // TODO: Add spatial validation against water features
        const lines = this.geometryToLines(feature);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: ['FNCLNE'],
              type: 'constructed' as CoastlineType,
              subType: 'fence',
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  extractFromRailways(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => f.properties?.['_featureType'] === 'RAILWY')
      .forEach(feature => {
        // For railways, we should only include waterfront segments
        // TODO: Add proximity validation (within 50m of water)
        const lines = this.geometryToLines(feature);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: ['RAILWY'],
              type: 'constructed' as CoastlineType,
              subType: 'railway',
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  extractFromDumpingGrounds(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    features
      .filter(f => f.properties?.['_featureType'] === 'DMPGRD')
      .forEach(feature => {
        const lines = this.geometryToLines(feature);
        
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: ['DMPGRD'],
              type: 'constructed' as CoastlineType,
              subType: 'dumpingground',
              originalProperties: feature.properties
            }
          });
        });
      });

    return coastlines;
  }

  private calculateBearingVariation(line: LineString): number {
    const coords = line.coordinates;
    if (coords.length < 3) return 0;

    const bearings: number[] = [];
    for (let i = 1; i < coords.length; i++) {
      bearings.push(GeometryUtils.bearing(coords[i - 1], coords[i]));
    }

    const avgBearing = bearings.reduce((a, b) => a + b, 0) / bearings.length;
    const variance = bearings.reduce((sum, b) => {
      const diff = Math.abs(b - avgBearing);
      const normalizedDiff = diff > 180 ? 360 - diff : diff;
      return sum + normalizedDiff * normalizedDiff;
    }, 0) / bearings.length;

    return Math.sqrt(variance);
  }

  // Enhanced feature extraction methods from PRD_ENHANCED_COASTLINE_FEATURES.md

  extractFromTidalFeatures(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    // Extract from DEPARE with DRVAL1 < 0 (exposed at low tide)
    features
      .filter(f => 
        f.geometry?.type === 'Polygon' && 
        f.properties?.['_featureType'] === 'DEPARE' &&
        typeof f.properties?.['DRVAL1'] === 'number' &&
        f.properties?.['DRVAL1'] < 0
      )
      .forEach(feature => {
        const lines = this.geometryToLines(feature);
        lines.forEach(line => {
          coastlines.push({
            type: 'Feature',
            geometry: line.geometry,
            properties: {
              ...line.properties,
              source: 'derived',
              sourceFeatures: ['DEPARE_TIDAL'],
              type: 'coastline' as CoastlineType,
              subType: 'intertidal',
              tidalLevel: feature.properties?.['DRVAL1'],
              originalProperties: feature.properties
            }
          });
        });
      });

    // Extract from tidal features
    ['TIDEWY', 'SWPARE', 'VEGATN'].forEach(featureType => {
      features
        .filter(f => f.properties?.['_featureType'] === featureType)
        .forEach(feature => {
          const lines = this.geometryToLines(feature);
          lines.forEach(line => {
            coastlines.push({
              type: 'Feature',
              geometry: line.geometry,
              properties: {
                ...line.properties,
                source: 'derived',
                sourceFeatures: [featureType],
                type: 'coastline' as CoastlineType,
                subType: featureType === 'VEGATN' ? 'vegetation' : 'tidal',
                vegetationType: featureType === 'VEGATN' ? feature.properties?.['CATGVG'] : undefined,
                proximityToWater: 0, // These are water-adjacent by definition
                validationMethod: 'tidal-feature',
                originalProperties: feature.properties
              }
            });
          });
        });
    });

    return coastlines;
  }

  extractFromNaturalBoundaries(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    S57_NATURAL_BOUNDARY_FEATURES.forEach(featureType => {
      features
        .filter(f => f.properties?.['_featureType'] === featureType)
        .forEach(feature => {
          const lines = this.geometryToLines(feature);
          lines.forEach(line => {
            coastlines.push({
              type: 'Feature',
              geometry: line.geometry,
              properties: {
                ...line.properties,
                source: 'derived',
                sourceFeatures: [featureType],
                type: 'coastline' as CoastlineType,
                subType: 'natural',
                naturalFeatureType: featureType,
                validationMethod: 'natural-boundary',
                originalProperties: feature.properties
              }
            });
          });
        });
    });

    return coastlines;
  }

  extractFromAdditionalInfrastructure(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    S57_ADDITIONAL_INFRASTRUCTURE_FEATURES.forEach(featureType => {
      features
        .filter(f => f.properties?.['_featureType'] === featureType)
        .forEach(feature => {
          const lines = this.geometryToLines(feature);
          lines.forEach(line => {
            coastlines.push({
              type: 'Feature',
              geometry: line.geometry,
              properties: {
                ...line.properties,
                source: 'derived',
                sourceFeatures: [featureType],
                type: 'constructed' as CoastlineType,
                subType: 'infrastructure',
                infrastructureType: featureType,
                validationMethod: 'infrastructure-boundary',
                originalProperties: feature.properties
              }
            });
          });
        });
    });

    return coastlines;
  }

  extractFromAdministrativeBoundaries(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    S57_ADMINISTRATIVE_BOUNDARY_FEATURES.forEach(featureType => {
      features
        .filter(f => f.properties?.['_featureType'] === featureType)
        .forEach(feature => {
          const lines = this.geometryToLines(feature);
          lines.forEach(line => {
            coastlines.push({
              type: 'Feature',
              geometry: line.geometry,
              properties: {
                ...line.properties,
                source: 'derived',
                sourceFeatures: [featureType],
                type: 'coastline' as CoastlineType,
                subType: 'administrative',
                administrativeType: featureType,
                validationMethod: 'administrative-boundary',
                originalProperties: feature.properties
              }
            });
          });
        });
    });

    return coastlines;
  }

  extractFromSpecializedPortFeatures(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    S57_SPECIALIZED_PORT_FEATURES.forEach(featureType => {
      features
        .filter(f => f.properties?.['_featureType'] === featureType)
        .forEach(feature => {
          const lines = this.geometryToLines(feature);
          lines.forEach(line => {
            coastlines.push({
              type: 'Feature',
              geometry: line.geometry,
              properties: {
                ...line.properties,
                source: 'derived',
                sourceFeatures: [featureType],
                type: 'constructed' as CoastlineType,
                subType: 'port',
                infrastructureType: featureType,
                validationMethod: 'port-facility',
                originalProperties: feature.properties
              }
            });
          });
        });
    });

    return coastlines;
  }

  extractFromDepthChannels(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    S57_DEPTH_CHANNEL_FEATURES.forEach(featureType => {
      features
        .filter(f => f.properties?.['_featureType'] === featureType)
        .forEach(feature => {
          const lines = this.geometryToLines(feature);
          lines.forEach(line => {
            coastlines.push({
              type: 'Feature',
              geometry: line.geometry,
              properties: {
                ...line.properties,
                source: 'derived',
                sourceFeatures: [featureType],
                type: 'coastline' as CoastlineType,
                subType: 'channel',
                validationMethod: 'depth-channel',
                originalProperties: feature.properties
              }
            });
          });
        });
    });

    return coastlines;
  }

  extractFromRestrictedAreas(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    S57_RESTRICTED_AREA_FEATURES.forEach(featureType => {
      features
        .filter(f => f.properties?.['_featureType'] === featureType)
        .forEach(feature => {
          const lines = this.geometryToLines(feature);
          lines.forEach(line => {
            coastlines.push({
              type: 'Feature',
              geometry: line.geometry,
              properties: {
                ...line.properties,
                source: 'derived',
                sourceFeatures: [featureType],
                type: 'coastline' as CoastlineType,
                subType: 'restricted',
                validationMethod: 'restricted-area',
                originalProperties: feature.properties
              }
            });
          });
        });
    });

    return coastlines;
  }

  extractFromValidationFeatures(features: Feature[]): Feature<LineString>[] {
    const coastlines: Feature<LineString>[] = [];

    S57_VALIDATION_FEATURES.forEach(featureType => {
      features
        .filter(f => f.properties?.['_featureType'] === featureType)
        .forEach(feature => {
          const lines = this.geometryToLines(feature);
          lines.forEach(line => {
            coastlines.push({
              type: 'Feature',
              geometry: line.geometry,
              properties: {
                ...line.properties,
                source: 'derived',
                sourceFeatures: [featureType],
                type: 'coastline' as CoastlineType,
                subType: 'validation',
                validationMethod: featureType,
                originalProperties: feature.properties
              }
            });
          });
        });
    });

    return coastlines;
  }


  extractAllCoastlines(
    features: Feature[], 
    options: {
      useCoastlines: boolean;
      useDepthAreas: boolean;
      useLandAreas: boolean;
      useShorelineConstruction: boolean;
      useHarborFeatures?: boolean;
      useMooringFeatures?: boolean;
      useSpecialFeatures?: boolean;
      useDepthContours?: boolean;
      // Infrastructure features
      useBridges?: boolean;
      usePylons?: boolean;
      useCranes?: boolean;
      useConveyors?: boolean;
      // Port features
      useBerths?: boolean;
      useTerminals?: boolean;
      useDryDocks?: boolean;
      useLockBasins?: boolean;
      // Boundary features
      useFenceLines?: boolean;
      useRailways?: boolean;
      useDumpingGrounds?: boolean;
      // Enhanced features from PRD
      useTidalFeatures?: boolean;
      useNaturalBoundaries?: boolean;
      useAdditionalInfrastructure?: boolean;
      useAdministrativeBoundaries?: boolean;
      useSpecializedPortFeatures?: boolean;
      useDepthChannels?: boolean;
      useRestrictedAreas?: boolean;
      useValidationFeatures?: boolean;
    }
  ): Feature<LineString>[] {
    const allCoastlines: Feature<LineString>[] = [];

    // Priority order: explicit lines first, then derived boundaries
    
    // 1. Explicit coastlines and shoreline construction
    if (options.useCoastlines || options.useShorelineConstruction) {
      allCoastlines.push(...this.extractExplicitCoastlines(features));
    }

    // 2. 0m depth contours (high priority as they're explicit coastlines)
    if (options.useDepthContours) {
      allCoastlines.push(...this.extractFromDepthContours(features));
    }

    // 3. Depth areas with DRVAL1=0 (exposed at low tide)
    if (options.useDepthAreas) {
      allCoastlines.push(...this.extractFromDepthAreas(features));
    }

    // 4. Land area boundaries
    if (options.useLandAreas) {
      allCoastlines.push(...this.extractFromLandAreas(features));
    }
    
    // 5. Harbor and mooring features
    if (options.useHarborFeatures) {
      allCoastlines.push(...this.extractFromHarborFeatures(features));
    }
    
    if (options.useMooringFeatures) {
      allCoastlines.push(...this.extractFromMooringFeatures(features));
    }
    
    if (options.useSpecialFeatures) {
      allCoastlines.push(...this.extractFromSpecialFeatures(features));
    }

    // 6. Infrastructure features
    if (options.useBridges) {
      allCoastlines.push(...this.extractFromBridges(features));
    }
    
    if (options.usePylons) {
      allCoastlines.push(...this.extractFromPylons(features));
    }
    
    if (options.useCranes) {
      allCoastlines.push(...this.extractFromCranes(features));
    }
    
    if (options.useConveyors) {
      allCoastlines.push(...this.extractFromConveyors(features));
    }

    // 7. Port features
    if (options.useBerths) {
      allCoastlines.push(...this.extractFromBerths(features));
    }
    
    if (options.useTerminals) {
      allCoastlines.push(...this.extractFromTerminals(features));
    }
    
    if (options.useDryDocks) {
      allCoastlines.push(...this.extractFromDryDocks(features));
    }
    
    if (options.useLockBasins) {
      allCoastlines.push(...this.extractFromLockBasins(features));
    }

    // 8. Boundary features
    if (options.useFenceLines) {
      allCoastlines.push(...this.extractFromFenceLines(features));
    }
    
    if (options.useRailways) {
      allCoastlines.push(...this.extractFromRailways(features));
    }
    
    if (options.useDumpingGrounds) {
      allCoastlines.push(...this.extractFromDumpingGrounds(features));
    }

    // Enhanced features from PRD_ENHANCED_COASTLINE_FEATURES.md
    if (options.useTidalFeatures) {
      allCoastlines.push(...this.extractFromTidalFeatures(features));
    }

    if (options.useNaturalBoundaries) {
      allCoastlines.push(...this.extractFromNaturalBoundaries(features));
    }

    if (options.useAdditionalInfrastructure) {
      allCoastlines.push(...this.extractFromAdditionalInfrastructure(features));
    }

    if (options.useAdministrativeBoundaries) {
      allCoastlines.push(...this.extractFromAdministrativeBoundaries(features));
    }

    if (options.useSpecializedPortFeatures) {
      allCoastlines.push(...this.extractFromSpecializedPortFeatures(features));
    }

    if (options.useDepthChannels) {
      allCoastlines.push(...this.extractFromDepthChannels(features));
    }

    if (options.useRestrictedAreas) {
      allCoastlines.push(...this.extractFromRestrictedAreas(features));
    }

    if (options.useValidationFeatures) {
      allCoastlines.push(...this.extractFromValidationFeatures(features));
    }

    // Deduplicate based on geometry
    return this.deduplicateCoastlines(allCoastlines);
  }

  private deduplicateCoastlines(coastlines: Feature<LineString>[]): Feature<LineString>[] {
    // Feature priority (lower number = higher priority)
    const FEATURE_PRIORITY: Record<string, number> = {
      'BERTHS': 1,  // Highest - precise dock edges
      'TERMNL': 2,  // Terminal boundaries
      'DRYDOC': 3,  // Dry dock (engineered)
      'SLCONS': 4,  // Shoreline construction
      'PONTON': 5,  // Pontoons (elevated priority for marinas)
      'MORFAC': 6,  // Mooring facilities
      'FLODOC': 7,  // Floating docks
      'COALNE': 8,  // Natural coastline
      'DEPCNT': 9,  // 0m depth contours (explicit coastlines)
      'BRIDGE': 10, // Bridge structures
      'PYLONS': 11, // Pylons
      'CRANES': 12, // Cranes
      'CONVYR': 13, // Conveyors
      'LOKBSN': 14, // Lock basins
      'HRBARE': 15, // Harbor boundaries
      'CAUSWY': 16, // Causeways
      'FNCLNE': 17, // Fence lines
      'RAILWY': 18, // Railways
      'DMPGRD': 19, // Dumping grounds
      'LNDARE': 20, // Land area edges (less precise)
      'DEPARE': 21, // Depth-based (lowest priority)
    };

    // Group coastlines by similar geometry
    const geometryGroups = new Map<string, Feature<LineString>[]>();
    
    coastlines.forEach(coastline => {
      const key = this.geometryKey(coastline.geometry);
      if (!geometryGroups.has(key)) {
        geometryGroups.set(key, []);
      }
      geometryGroups.get(key)!.push(coastline);
    });

    // For each group, keep the highest priority feature
    const deduplicated: Feature<LineString>[] = [];
    
    geometryGroups.forEach(group => {
      if (group.length === 1) {
        deduplicated.push(group[0]);
      } else {
        // Sort by priority and keep the highest priority (lowest number)
        const sorted = group.sort((a, b) => {
          const sourceA = a.properties?.sourceFeatures?.[0] || 'unknown';
          const sourceB = b.properties?.sourceFeatures?.[0] || 'unknown';
          const priorityA = FEATURE_PRIORITY[sourceA] || 999;
          const priorityB = FEATURE_PRIORITY[sourceB] || 999;
          return priorityA - priorityB;
        });
        
        // Keep the highest priority feature but note that it represents multiple sources
        const best = sorted[0];
        const allSources = [...new Set(group.flatMap(f => f.properties?.sourceFeatures || []))];
        
        deduplicated.push({
          ...best,
          properties: {
            ...best.properties,
            sourceFeatures: allSources,
            deduplicated: true,
            duplicateCount: group.length
          }
        });
      }
    });

    return deduplicated;
  }

  private geometryKey(geometry: LineString): string {
    const coords = GeometryUtils.roundCoordinates(geometry.coordinates);
    return JSON.stringify(coords);
  }
}