import { spawn, ChildProcess } from 'child_process';
import path from 'path';

const projectRoot = path.join(process.cwd());

describe('MCP Protocol E2E Tests', () => {
  let serverProcess: ChildProcess;
  let stdout = '';
  let stderr = '';
  let jsonMessages: any[] = [];

  beforeEach(() => {
    stdout = '';
    stderr = '';
    jsonMessages = [];
  });

  afterEach(async () => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
      // Wait for process to fully terminate
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  });

  it('should produce clean JSON-RPC output without console.log interference', async () => {
    serverProcess = spawn('node', ['--experimental-sqlite', path.join(projectRoot, 'dist/index.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    // Collect all data before processing
    const chunks: Buffer[] = [];
    
    serverProcess.stdout!.on('data', (data: Buffer) => {
      chunks.push(data);
    });

    serverProcess.stderr!.on('data', (data) => {
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
    serverProcess.stdin!.write(message);

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Process the complete output
    stdout = Buffer.concat(chunks).toString();
    
    // Parse JSON-RPC messages from stdout
    const parts = stdout.split('\r\n\r\n');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.includes('Content-Length:')) {
        // This is a header, next part should be JSON
        if (i + 1 < parts.length) {
          const jsonPart = parts[i + 1].split('\r\n')[0]; // Get first line of next part
          if (jsonPart) {
            try {
              const parsed = JSON.parse(jsonPart);
              jsonMessages.push(parsed);
            } catch (e) {
              // Ignore parse errors for incomplete messages
            }
          }
        }
      }
    }

    // Check that we received at least one JSON message (the initialize response)
    expect(jsonMessages.length).toBeGreaterThan(0);
    
    // Verify the initialize response
    const initResponse = jsonMessages.find(msg => msg.id === 1);
    expect(initResponse).toBeDefined();
    expect(initResponse.result).toBeDefined();
    expect(initResponse.result.protocolVersion).toBe('2024-11-05');
  });

  it('should handle tools/call requests correctly', async () => {
    serverProcess = spawn('node', ['--experimental-sqlite', path.join(projectRoot, 'dist/index.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    const chunks: Buffer[] = [];

    serverProcess.stdout!.on('data', (data: Buffer) => {
      chunks.push(data);
    });

    // Initialize first
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

    serverProcess.stdin!.write(`Content-Length: ${Buffer.byteLength(initRequest)}\r\n\r\n${initRequest}`);
    
    // Wait for initialization
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

    serverProcess.stdin!.write(`Content-Length: ${Buffer.byteLength(searchRequest)}\r\n\r\n${searchRequest}`);

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Process all responses
    const fullOutput = Buffer.concat(chunks).toString();
    const responses: any[] = [];
    
    // Parse JSON-RPC messages
    const parts = fullOutput.split('\r\n\r\n');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.includes('Content-Length:')) {
        if (i + 1 < parts.length) {
          const jsonPart = parts[i + 1].split('\r\n')[0];
          if (jsonPart) {
            try {
              const parsed = JSON.parse(jsonPart);
              responses.push(parsed);
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    }

    // Find the search response
    const searchResponse = responses.find(r => r.id === 2);
    expect(searchResponse).toBeDefined();
    expect(searchResponse.jsonrpc).toBe('2.0');
    expect(searchResponse.result).toBeDefined();
    expect(searchResponse.error).toBeUndefined();
  });

  it('should properly separate stdout and stderr', async () => {
    serverProcess = spawn('node', ['--experimental-sqlite', path.join(projectRoot, 'dist/index.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    let stdoutData = '';
    let stderrData = '';

    serverProcess.stdout!.on('data', (data) => {
      stdoutData += data.toString();
    });

    serverProcess.stderr!.on('data', (data) => {
      stderrData += data.toString();
    });

    // Send a simple request
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

    serverProcess.stdin!.write(`Content-Length: ${Buffer.byteLength(initRequest)}\r\n\r\n${initRequest}`);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Stdout should only contain JSON-RPC messages
    const stdoutLines = stdoutData.split('\n').filter(line => line.trim() && !line.includes('Content-Length'));
    for (const line of stdoutLines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    // Stderr can contain debug information but should not contain JSON-RPC messages
    if (stderrData) {
      const stderrLines = stderrData.split('\n').filter(line => line.trim());
      for (const line of stderrLines) {
        // Stderr lines should not be valid JSON-RPC responses
        try {
          const parsed = JSON.parse(line);
          expect(parsed.jsonrpc).toBeUndefined();
        } catch {
          // Expected - stderr should not be JSON
        }
      }
    }
  });
});