#!/bin/bash
# Setup script for integration tests

echo "Checking GDAL Python bindings..."

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Check if GDAL Python bindings are installed
if python3 -c "import osgeo" 2>/dev/null; then
    echo "✓ GDAL Python bindings are already installed"
else
    echo "✗ GDAL Python bindings are not installed"
    echo ""
    echo "To install GDAL Python bindings, run one of the following:"
    echo ""
    echo "Using pip:"
    echo "  pip install GDAL"
    echo ""
    echo "Using conda:"
    echo "  conda install -c conda-forge gdal"
    echo ""
    echo "Using Homebrew (macOS):"
    echo "  brew install gdal"
    echo "  pip install GDAL==$(gdal-config --version)"
    echo ""
    echo "Note: You may need to install GDAL system libraries first"
    exit 1
fi

# Run the GDAL detection script
echo ""
echo "Running GDAL detection..."
python3 src/parsers/detect_gdal.py

# Check the detection report
if [ -f "gdal_detection_report.json" ]; then
    echo ""
    echo "GDAL Detection Report:"
    cat gdal_detection_report.json | python3 -m json.tool
fi

echo ""
echo "Setup check complete!"