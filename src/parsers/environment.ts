import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export interface GDALDetectionResult {
  pythonBindings: boolean;
  commandLineTools: string[];
  version: string | null;
  isComplete: boolean;
  isVersionSupported: boolean;
  missingComponents: string[];
  installInstructions: Record<string, string>;
  errors: string[];
  warnings: string[];
}

export interface InstallationResult {
  success: boolean;
  method?: string;
  installedVersion?: string;
  error?: string;
  skipped?: boolean;
  message?: string;
}

export class GDALEnvironment {
  private static instance: GDALEnvironment;
  private detectionScriptPath: string;
  private installScriptPath: string;
  private cachedDetection: GDALDetectionResult | null = null;

  constructor() {
    // For ES modules, we'll use relative paths from the project root
    // This will work when running from npm scripts
    this.detectionScriptPath = path.join(process.cwd(), 'src/parsers/detect_gdal.py');
    this.installScriptPath = path.join(process.cwd(), 'src/parsers/install_gdal.py');
  }

  static async getInstance(): Promise<GDALEnvironment> {
    if (!this.instance) {
      this.instance = new GDALEnvironment();
    }
    return this.instance;
  }

  /**
   * Detect GDAL installation and capabilities
   */
  async detect(): Promise<GDALDetectionResult> {
    try {
      // Run the Python detection script
      const { stdout, stderr } = await execAsync(`python3 "${this.detectionScriptPath}"`);
      
      // Parse the JSON report
      const reportPath = path.join(process.cwd(), 'gdal_detection_report.json');
      const { stdout: reportContent } = await execAsync(`cat "${reportPath}"`);
      const report = JSON.parse(reportContent);

      // Transform Python report to TypeScript interface
      const result: GDALDetectionResult = {
        pythonBindings: report.python_bindings || false,
        commandLineTools: this.extractFoundTools(report.command_line_tools || []),
        version: report.version || null,
        isComplete: report.is_complete || false,
        isVersionSupported: this.checkVersionSupport(report.version),
        missingComponents: report.missing_components || [],
        installInstructions: report.install_instructions || {},
        errors: report.errors || [],
        warnings: report.warnings || []
      };

      this.cachedDetection = result;
      return result;
    } catch (error) {
      // Handle detection errors gracefully
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        pythonBindings: false,
        commandLineTools: [],
        version: null,
        isComplete: false,
        isVersionSupported: false,
        missingComponents: ['unknown'],
        installInstructions: {},
        errors: [`Failed to run detection script: ${errorMessage}`],
        warnings: []
      };
    }
  }

  /**
   * Attempt automatic GDAL installation
   */
  async autoInstall(): Promise<InstallationResult> {
    try {
      // First check if already installed
      const detection = await this.detect();
      if (detection.isComplete) {
        return {
          success: true,
          skipped: true,
          message: 'GDAL is already installed and complete',
          installedVersion: detection.version || undefined
        };
      }

      // Run installation script
      const { stdout, stderr } = await execAsync(
        `python3 "${this.installScriptPath}" --auto`,
        { timeout: 300000 } // 5 minute timeout for installation
      );

      // Verify installation succeeded
      const postDetection = await this.detect();
      if (postDetection.isComplete) {
        return {
          success: true,
          method: this.extractInstallMethod(stdout),
          installedVersion: postDetection.version || undefined
        };
      } else {
        return {
          success: false,
          error: 'Installation completed but GDAL is still not fully functional'
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Validate that the GDAL environment is ready
   */
  async validateEnvironment(): Promise<boolean> {
    const detection = await this.detect();
    return detection.isComplete && detection.isVersionSupported;
  }

  /**
   * Ensure GDAL is ready, optionally attempting auto-install
   */
  async ensureReady(autoInstall: boolean = false): Promise<void> {
    const detection = await this.detect();
    
    if (!detection.isComplete) {
      if (autoInstall) {
        const installResult = await this.autoInstall();
        if (!installResult.success) {
          throw new Error(`GDAL auto-installation failed: ${installResult.error}`);
        }
        
        // Re-validate after installation
        const postDetection = await this.detect();
        if (!postDetection.isComplete) {
          throw new Error(
            `GDAL environment not ready after installation. Missing: ${postDetection.missingComponents.join(', ')}`
          );
        }
      } else {
        throw new Error(
          `GDAL environment not ready. Missing: ${detection.missingComponents.join(', ')}`
        );
      }
    }

    if (!detection.isVersionSupported && detection.version) {
      console.warn(`Warning: ${detection.warnings.join('; ')}`);
    }
  }

  /**
   * Get cached detection result
   */
  getCachedDetection(): GDALDetectionResult | null {
    return this.cachedDetection;
  }

  /**
   * Clear cached detection to force re-detection
   */
  clearCache(): void {
    this.cachedDetection = null;
  }

  /**
   * Extract found command-line tools from report
   */
  private extractFoundTools(toolReports: any[]): string[] {
    return toolReports
      .filter(tool => tool.found)
      .map(tool => tool.name);
  }

  /**
   * Check if GDAL version is supported (3.0+)
   */
  private checkVersionSupport(version: string | null): boolean {
    if (!version) return false;
    
    const parts = version.split('.');
    const majorVersion = parseInt(parts[0], 10);
    return majorVersion >= 3;
  }

  /**
   * Extract installation method from output
   */
  private extractInstallMethod(output: string): string {
    if (output.includes('homebrew')) return 'homebrew';
    if (output.includes('conda')) return 'conda';
    if (output.includes('apt')) return 'apt';
    if (output.includes('yum')) return 'yum';
    if (output.includes('pip')) return 'pip';
    return 'unknown';
  }
}

// Export singleton instance getter
export const getGDALEnvironment = GDALEnvironment.getInstance;