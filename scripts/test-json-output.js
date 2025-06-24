#!/usr/bin/env node

/**
 * Test script to verify clean JSON output from the MCP server
 * This simulates what the MCP client would see
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

// Test the search_charts handler
async function testSearchCharts() {
  console.log('Testing search_charts handler...');
  
  const { searchChartsHandler } = await import(path.join(projectRoot, 'dist/handlers/searchCharts.js'));
  
  try {
    const result = await searchChartsHandler({
      boundingBox: {
        minLat: 32.71,
        maxLat: 32.72,
        minLon: -117.17,
        maxLon: -117.16
      }
    });
    
    // Check if the result is valid JSON
    const content = result.content[0].text;
    JSON.parse(content);
    console.log('✓ search_charts returns valid JSON');
  } catch (error) {
    console.error('✗ search_charts error:', error.message);
  }
}

// Test Python subprocess output
async function testPythonSubprocess() {
  console.log('\nTesting Python subprocess output...');
  
  const pythonScript = path.join(projectRoot, 'src/python/s57_parser.py');
  const testFile = path.join(projectRoot, 'cache/charts/US5CA72M/ENC_ROOT/US5CA72M/US5CA72M.000');
  
  return new Promise((resolve) => {
    const python = spawn('python3', [pythonScript, testFile]);
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    python.on('close', (code) => {
      try {
        // Check if stdout contains valid JSON
        if (stdout.trim()) {
          JSON.parse(stdout);
          console.log('✓ Python subprocess returns valid JSON');
        } else {
          console.log('✗ Python subprocess returned empty output');
        }
        
        if (stderr) {
          console.log('Python stderr:', stderr);
        }
      } catch (error) {
        console.error('✗ Python subprocess output is not valid JSON:', error.message);
        console.log('Stdout preview:', stdout.substring(0, 200));
      }
      resolve();
    });
  });
}

// Run tests
async function runTests() {
  try {
    await testSearchCharts();
    await testPythonSubprocess();
  } catch (error) {
    console.error('Test error:', error);
  }
}

runTests();