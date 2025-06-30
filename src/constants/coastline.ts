export const S57_WATER_FEATURES = [
  'DEPARE', // Depth areas with DRVAL1 >= 0
  'DRGARE', // Dredged areas
  'CANALS', // Canals
  'RIVERS', // Rivers
  'LAKARE', // Lakes
] as const;

export const S57_LAND_FEATURES = [
  'LNDARE', // Land areas
  'BUAARE', // Built-up areas
  'LNDRGN', // Land regions
] as const;

export const S57_COASTLINE_FEATURES = [
  'COALNE', // Coastline
  'SLCONS', // Shoreline construction
] as const;

export const S57_SHORELINE_CONSTRUCTION_FEATURES = [
  'SLCONS', // Shoreline construction
  'MORFAC', // Mooring/warfage facility
  'PONTON', // Pontoon
  'FLODOC', // Floating dock
  'HULKES', // Hulks
] as const;

export const S57_HARBOR_FEATURES = [
  'HRBARE', // Harbor area
  'PRYARE', // Pilot boarding area
  'ACHARE', // Anchorage area
] as const;

export const S57_SPECIAL_FEATURES = [
  'CAUSWY', // Causeway
  'DAMCON', // Dam
  'GATCON', // Gate
] as const;

export const S57_INFRASTRUCTURE_FEATURES = [
  'BRIDGE', // Bridge structures
  'PYLONS', // Pylons/pillars
  'CRANES', // Crane structures
  'CONVYR', // Conveyor systems
] as const;

export const S57_PORT_FEATURES = [
  'BERTHS', // Berth structures
  'TERMNL', // Terminal boundaries
  'DRYDOC', // Dry dock
  'LOKBSN', // Lock basin
] as const;

export const S57_BOUNDARY_FEATURES = [
  'FNCLNE', // Fence line
  'RAILWY', // Railway
  'DMPGRD', // Dumping ground
] as const;

// Enhanced feature categories from PRD_ENHANCED_COASTLINE_FEATURES.md
export const S57_TIDAL_FEATURES = [
  'DEPARE_TIDAL', // Special handling for DEPARE with DRVAL1 < 0
  'TIDEWY', // Tideway (tidal channels)
  'SWPARE', // Swept area
  'VEGATN', // Vegetation (mangroves, marshes)
] as const;

export const S57_NATURAL_BOUNDARY_FEATURES = [
  'SBDARE', // Seabed area
  'SNDWAV', // Sand waves
  'UNSARE', // Unsurveyed area
  'ICEARE', // Ice area
] as const;

export const S57_ADDITIONAL_INFRASTRUCTURE_FEATURES = [
  'OFSPLF', // Offshore platform
  'PIPARE', // Pipeline area
  'PIPSOL', // Pipeline submarine/on land
  'CBLARE', // Cable area
  'CBLSUB', // Cable submarine
] as const;

export const S57_ADMINISTRATIVE_BOUNDARY_FEATURES = [
  'COSARE', // Continental shelf area
  'MIPARE', // Military practice area
  'ADMARE', // Administration area
  'CONZNE', // Contiguous zone
] as const;

export const S57_SPECIALIZED_PORT_FEATURES = [
  'HRBFAC', // Harbor facility
  'SMCFAC', // Small craft facility
  'CHKPNT', // Checkpoint
  'FORSTC', // Fortified structure
] as const;

export const S57_DEPTH_CHANNEL_FEATURES = [
  'DWRTCL', // Deep water route centerline
  'DWRTPT', // Deep water route part
] as const;

export const S57_RESTRICTED_AREA_FEATURES = [
  'CTNARE', // Caution area
  'RESARE', // Restricted area
] as const;

export const S57_VALIDATION_FEATURES = [
  'CURENT', // Current
  'WATTUR', // Water turbulence
  'STSLNE', // Shoreline stabilization line
] as const;

export const ALL_COASTLINE_FEATURES = [
  ...S57_COASTLINE_FEATURES,
  ...S57_SHORELINE_CONSTRUCTION_FEATURES,
  ...S57_HARBOR_FEATURES,
  ...S57_SPECIAL_FEATURES,
  ...S57_INFRASTRUCTURE_FEATURES,
  ...S57_PORT_FEATURES,
  ...S57_BOUNDARY_FEATURES,
  ...S57_TIDAL_FEATURES,
  ...S57_NATURAL_BOUNDARY_FEATURES,
  ...S57_ADDITIONAL_INFRASTRUCTURE_FEATURES,
  ...S57_ADMINISTRATIVE_BOUNDARY_FEATURES,
  ...S57_SPECIALIZED_PORT_FEATURES,
  ...S57_DEPTH_CHANNEL_FEATURES,
  ...S57_RESTRICTED_AREA_FEATURES,
  ...S57_VALIDATION_FEATURES,
  ...S57_LAND_FEATURES,
  'DEPARE', // For 0m depth boundaries
  'DEPCNT', // For 0m depth contours
  'DRGARE', // Dredged areas
] as const;

export const S57_NAVIGATION_FEATURES = [
  'FAIRWY', // Fairways
  'DWRTCL', // Deep water route centerline
  'NAVLNE', // Navigation line
  'RECTRC', // Recommended track
] as const;

export const S57_DANGER_FEATURES = [
  'OBSTRN', // Obstruction
  'WRECKS', // Wrecks
  'ROCKS',  // Rocks
  'UWTROC', // Underwater rocks
] as const;

export const FEATURE_CATEGORIES = {
  depths: ['DEPARE', 'DEPCNT', 'SOUNDG', 'DRGARE'],
  hazards: ['OBSTRN', 'WRECKS', 'ROCKS', 'UWTROC'],
  navAids: ['BOYLAT', 'BOYSAW', 'BOYCAR', 'BCNLAT', 'LIGHTS'],
  channels: ['FAIRWY', 'NAVLNE', 'DWRTPT', 'TSSLPT'],
  areas: ['PRCARE', 'RESARE', 'ACHARE', 'SPLARE'],
  // Enhanced categories from PRD
  tidal: [...S57_TIDAL_FEATURES],
  natural: [...S57_NATURAL_BOUNDARY_FEATURES],
  infrastructure: [...S57_INFRASTRUCTURE_FEATURES, ...S57_ADDITIONAL_INFRASTRUCTURE_FEATURES],
  administrative: [...S57_ADMINISTRATIVE_BOUNDARY_FEATURES],
  port: [...S57_PORT_FEATURES, ...S57_SPECIALIZED_PORT_FEATURES],
  boundary: [...S57_BOUNDARY_FEATURES],
  original: [...S57_COASTLINE_FEATURES, ...S57_SHORELINE_CONSTRUCTION_FEATURES, ...S57_HARBOR_FEATURES, ...S57_SPECIAL_FEATURES],
} as const;

export const DEFAULT_STITCHING_TOLERANCE = 50; // meters - increased for better gap handling
export const DEFAULT_SIMPLIFICATION_TOLERANCE = 5; // meters
export const DEFAULT_PAGINATION_LIMIT = 100;
export const MAX_PAGINATION_LIMIT = 1000;
export const MAX_RESPONSE_SIZE = 90000; // 90KB
export const WARNING_RESPONSE_SIZE = 75000; // 75KB
export const TARGET_RESPONSE_SIZE = 50000; // 50KB

export const COORDINATE_PRECISION = 6; // decimal places (~10cm accuracy)

export const EXTRACTION_DEFAULTS = {
  extractionMethod: 'combined' as const,
  featureSources: {
    useCoastlines: true,
    useDepthAreas: true,
    useDepthContours: true,
    useLandAreas: true,
    useShorelineConstruction: true,
    useHarborFeatures: true,
    useMooringFeatures: true,
    useSpecialFeatures: true,
    // Infrastructure features (default false for backward compatibility)
    useBridges: false,
    usePylons: false,
    useCranes: false,
    useConveyors: false,
    // Port features (default false)
    useBerths: false,
    useTerminals: false,
    useDryDocks: false,
    useLockBasins: false,
    // Boundary features (default false)
    useFenceLines: false,
    useRailways: false,
    useDumpingGrounds: false,
    // Enhanced features (default false for backward compatibility)
    useTidalFeatures: false,
    useNaturalBoundaries: false,
    useAdditionalInfrastructure: false,
    useAdministrativeBoundaries: false,
    useSpecializedPortFeatures: false,
    useDepthChannels: false,
    useRestrictedAreas: false,
    useValidationFeatures: false,
  },
  stitching: {
    enabled: true,
    tolerance: DEFAULT_STITCHING_TOLERANCE,
    mergeConnected: true,
    gapFilling: {
      enabled: true,
      maxGapDistance: 100,
      method: 'linear' as const,
      validateWithWaterBodies: true,
    },
  },
  simplification: {
    enabled: false,
    tolerance: DEFAULT_SIMPLIFICATION_TOLERANCE,
    preserveTopology: true,
  },
  classification: {
    separateByType: true,
    includeMetadata: true,
  },
};

export const WATER_LAND_DEFAULTS = {
  includeFeatures: {
    waterPolygons: true,
    landPolygons: true,
    coastlines: true,
    navigationAreas: false,
    dangers: false,
  },
  processing: {
    mergeAdjacentWater: true,
    fillGaps: true,
    smoothing: false,
  },
};