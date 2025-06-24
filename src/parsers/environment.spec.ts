import { GDALEnvironment, GDALDetectionResult, InstallationResult } from './environment';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

// Mock child_process
jest.mock('child_process');
jest.mock('fs/promises');

const execAsync = promisify(exec);

describe('GDAL Environment Detection', () => {
  let environment: GDALEnvironment;

  beforeEach(() => {
    jest.clearAllMocks();
    environment = new GDALEnvironment();
  });

  describe('detect()', () => {
    it('should detect GDAL Python bindings', async () => {
      const mockReport = {
        python_bindings: true,
        version: '3.4.1',
        gdal_data: '/usr/local/share/gdal',
        command_line_tools: [
          { name: 'ogrinfo', found: true },
          { name: 'ogr2ogr', found: true }
        ],
        is_complete: true,
        missing_components: [],
        errors: []
      };

      // Mock successful execution
      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: JSON.stringify(mockReport), stderr: '' });
      });

      const result = await environment.detect();
      
      expect(result.pythonBindings).toBe(true);
      expect(result.version).toBe('3.4.1');
      expect(result.isComplete).toBe(true);
    });

    it('should detect GDAL command-line tools', async () => {
      const mockReport = {
        python_bindings: true,
        command_line_tools: [
          { name: 'ogrinfo', found: true, version: 'GDAL 3.4.1' },
          { name: 'ogr2ogr', found: true, version: 'GDAL 3.4.1' },
          { name: 'gdalinfo', found: true, version: 'GDAL 3.4.1' }
        ],
        is_complete: true
      };

      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: JSON.stringify(mockReport), stderr: '' });
      });

      const result = await environment.detect();
      
      expect(result.commandLineTools).toContain('ogrinfo');
      expect(result.commandLineTools).toContain('ogr2ogr');
      expect(result.commandLineTools).toContain('gdalinfo');
    });

    it('should provide installation instructions when GDAL is missing', async () => {
      const mockReport = {
        python_bindings: false,
        command_line_tools: [],
        is_complete: false,
        missing_components: ['python_bindings', 'ogrinfo'],
        install_instructions: {
          homebrew: 'brew install gdal',
          conda: 'conda install -c conda-forge gdal'
        }
      };

      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: JSON.stringify(mockReport), stderr: '' });
      });

      const result = await environment.detect();
      
      expect(result.isComplete).toBe(false);
      expect(result.installInstructions).toBeDefined();
      expect(result.installInstructions.homebrew).toBe('brew install gdal');
    });

    it('should handle detection script errors gracefully', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        callback(new Error('Python not found'), null);
      });

      const result = await environment.detect();
      
      expect(result.isComplete).toBe(false);
      expect(result.errors).toContain('Failed to run detection script: Python not found');
    });

    it('should detect correct GDAL version (3.0+)', async () => {
      const mockReport = {
        python_bindings: true,
        version: '3.4.1',
        is_complete: true
      };

      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: JSON.stringify(mockReport), stderr: '' });
      });

      const result = await environment.detect();
      
      expect(result.version).toBe('3.4.1');
      expect(result.isVersionSupported).toBe(true);
    });

    it('should warn about unsupported GDAL version (<3.0)', async () => {
      const mockReport = {
        python_bindings: true,
        version: '2.4.0',
        warnings: ['GDAL version 2.4.0 is below recommended 3.0+'],
        is_complete: true
      };

      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: JSON.stringify(mockReport), stderr: '' });
      });

      const result = await environment.detect();
      
      expect(result.version).toBe('2.4.0');
      expect(result.isVersionSupported).toBe(false);
      expect(result.warnings).toContain('GDAL version 2.4.0 is below recommended 3.0+');
    });
  });

  describe('autoInstall()', () => {
    it('should attempt auto-installation when requested', async () => {
      // Mock detection showing GDAL is missing
      const mockDetectionBefore = {
        python_bindings: false,
        is_complete: false
      };

      // Mock successful installation
      const mockDetectionAfter = {
        python_bindings: true,
        is_complete: true,
        version: '3.4.1'
      };

      let callCount = 0;
      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        if (cmd.includes('detect_gdal.py')) {
          // Return different results before/after installation
          const result = callCount === 0 ? mockDetectionBefore : mockDetectionAfter;
          callCount++;
          callback(null, { stdout: JSON.stringify(result), stderr: '' });
        } else if (cmd.includes('install_gdal.py')) {
          callback(null, { stdout: 'Installation successful', stderr: '' });
        }
      });

      const result = await environment.autoInstall();
      
      expect(result.success).toBe(true);
      expect(result.method).toBeDefined();
      expect(result.installedVersion).toBe('3.4.1');
    });

    it('should handle installation failures gracefully', async () => {
      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        if (cmd.includes('install_gdal.py')) {
          callback(new Error('Installation failed'), null);
        }
      });

      const result = await environment.autoInstall();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Installation failed');
    });

    it('should skip installation if GDAL is already complete', async () => {
      const mockReport = {
        python_bindings: true,
        is_complete: true,
        version: '3.4.1'
      };

      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: JSON.stringify(mockReport), stderr: '' });
      });

      const result = await environment.autoInstall();
      
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.message).toContain('already installed');
    });
  });

  describe('validateEnvironment()', () => {
    it('should validate complete GDAL environment', async () => {
      const mockReport = {
        python_bindings: true,
        command_line_tools: [
          { name: 'ogrinfo', found: true },
          { name: 'ogr2ogr', found: true }
        ],
        version: '3.4.1',
        is_complete: true
      };

      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: JSON.stringify(mockReport), stderr: '' });
      });

      const isValid = await environment.validateEnvironment();
      
      expect(isValid).toBe(true);
    });

    it('should fail validation for incomplete environment', async () => {
      const mockReport = {
        python_bindings: false,
        is_complete: false
      };

      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: JSON.stringify(mockReport), stderr: '' });
      });

      const isValid = await environment.validateEnvironment();
      
      expect(isValid).toBe(false);
    });
  });

  describe('ensureReady()', () => {
    it('should ensure GDAL is ready before proceeding', async () => {
      const mockReport = {
        python_bindings: true,
        is_complete: true,
        version: '3.4.1'
      };

      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: JSON.stringify(mockReport), stderr: '' });
      });

      await expect(environment.ensureReady()).resolves.not.toThrow();
    });

    it('should throw error if GDAL is not ready', async () => {
      const mockReport = {
        python_bindings: false,
        is_complete: false,
        missing_components: ['python_bindings']
      };

      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        callback(null, { stdout: JSON.stringify(mockReport), stderr: '' });
      });

      await expect(environment.ensureReady()).rejects.toThrow(
        'GDAL environment not ready. Missing: python_bindings'
      );
    });

    it('should attempt auto-install if requested', async () => {
      const mockDetectionBefore = {
        python_bindings: false,
        is_complete: false
      };

      const mockDetectionAfter = {
        python_bindings: true,
        is_complete: true,
        version: '3.4.1'
      };

      let installCalled = false;
      (exec as unknown as jest.Mock).mockImplementation((cmd, callback) => {
        if (cmd.includes('detect_gdal.py')) {
          const result = installCalled ? mockDetectionAfter : mockDetectionBefore;
          callback(null, { stdout: JSON.stringify(result), stderr: '' });
        } else if (cmd.includes('install_gdal.py')) {
          installCalled = true;
          callback(null, { stdout: 'Success', stderr: '' });
        }
      });

      await expect(environment.ensureReady(true)).resolves.not.toThrow();
      expect(installCalled).toBe(true);
    });
  });
});