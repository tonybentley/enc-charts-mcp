#!/usr/bin/env python3
"""
Mock S-57 Parser for testing when GDAL is not available
Generates realistic test data for integration tests
"""
import json
import sys
import os
from pathlib import Path

def generate_mock_features(file_path):
    """Generate mock S-57 features based on file name"""
    base_name = Path(file_path).stem
    
    # Default coordinates (San Diego area)
    center_lon = -117.2279
    center_lat = 32.7144
    
    # Generate different features based on chart ID patterns
    features = []
    
    # Add depth area feature
    features.append({
        "type": "Feature",
        "id": f"{base_name}_DEPARE_001",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [center_lon - 0.01, center_lat - 0.01],
                [center_lon + 0.01, center_lat - 0.01],
                [center_lon + 0.01, center_lat + 0.01],
                [center_lon - 0.01, center_lat + 0.01],
                [center_lon - 0.01, center_lat - 0.01]
            ]]
        },
        "properties": {
            "_featureType": "DEPARE",
            "DRVAL1": 5.0,
            "DRVAL2": 10.0,
            "OBJNAM": "Shallow Water Area"
        }
    })
    
    # Add navigation light
    features.append({
        "type": "Feature",
        "id": f"{base_name}_LIGHTS_001",
        "geometry": {
            "type": "Point",
            "coordinates": [center_lon, center_lat]
        },
        "properties": {
            "_featureType": "LIGHTS",
            "LITCHR": "2",  # Flashing
            "SIGPER": 4.0,
            "COLOUR": "1,3",  # White, Red
            "VALNMR": 15.0,
            "OBJNAM": "Harbor Light"
        }
    })
    
    # Add depth contour
    features.append({
        "type": "Feature",
        "id": f"{base_name}_DEPCNT_001",
        "geometry": {
            "type": "LineString",
            "coordinates": [
                [center_lon - 0.02, center_lat],
                [center_lon - 0.01, center_lat + 0.005],
                [center_lon, center_lat],
                [center_lon + 0.01, center_lat - 0.005],
                [center_lon + 0.02, center_lat]
            ]
        },
        "properties": {
            "_featureType": "DEPCNT",
            "VALDCO": 10.0
        }
    })
    
    # Add soundings
    for i in range(3):
        features.append({
            "type": "Feature",
            "id": f"{base_name}_SOUNDG_{i:03d}",
            "geometry": {
                "type": "Point",
                "coordinates": [
                    center_lon + (i - 1) * 0.005,
                    center_lat + (i - 1) * 0.003
                ]
            },
            "properties": {
                "_featureType": "SOUNDG",
                "VALSOU": 8.5 + i * 2.0
            }
        })
    
    # Add lateral buoy
    features.append({
        "type": "Feature",
        "id": f"{base_name}_BOYLAT_001",
        "geometry": {
            "type": "Point",
            "coordinates": [center_lon + 0.005, center_lat + 0.005]
        },
        "properties": {
            "_featureType": "BOYLAT",
            "COLOUR": "3",  # Red
            "BOYSHP": 1,    # Conical
            "OBJNAM": "Red Nun #2"
        }
    })
    
    return {
        "type": "FeatureCollection",
        "features": features
    }

def main():
    if len(sys.argv) < 2:
        print("Error: No file path provided", file=sys.stderr)
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    # Check if file exists (for realism)
    if not os.path.exists(file_path):
        print(f"Error: File not found: {file_path}", file=sys.stderr)
        sys.exit(1)
    
    # Generate mock data
    result = generate_mock_features(file_path)
    
    # Output as JSON
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()