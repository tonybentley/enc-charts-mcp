// Create mock execAsync before imports
const mockExecAsync = jest.fn();

// Mock util before imports
jest.mock('util', () => ({
  ...jest.requireActual('util'),
  promisify: jest.fn(() => mockExecAsync)
}));

jest.mock('child_process');
jest.mock('fs/promises');

import { GDALEnvironment } from './environment';
// exec import only used for mocking
// fs import only used for mocking
// path import only used for mocking

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
      mockExecAsync.mockImplementation((_cmd) => {
        return Promise.resolve({ stdout: JSON.stringify(mockReport), stderr: '' });
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

      mockExecAsync.mockImplementation((_cmd) => {
        return Promise.resolve({ stdout: JSON.stringify(mockReport), stderr: '' });
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

      mockExecAsync.mockImplementation((_cmd) => {
        return Promise.resolve({ stdout: JSON.stringify(mockReport), stderr: '' });
      });

      const result = await environment.detect();
      
      expect(result.isComplete).toBe(false);
      expect(result.installInstructions).toBeDefined();
      expect(result.installInstructions.homebrew).toBe('brew install gdal');
    });

    it('should handle detection script errors gracefully', async () => {
      mockExecAsync.mockImplementation((_cmd) => {
        return Promise.reject(new Error('Python not found'));
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

      mockExecAsync.mockImplementation((_cmd) => {
        return Promise.resolve({ stdout: JSON.stringify(mockReport), stderr: '' });
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

      mockExecAsync.mockImplementation((_cmd) => {
        return Promise.resolve({ stdout: JSON.stringify(mockReport), stderr: '' });
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

      let _detectCallCount = 0;
      let installCalled = false;
      
      mockExecAsync.mockImplementation((cmd) => {
        if (cmd.includes('detect_gdal.py')) {
          // Just return success - the actual report is read with cat
          return Promise.resolve({ stdout: 'Detection complete', stderr: '' });
        } else if (cmd.includes('cat') && cmd.includes('gdal_detection_report.json')) {
          // Return different results before/after installation
          const result = installCalled ? mockDetectionAfter : mockDetectionBefore;
          _detectCallCount++;
          return Promise.resolve({ stdout: JSON.stringify(result), stderr: '' });
        } else if (cmd.includes('install_gdal.py')) {
          installCalled = true;
          return Promise.resolve({ stdout: 'Installation successful', stderr: '' });
        } else {
          // Default case for any other commands
          return Promise.resolve({ stdout: '', stderr: '' });
        }
      });

      const result = await environment.autoInstall();
      
      expect(result.success).toBe(true);
      expect(result.method).toBeDefined();
      expect(result.installedVersion).toBe('3.4.1');
    });

    it('should handle installation failures gracefully', async () => {
      mockExecAsync.mockImplementation((cmd) => {
        if (cmd.includes('detect_gdal.py')) {
          return Promise.resolve({ stdout: JSON.stringify({ python_bindings: false, is_complete: false }), stderr: '' });
        } else if (cmd.includes('install_gdal.py')) {
          return Promise.reject(new Error('Installation failed'));
        } else {
          return Promise.resolve({ stdout: '', stderr: '' });
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

      mockExecAsync.mockImplementation((_cmd) => {
        return Promise.resolve({ stdout: JSON.stringify(mockReport), stderr: '' });
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

      mockExecAsync.mockImplementation((_cmd) => {
        return Promise.resolve({ stdout: JSON.stringify(mockReport), stderr: '' });
      });

      const isValid = await environment.validateEnvironment();
      
      expect(isValid).toBe(true);
    });

    it('should fail validation for incomplete environment', async () => {
      const mockReport = {
        python_bindings: false,
        is_complete: false
      };

      mockExecAsync.mockImplementation((_cmd) => {
        return Promise.resolve({ stdout: JSON.stringify(mockReport), stderr: '' });
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

      mockExecAsync.mockImplementation((_cmd) => {
        return Promise.resolve({ stdout: JSON.stringify(mockReport), stderr: '' });
      });

      await expect(environment.ensureReady()).resolves.not.toThrow();
    });

    it('should throw error if GDAL is not ready', async () => {
      const mockReport = {
        python_bindings: false,
        is_complete: false,
        missing_components: ['python_bindings']
      };

      mockExecAsync.mockImplementation((_cmd) => {
        return Promise.resolve({ stdout: JSON.stringify(mockReport), stderr: '' });
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
      mockExecAsync.mockImplementation((cmd) => {
        if (cmd.includes('detect_gdal.py')) {
          // Just return success - the actual report is read with cat
          return Promise.resolve({ stdout: 'Detection complete', stderr: '' });
        } else if (cmd.includes('cat') && cmd.includes('gdal_detection_report.json')) {
          // Return different results before/after installation
          const result = installCalled ? mockDetectionAfter : mockDetectionBefore;
          return Promise.resolve({ stdout: JSON.stringify(result), stderr: '' });
        } else if (cmd.includes('install_gdal.py')) {
          installCalled = true;
          return Promise.resolve({ stdout: 'Success', stderr: '' });
        } else {
          return Promise.resolve({ stdout: '', stderr: '' });
        }
      });

      await expect(environment.ensureReady(true)).resolves.not.toThrow();
      expect(installCalled).toBe(true);
    });
  });
});