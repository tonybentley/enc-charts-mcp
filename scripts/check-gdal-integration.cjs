#!/usr/bin/env node
/**
 * Check if GDAL is available before running integration tests
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Checking GDAL availability for integration tests...');

const reportPath = path.join(process.cwd(), 'gdal_detection_report.json');

try {
  // Run GDAL detection
  execSync('python3 src/parsers/detect_gdal.py', { stdio: 'inherit' });
  
  // Check the report
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    
    if (!report.is_complete) {
      console.warn('\n⚠️  GDAL is not fully installed');
      console.warn('Missing components:', report.missing_components);
      console.warn('\nSkipping integration tests that require GDAL');
      console.warn('To run these tests, install GDAL first');
      process.exit(0); // Exit gracefully, don't fail
    }
    
    console.log('✅ GDAL is available for integration tests');
  }
} catch (error) {
  console.warn('\n⚠️  Could not detect GDAL');
  console.warn('Skipping integration tests that require GDAL');
  process.exit(0); // Exit gracefully, don't fail
}