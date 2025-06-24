import { z } from 'zod';
import { NavigationRoute, Waypoint } from '../types/enc.js';

const CalculateRouteSchema = z.object({
  waypoints: z
    .array(
      z.object({
        lat: z.number(),
        lon: z.number(),
        name: z.string().optional(),
      })
    )
    .min(2),
  avoidAreas: z
    .array(
      z.object({
        minLat: z.number(),
        maxLat: z.number(),
        minLon: z.number(),
        maxLon: z.number(),
      })
    )
    .optional(),
});

export async function calculateRouteHandler(args: unknown): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const params = CalculateRouteSchema.parse(args);

  // TODO: Implement actual route calculation
  // This would use navigation algorithms considering:
  // - Chart depths
  // - Navigation hazards
  // - Traffic separation schemes
  // - Avoid areas
  
  // Simple great circle distance calculation for mock
  const calculateDistance = (wp1: Waypoint, wp2: Waypoint): number => {
    const R = 3440.1; // Earth radius in nautical miles
    const dLat = ((wp2.lat - wp1.lat) * Math.PI) / 180;
    const dLon = ((wp2.lon - wp1.lon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((wp1.lat * Math.PI) / 180) *
        Math.cos((wp2.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const calculateBearing = (wp1: Waypoint, wp2: Waypoint): number => {
    const dLon = ((wp2.lon - wp1.lon) * Math.PI) / 180;
    const lat1 = (wp1.lat * Math.PI) / 180;
    const lat2 = (wp2.lat * Math.PI) / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  };

  // Process waypoints
  const processedWaypoints: Waypoint[] = [];
  let totalDistance = 0;

  for (let i = 0; i < params.waypoints.length; i++) {
    const wp: Waypoint = { ...params.waypoints[i] };
    
    if (i < params.waypoints.length - 1) {
      const nextWp = params.waypoints[i + 1];
      wp.bearing = calculateBearing(wp, nextWp);
      wp.distance = calculateDistance(wp, nextWp);
      totalDistance += wp.distance || 0;
    }
    
    processedWaypoints.push(wp);
  }

  const route: NavigationRoute = {
    waypoints: processedWaypoints,
    distance: totalDistance,
    estimatedTime: totalDistance / 10, // Assuming 10 knots average speed
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            route,
            totalDistance: `${totalDistance.toFixed(1)} NM`,
            estimatedTime: `${route.estimatedTime.toFixed(1)} hours`,
            avoidAreasConsidered: params.avoidAreas?.length ?? 0,
          },
          null,
          2
        ),
      },
    ],
  };
}