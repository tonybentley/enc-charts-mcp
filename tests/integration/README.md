# Integration Test Requirements

The integration tests require GDAL to be installed on your system since they test the actual S-57 parser implementation that uses GDAL Python bindings.

## Prerequisites

### macOS

1. Install GDAL system libraries:
```bash
brew install gdal
```

2. Install GDAL Python bindings:
```bash
pip install GDAL==$(gdal-config --version)
```

### Linux (Ubuntu/Debian)

1. Install GDAL system libraries:
```bash
sudo apt-get update
sudo apt-get install gdal-bin libgdal-dev
```

2. Install GDAL Python bindings:
```bash
pip install GDAL==$(gdal-config --version)
```

### Verify Installation

Run the detection script to verify GDAL is properly installed:
```bash
python3 src/parsers/detect_gdal.py
```

## Running Integration Tests

Once GDAL is installed, run the integration tests:
```bash
npm run test:integration
```

## Note

The integration tests download real chart data from NOAA servers and parse them using the GDAL-based S-57 parser. This ensures the system works correctly with actual ENC data.