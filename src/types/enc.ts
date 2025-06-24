export interface ChartMetadata {
  id: string;
  name: string;
  scale: number;
  format?: 'S-57' | 'S-101';
  bounds?: BoundingBox;
  boundingBox?: BoundingBox; // Deprecated, use bounds
  lastUpdate: string;
  updateDate?: Date; // Deprecated, use lastUpdate
  edition: number | string;
  producer?: string;
  coverageArea?: number;
  downloadUrl?: string;
  fileSize?: number;
  status?: string;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

import type { Geometry } from 'geojson';

export interface ChartFeature {
  id: string;
  type: S57ObjectClass;
  geometry: Geometry;
  properties: S57Properties;
}

export type S57ObjectClass = string;

export interface S57Properties {
  // Feature type from S-57 layer
  _featureType?: string;
  
  // Common properties
  OBJNAM?: string;  // Object name
  INFORM?: string;  // Additional information
  SCAMIN?: number;  // Minimum scale for display
  LNAM?: string;    // Long name identifier
  
  // Depth properties
  DRVAL1?: number;  // Depth range minimum (meters)
  DRVAL2?: number;  // Depth range maximum (meters)
  VALDCO?: number;  // Depth contour value
  VALSOU?: number;  // Sounding value
  
  // Navigation aid properties
  COLOUR?: string;  // Color codes (e.g., "1,3" for white,red)
  COLPAT?: string;  // Color pattern
  LITCHR?: string;  // Light characteristic
  SIGPER?: number;  // Signal period in seconds
  VALNMR?: number;  // Nominal range in nautical miles
  HEIGHT?: number;  // Height above water
  
  // Shape and category
  BOYSHP?: number;  // Buoy shape (1=conical, 2=can, 3=spherical, etc.)
  CATLAM?: number;  // Category of lateral mark
  CATOBS?: number;  // Category of obstruction
  
  // Quality indicators
  SORDAT?: string;  // Source date
  SORIND?: string;  // Source indication
  QUASOU?: number;  // Quality of sounding
  TECSOU?: number;  // Technique of sounding
  
  // Additional properties
  [key: string]: unknown;
}

export interface NavigationRoute {
  waypoints: Waypoint[];
  distance: number;
  estimatedTime: number;
}

export interface Waypoint {
  lat: number;
  lon: number;
  name?: string;
  bearing?: number;
  distance?: number;
}