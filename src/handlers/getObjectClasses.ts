import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { S57_OBJECT_CATALOGUE, FEATURE_CATEGORIES, S57ObjectClassDefinition } from '../constants/s57.js';

interface GetObjectClassesInput {
  category?: keyof typeof FEATURE_CATEGORIES;
  search?: string;
  includeAttributes?: boolean;
}

interface ObjectClassInfo extends S57ObjectClassDefinition {
  category?: string;
  attributes?: string[];
  navigationSignificance?: string;
}

// Common S-57 attributes for different object classes
const COMMON_ATTRIBUTES: Record<string, string[]> = {
  // Navigation aids
  LIGHTS: ['LITCHR', 'SIGPER', 'COLOUR', 'VALNMR', 'HEIGHT', 'CATLIT'],
  BOYLAT: ['BOYSHP', 'CATLAM', 'COLOUR', 'COLPAT', 'CONRAD', 'MARSYS'],
  BOYSAW: ['BOYSHP', 'COLOUR', 'COLPAT', 'CONRAD', 'MARSYS'],
  BCNLAT: ['BCNSHP', 'CATLAM', 'COLOUR', 'COLPAT', 'HEIGHT', 'NATCON'],
  
  // Depth features
  DEPARE: ['DRVAL1', 'DRVAL2', 'QUASOU', 'SOUACC', 'VERDAT'],
  DEPCNT: ['VALDCO', 'VERDAT'],
  SOUNDG: ['DEPTH', 'QUASOU', 'SOUACC', 'TECSOU', 'VERDAT'],
  OBSTRN: ['CATOBS', 'VALSOU', 'WATLEV', 'NATCON', 'EXPSOU'],
  
  // Areas
  RESARE: ['CATREA', 'RESTRN', 'DATSTA', 'DATEND', 'PERSTA', 'PEREND'],
  ACHARE: ['CATACH', 'RESTRN', 'STATUS'],
  FAIRWY: ['ORIENT', 'STATUS', 'TRAFIC'],
  
  // Infrastructure
  BRIDGE: ['CATBRG', 'VERCCL', 'VERCLR', 'VERCOP', 'HORCLR', 'NATCON'],
  PIPOHD: ['CATPIP', 'VERCLR', 'PRODCT', 'STATUS'],
  CBLOHD: ['CATCBL', 'VERCLR', 'VERCSA', 'ICEFAC'],
};

// Navigation significance descriptions
const NAVIGATION_SIGNIFICANCE: Record<string, string> = {
  // Navigation Aids
  LIGHTS: 'Essential for night navigation. Properties include light characteristic (flashing pattern), period, color, and range.',
  BOYLAT: 'Lateral marks indicate port/starboard sides of channels. Red (port) and green (starboard) in IALA-B.',
  BOYSAW: 'Safe water marks indicate navigable water all around. Typically red/white vertical stripes.',
  BOYCAR: 'Cardinal marks indicate safe water direction relative to a hazard (N, S, E, W).',
  BCNLAT: 'Fixed lateral marks on shore/structures. Same color conventions as lateral buoys.',
  BCNSAW: 'Fixed safe water marks. Indicate channel centerlines or landfall points.',
  DAYMAR: 'Visual navigation marks without lights. Shape and color indicate purpose.',
  TOPMAR: 'Topmarks on buoys/beacons enhance visual identification. Shape indicates mark type.',
  
  // Depth Information
  DEPARE: 'Depth areas define regions within specific depth ranges. Critical for draft restrictions.',
  DEPCNT: 'Depth contour lines show specific depths. Standard contours: 5m, 10m, 20m, etc.',
  SOUNDG: 'Individual depth measurements. Most accurate depth information available.',
  DRGARE: 'Dredged areas with maintained depths. Usually channels and harbor basins.',
  OBSTRN: 'Underwater obstructions. May have unknown depth - always avoid.',
  UWTROC: 'Underwater or awash rocks. Extreme navigation hazards.',
  
  // Channels and Routes
  FAIRWY: 'Designated navigation channels with safe depths for vessel traffic.',
  NAVLNE: 'Recommended navigation lines for optimal routing.',
  DWRTPT: 'Deep water route parts for deep-draft vessels.',
  TSSLPT: 'Traffic separation scheme lanes for organized vessel traffic.',
  RECTRC: 'Recommended tracks between ports or through areas.',
  
  // Restricted Areas
  RESARE: 'Restricted areas with special regulations. Check RESTRN attribute for details.',
  PRCARE: 'Precautionary areas requiring extra navigation care.',
  ACHARE: 'Designated anchorage areas. May have depth/vessel restrictions.',
  MIPARE: 'Military practice areas. May be activated periodically.',
  
  // Natural Features
  COALNE: 'Coastline defining land/water boundary. Reference for distance calculations.',
  LNDARE: 'Land areas. Used for chart display and collision avoidance.',
  RIVERS: 'Rivers may have currents and depth variations.',
  ROCKS: 'Above-water rocks. Major navigation hazards.',
  
  // Infrastructure
  BRIDGE: 'Bridges with vertical and horizontal clearances. Critical for passage planning.',
  CBLOHD: 'Overhead cables with vertical clearance. Hazard for tall vessels.',
  PIPOHD: 'Overhead pipelines. Similar concerns as cables.',
  PONTON: 'Floating structures used for mooring or access.',
  
  // Hazards
  WRECKS: 'Shipwrecks that may be navigation hazards. Check depth clearance.',
  FOULGRD: 'Foul ground unsuitable for anchoring. May snag anchors.',
};

export async function getObjectClassesHandler(input: unknown): Promise<CallToolResult> {
  const args = input as GetObjectClassesInput;
  
  try {
    let objectClasses: ObjectClassInfo[] = [];
    
    // Get all object classes
    for (const [acronym, definition] of Object.entries(S57_OBJECT_CATALOGUE)) {
      const info: ObjectClassInfo = {
        ...definition,
      };
      
      // Find category
      for (const [cat, items] of Object.entries(FEATURE_CATEGORIES)) {
        if ((items as readonly string[]).includes(acronym)) {
          info.category = cat;
          break;
        }
      }
      
      // Add attributes if requested
      if (args.includeAttributes && COMMON_ATTRIBUTES[acronym]) {
        info.attributes = COMMON_ATTRIBUTES[acronym];
      }
      
      // Add navigation significance
      if (NAVIGATION_SIGNIFICANCE[acronym]) {
        info.navigationSignificance = NAVIGATION_SIGNIFICANCE[acronym];
      }
      
      objectClasses.push(info);
    }
    
    // Filter by category if specified
    if (args.category) {
      objectClasses = objectClasses.filter(oc => oc.category === args.category);
    }
    
    // Search filter if specified
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      objectClasses = objectClasses.filter(oc => 
        oc.acronym.toLowerCase().includes(searchLower) ||
        oc.description.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort by code
    objectClasses.sort((a, b) => a.code - b.code);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            totalClasses: objectClasses.length,
            objectClasses: objectClasses,
            categories: Object.keys(FEATURE_CATEGORIES),
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error retrieving object classes: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    };
  }
}