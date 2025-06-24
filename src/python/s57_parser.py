#!/usr/bin/env python3
"""
S-57 Parser
Parses S-57 (ENC) files using GDAL and outputs GeoJSON format
"""
import json
import sys
import argparse
import logging
from typing import Dict, List, Any, Optional, Union
from pathlib import Path

try:
    from osgeo import gdal, ogr, osr
    # Enable GDAL exceptions
    gdal.UseExceptions()
except ImportError as e:
    # Output error as JSON for subprocess communication
    error_result = {
        "error": f"GDAL Python bindings not found: {str(e)}",
        "type": "ImportError",
        "hint": "Please install GDAL Python bindings: pip install GDAL or conda install -c conda-forge gdal"
    }
    print(json.dumps(error_result))
    sys.exit(1)


class S57ParseError(Exception):
    """Custom exception for S-57 parsing errors"""
    pass


class S57Feature:
    """Represents an S-57 feature"""
    def __init__(self, feature_id: str, geometry: Dict, properties: Dict):
        self.id = feature_id
        self.geometry = geometry
        self.properties = properties
    
    def to_dict(self) -> Dict:
        """Convert to GeoJSON feature format"""
        return {
            "type": "Feature",
            "id": self.id,
            "geometry": self.geometry,
            "properties": self.properties
        }


class S57Parser:
    """Parser for S-57 (ENC) files"""
    
    def __init__(self):
        """Initialize the parser"""
        self.logger = logging.getLogger(__name__)
        
    def open(self, file_path: str) -> gdal.Dataset:
        """
        Open an S-57 file
        
        Args:
            file_path: Path to the S-57 file
            
        Returns:
            GDAL Dataset object
            
        Raises:
            S57ParseError: If file cannot be opened
        """
        try:
            # Open with GDAL
            dataset = gdal.OpenEx(file_path, gdal.OF_VECTOR)
            if dataset is None:
                raise S57ParseError(f"Could not open file: {file_path}")
            return dataset
        except Exception as e:
            raise S57ParseError(f"Error opening file {file_path}: {str(e)}")
    
    def extract_layers(self, dataset: gdal.Dataset) -> List[Dict]:
        """
        Extract all layers from the dataset
        
        Args:
            dataset: GDAL Dataset
            
        Returns:
            List of layer information dictionaries
        """
        layers = []
        layer_count = dataset.GetLayerCount()
        
        for i in range(layer_count):
            layer = dataset.GetLayer(i)
            layers.append({
                'name': layer.GetName(),
                'layer': layer,
                'feature_count': layer.GetFeatureCount()
            })
        
        return layers
    
    def extract_features(self, layer: ogr.Layer) -> List[Dict]:
        """
        Extract all features from a layer
        
        Args:
            layer: OGR Layer object
            
        Returns:
            List of feature dictionaries
        """
        features = []
        layer.ResetReading()
        
        feature = layer.GetNextFeature()
        while feature:
            feature_dict = {
                'id': feature.GetFID(),
                'geometry': None,
                'properties': self.extract_feature_properties(feature)
            }
            
            # Extract geometry
            geometry = feature.GetGeometry()
            if geometry:
                feature_dict['geometry'] = self.convert_geometry_to_geojson(geometry)
            
            features.append(feature_dict)
            feature = layer.GetNextFeature()
        
        return features
    
    def extract_feature_properties(self, feature: ogr.Feature) -> Dict:
        """
        Extract properties from a feature
        
        Args:
            feature: OGR Feature object
            
        Returns:
            Dictionary of properties
        """
        properties = {}
        
        for i in range(feature.GetFieldCount()):
            field_defn = feature.GetFieldDefnRef(i)
            field_name = field_defn.GetName()
            field_value = feature.GetField(i)
            
            # Handle different field types
            if field_value is not None:
                properties[field_name] = field_value
        
        return properties
    
    def convert_geometry_to_geojson(self, geometry: ogr.Geometry) -> Optional[Dict]:
        """
        Convert OGR geometry to GeoJSON format
        
        Args:
            geometry: OGR Geometry object
            
        Returns:
            GeoJSON geometry dictionary or None if conversion fails
        """
        try:
            if not geometry:
                return None
            
            # Transform to WGS84 if needed
            geometry = self.transform_to_wgs84(geometry)
            
            geom_type = geometry.GetGeometryType()
            
            if geom_type == ogr.wkbPoint or geom_type == ogr.wkbPoint25D:
                return self._convert_point(geometry)
            elif geom_type == ogr.wkbLineString or geom_type == ogr.wkbLineString25D:
                return self._convert_linestring(geometry)
            elif geom_type == ogr.wkbPolygon or geom_type == ogr.wkbPolygon25D:
                return self._convert_polygon(geometry)
            elif geom_type == ogr.wkbMultiPoint or geom_type == ogr.wkbMultiPoint25D:
                return self._convert_multipoint(geometry)
            elif geom_type == ogr.wkbMultiLineString or geom_type == ogr.wkbMultiLineString25D:
                return self._convert_multilinestring(geometry)
            elif geom_type == ogr.wkbMultiPolygon or geom_type == ogr.wkbMultiPolygon25D:
                return self._convert_multipolygon(geometry)
            else:
                self.logger.warning(f"Unsupported geometry type: {geom_type}")
                return None
                
        except Exception as e:
            self.logger.error(f"Error converting geometry: {e}")
            return None
    
    def transform_to_wgs84(self, geometry: ogr.Geometry) -> ogr.Geometry:
        """
        Transform geometry to WGS84 if needed
        
        Args:
            geometry: OGR Geometry object
            
        Returns:
            Transformed geometry
        """
        srs = geometry.GetSpatialReference()
        if srs is None:
            return geometry
        
        # Check if already WGS84
        if srs.GetAuthorityCode(None) == "4326":
            return geometry
        
        # Create WGS84 reference
        wgs84 = osr.SpatialReference()
        wgs84.SetWellKnownGeogCS("WGS84")
        
        # Create transformation
        transform = osr.CoordinateTransformation(srs, wgs84)
        
        # Clone geometry to avoid modifying original
        new_geom = geometry.Clone()
        new_geom.Transform(transform)
        
        return new_geom
    
    def _convert_point(self, geometry: ogr.Geometry) -> Dict:
        """Convert point geometry to GeoJSON"""
        coords = [geometry.GetX(), geometry.GetY()]
        if geometry.GetGeometryType() == ogr.wkbPoint25D:
            coords.append(geometry.GetZ())
        return {
            "type": "Point",
            "coordinates": coords
        }
    
    def _convert_linestring(self, geometry: ogr.Geometry) -> Dict:
        """Convert linestring geometry to GeoJSON"""
        coords = []
        for i in range(geometry.GetPointCount()):
            point = geometry.GetPoint(i)
            coords.append(list(point))
        return {
            "type": "LineString",
            "coordinates": coords
        }
    
    def _convert_polygon(self, geometry: ogr.Geometry) -> Dict:
        """Convert polygon geometry to GeoJSON"""
        coords = []
        for i in range(geometry.GetGeometryCount()):
            ring = geometry.GetGeometryRef(i)
            ring_coords = []
            for j in range(ring.GetPointCount()):
                point = ring.GetPoint(j)
                ring_coords.append(list(point)[:2])  # Only X,Y for compatibility
            coords.append(ring_coords)
        return {
            "type": "Polygon",
            "coordinates": coords
        }
    
    def _convert_multipoint(self, geometry: ogr.Geometry) -> Dict:
        """Convert multipoint geometry to GeoJSON"""
        coords = []
        for i in range(geometry.GetGeometryCount()):
            point = geometry.GetGeometryRef(i)
            coords.append([point.GetX(), point.GetY()])
        return {
            "type": "MultiPoint",
            "coordinates": coords
        }
    
    def _convert_multilinestring(self, geometry: ogr.Geometry) -> Dict:
        """Convert multilinestring geometry to GeoJSON"""
        coords = []
        for i in range(geometry.GetGeometryCount()):
            linestring = geometry.GetGeometryRef(i)
            line_coords = []
            for j in range(linestring.GetPointCount()):
                point = linestring.GetPoint(j)
                line_coords.append(list(point))
            coords.append(line_coords)
        return {
            "type": "MultiLineString",
            "coordinates": coords
        }
    
    def _convert_multipolygon(self, geometry: ogr.Geometry) -> Dict:
        """Convert multipolygon geometry to GeoJSON"""
        coords = []
        for i in range(geometry.GetGeometryCount()):
            polygon = geometry.GetGeometryRef(i)
            poly_coords = []
            for j in range(polygon.GetGeometryCount()):
                ring = polygon.GetGeometryRef(j)
                ring_coords = []
                for k in range(ring.GetPointCount()):
                    point = ring.GetPoint(k)
                    ring_coords.append(list(point)[:2])
                poly_coords.append(ring_coords)
            coords.append(poly_coords)
        return {
            "type": "MultiPolygon",
            "coordinates": coords
        }
    
    def parse(self, file_path: str, options: Optional[Dict] = None) -> Dict:
        """
        Parse S-57 file and return GeoJSON FeatureCollection
        
        Args:
            file_path: Path to S-57 file
            options: Optional parsing options
                - feature_types: List of feature types to include
                - bbox: Bounding box [minLon, minLat, maxLon, maxLat]
                
        Returns:
            GeoJSON FeatureCollection dictionary
        """
        if options is None:
            options = {}
        
        # Open dataset
        dataset = self.open(file_path)
        
        # Extract layers
        layers = self.extract_layers(dataset)
        
        # Collect all features
        all_features = []
        
        for layer_info in layers:
            layer_name = layer_info['name']
            layer = layer_info['layer']
            
            # Filter by feature types if specified
            if 'feature_types' in options:
                if layer_name not in options['feature_types']:
                    continue
            
            # Apply spatial filter if bbox specified
            if 'bbox' in options:
                bbox = options['bbox']
                layer.SetSpatialFilterRect(bbox[0], bbox[1], bbox[2], bbox[3])
            
            # Extract features
            features = self.extract_features(layer)
            
            # Add layer name to properties
            for feature in features:
                feature_id = f"{layer_name}.{feature['id']}"
                if feature['properties'] is None:
                    feature['properties'] = {}
                feature['properties']['_featureType'] = layer_name
                
                # Create S57Feature
                s57_feature = S57Feature(
                    feature_id,
                    feature['geometry'],
                    feature['properties']
                )
                all_features.append(s57_feature.to_dict())
        
        # Return as FeatureCollection
        return {
            "type": "FeatureCollection",
            "features": all_features
        }


def parse_args():
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(
        description='Parse S-57 (ENC) files and convert to GeoJSON'
    )
    parser.add_argument(
        'input',
        help='Input S-57 file path'
    )
    parser.add_argument(
        '-o', '--output',
        help='Output GeoJSON file (default: stdout)'
    )
    parser.add_argument(
        '-f', '--feature-types',
        nargs='+',
        help='Filter by feature types (e.g., DEPARE LIGHTS)'
    )
    parser.add_argument(
        '-b', '--bbox',
        nargs=4,
        type=float,
        metavar=('minLon', 'minLat', 'maxLon', 'maxLat'),
        help='Bounding box filter'
    )
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    
    return parser.parse_args()


def main():
    """Main function"""
    args = parse_args()
    
    # Configure logging
    if args.verbose:
        logging.basicConfig(level=logging.DEBUG)
    else:
        logging.basicConfig(level=logging.WARNING)
    
    # Build options
    options = {}
    if args.feature_types:
        options['feature_types'] = args.feature_types
    if args.bbox:
        options['bbox'] = args.bbox
    
    try:
        # Parse S-57 file
        parser = S57Parser()
        result = parser.parse(args.input, options)
        
        # Output result
        json_output = json.dumps(result, indent=2)
        
        if args.output:
            with open(args.output, 'w') as f:
                f.write(json_output)
            print(f"Output written to {args.output}")
        else:
            print(json_output)
        
        return 0
        
    except S57ParseError as e:
        # Output error as JSON for subprocess communication
        error_result = {"error": str(e), "type": "S57ParseError"}
        print(json.dumps(error_result))
        return 1
    except Exception as e:
        # Output error as JSON for subprocess communication
        error_result = {"error": f"Unexpected error: {str(e)}", "type": "UnexpectedError"}
        if args.verbose:
            import traceback
            error_result["traceback"] = traceback.format_exc()
        print(json.dumps(error_result))
        return 2


if __name__ == '__main__':
    sys.exit(main())