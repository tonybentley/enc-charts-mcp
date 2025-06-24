#!/usr/bin/env python3
"""
GDAL Detection Script
Detects GDAL installation and capabilities across different platforms
"""
import json
import sys
import subprocess
import platform
import os
from pathlib import Path

def detect_gdal():
    """Detect GDAL installation and capabilities"""
    result = {
        "python_bindings": False,
        "version": None,
        "gdal_data": None,
        "gdal_config": None,
        "command_line_tools": [],
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "python_version": platform.python_version()
        },
        "errors": [],
        "warnings": []
    }
    
    # Test Python bindings
    try:
        from osgeo import gdal, ogr, osr
        result["python_bindings"] = True
        result["version"] = gdal.__version__
        result["gdal_data"] = gdal.GetConfigOption('GDAL_DATA')
        
        # Check GDAL version is 3.0+
        version_parts = gdal.__version__.split('.')
        major_version = int(version_parts[0])
        if major_version < 3:
            result["warnings"].append(f"GDAL version {gdal.__version__} is below recommended 3.0+")
    except ImportError as e:
        result["errors"].append(f"Python bindings not found: {str(e)}")
    except Exception as e:
        result["errors"].append(f"Error checking Python bindings: {str(e)}")
    
    # Test command-line tools
    tools_to_check = ['ogrinfo', 'ogr2ogr', 'gdalinfo', 'gdal_translate']
    for tool in tools_to_check:
        try:
            # Try to run the tool with --version
            result_proc = subprocess.run(
                [tool, '--version'], 
                capture_output=True, 
                text=True,
                timeout=5
            )
            if result_proc.returncode == 0:
                result["command_line_tools"].append({
                    "name": tool,
                    "found": True,
                    "version": result_proc.stdout.strip()
                })
            else:
                result["command_line_tools"].append({
                    "name": tool,
                    "found": False,
                    "error": result_proc.stderr
                })
        except FileNotFoundError:
            result["command_line_tools"].append({
                "name": tool,
                "found": False,
                "error": "Command not found in PATH"
            })
        except subprocess.TimeoutExpired:
            result["command_line_tools"].append({
                "name": tool,
                "found": False,
                "error": "Command timed out"
            })
        except Exception as e:
            result["command_line_tools"].append({
                "name": tool,
                "found": False,
                "error": str(e)
            })
    
    # Check for gdal-config
    try:
        config_result = subprocess.run(
            ['gdal-config', '--version'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if config_result.returncode == 0:
            result["gdal_config"] = config_result.stdout.strip()
    except:
        pass
    
    # Determine if installation is complete
    has_bindings = result["python_bindings"]
    has_tools = sum(1 for tool in result["command_line_tools"] if tool.get("found", False)) >= 2
    result["is_complete"] = has_bindings and has_tools
    
    # Add missing components
    result["missing_components"] = []
    if not has_bindings:
        result["missing_components"].append("python_bindings")
    
    missing_tools = [tool["name"] for tool in result["command_line_tools"] if not tool.get("found", False)]
    if missing_tools:
        result["missing_components"].extend(missing_tools)
    
    # Add installation instructions based on platform
    if not result["is_complete"]:
        result["install_instructions"] = get_install_instructions(result["platform"]["system"])
    
    return result

def get_install_instructions(system):
    """Get platform-specific installation instructions"""
    instructions = {
        "Darwin": {
            "homebrew": "brew install gdal",
            "conda": "conda install -c conda-forge gdal",
            "pip": "pip install GDAL==$(gdal-config --version)"
        },
        "Linux": {
            "apt": "sudo apt-get install gdal-bin python3-gdal",
            "yum": "sudo yum install gdal gdal-python",
            "conda": "conda install -c conda-forge gdal",
            "pip": "pip install GDAL==$(gdal-config --version)"
        },
        "Windows": {
            "conda": "conda install -c conda-forge gdal",
            "osgeo4w": "Download and install from https://osgeo4w.osgeo.org/",
            "pip": "pip install GDAL (requires pre-installed GDAL)"
        }
    }
    return instructions.get(system, {})

def main():
    """Main function"""
    result = detect_gdal()
    
    # Write results to JSON file
    output_file = Path('gdal_detection_report.json')
    with open(output_file, 'w') as f:
        json.dump(result, f, indent=2)
    
    # Print summary to console
    print(f"GDAL Detection Report for {result['platform']['system']}")
    print(f"Python version: {result['platform']['python_version']}")
    print("-" * 50)
    
    if result["python_bindings"]:
        print(f"✓ Python bindings found (version {result['version']})")
    else:
        print("✗ Python bindings NOT found")
    
    print(f"\nCommand-line tools:")
    for tool in result["command_line_tools"]:
        status = "✓" if tool["found"] else "✗"
        print(f"  {status} {tool['name']}")
    
    print(f"\nInstallation complete: {'YES' if result['is_complete'] else 'NO'}")
    
    if not result["is_complete"]:
        print("\nMissing components:")
        for component in result["missing_components"]:
            print(f"  - {component}")
        
        print("\nInstallation instructions:")
        for method, command in result["install_instructions"].items():
            print(f"  {method}: {command}")
    
    # Exit with error if incomplete
    sys.exit(0 if result["is_complete"] else 1)

if __name__ == "__main__":
    main()