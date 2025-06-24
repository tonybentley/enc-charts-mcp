#!/usr/bin/env node

/**
 * Test the MCP server to ensure clean JSON-RPC communication
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

async function testMCPServer() {
  console.log('Starting MCP server test...');
  
  const serverProcess = spawn('node', [path.join(projectRoot, 'dist/index.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test' }
  });
  
  let stdout = '';
  let stderr = '';
  let jsonMessages = [];
  
  serverProcess.stdout.on('data', (data) => {
    stdout += data.toString();
    // Try to parse each line as JSON
    const lines = data.toString().split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        jsonMessages.push(parsed);
      } catch (e) {
        // Not JSON, this is what we're checking for
        if (line && !line.includes('Content-Length')) {
          console.error('✗ Non-JSON output detected:', line);
        }
      }
    }
  });
  
  serverProcess.stderr.on('data', (data) => {
    stderr += data.toString();
  });
  
  // Send initialize request
  const initRequest = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  });
  
  const message = `Content-Length: ${Buffer.byteLength(initRequest)}\r\n\r\n${initRequest}`;
  serverProcess.stdin.write(message);
  
  // Wait a bit for response
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Send search_charts request
  const searchRequest = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'search_charts',
      arguments: {
        boundingBox: {
          minLat: 32.71,
          maxLat: 32.72,
          minLon: -117.17,
          maxLon: -117.16
        }
      }
    }
  });
  
  const searchMessage = `Content-Length: ${Buffer.byteLength(searchRequest)}\r\n\r\n${searchRequest}`;
  serverProcess.stdin.write(searchMessage);
  
  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Kill the server
  serverProcess.kill();
  
  // Check results
  console.log(`\nReceived ${jsonMessages.length} JSON messages`);
  if (stderr) {
    console.log('Server stderr:', stderr);
  }
  
  // Check if all stdout was valid JSON-RPC
  const nonJsonLines = stdout.split('\n')
    .filter(line => line.trim() && !line.includes('Content-Length'))
    .filter(line => {
      try {
        JSON.parse(line);
        return false;
      } catch {
        return true;
      }
    });
  
  if (nonJsonLines.length === 0) {
    console.log('✓ All server output is clean JSON-RPC');
  } else {
    console.log('✗ Found non-JSON output:');
    nonJsonLines.forEach(line => console.log('  ', line));
  }
}

testMCPServer().catch(console.error);