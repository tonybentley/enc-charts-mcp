#!/usr/bin/env python3
"""
GDAL Auto-Installation Script
Attempts to install GDAL using the most appropriate method for the platform
"""
import sys
import subprocess
import platform
import os
import argparse
import json
import shutil
from pathlib import Path

class GDALInstaller:
    def __init__(self, auto=False, method=None, ci_mode=False):
        self.auto = auto
        self.preferred_method = method
        self.ci_mode = ci_mode  # CI mode - no sudo, assume root or appropriate permissions
        self.system = platform.system()
        self.python_version = platform.python_version()
        
    def run(self):
        """Main installation process"""
        print(f"GDAL Installation Script")
        print(f"System: {self.system}")
        print(f"Python: {self.python_version}")
        print("-" * 50)
        
        # First check if already installed
        if self.check_existing_installation():
            print("GDAL is already installed and functional.")
            return True
        
        # Determine installation method
        methods = self.get_installation_methods()
        
        if self.preferred_method and self.preferred_method in methods:
            # Use specified method
            success = self.install_with_method(self.preferred_method, methods[self.preferred_method])
        else:
            # Try methods in order of preference
            success = False
            for method, command in methods.items():
                if self.auto or self.confirm_installation(method, command):
                    success = self.install_with_method(method, command)
                    if success:
                        break
        
        if success:
            print("\n✓ GDAL installation completed successfully!")
            # Verify installation
            if self.verify_installation():
                print("✓ Installation verified - GDAL is functional")
                return True
            else:
                print("✗ Installation verification failed")
                return False
        else:
            print("\n✗ GDAL installation failed")
            self.print_manual_instructions()
            return False
    
    def check_existing_installation(self):
        """Check if GDAL is already installed"""
        try:
            # Check Python bindings
            import osgeo.gdal
            # Check command line tools
            result = subprocess.run(['ogrinfo', '--version'], 
                                  capture_output=True, text=True)
            return result.returncode == 0
        except:
            return False
    
    def get_installation_methods(self):
        """Get platform-specific installation methods"""
        methods = {}
        
        if self.system == "Darwin":  # macOS
            # Check for Homebrew
            if shutil.which('brew'):
                methods['homebrew'] = ['brew', 'install', 'gdal']
            
            # Check for Conda
            if shutil.which('conda'):
                methods['conda'] = ['conda', 'install', '-c', 'conda-forge', 'gdal', '-y']
            
            # Pip as fallback
            if shutil.which('gdal-config'):
                gdal_version = self.get_gdal_version()
                if gdal_version:
                    methods['pip'] = ['pip', 'install', f'GDAL=={gdal_version}']
        
        elif self.system == "Linux":
            # Check distribution
            if os.path.exists('/etc/debian_version'):
                # Debian/Ubuntu - Note: apt-get update will be run before install
                if self.ci_mode or os.geteuid() == 0:  # Running as root or in CI
                    methods['apt'] = ['apt-get', 'install', '-y', 'gdal-bin', 'python3-gdal']
                else:
                    methods['apt'] = ['sudo', 'apt-get', 'install', '-y', 'gdal-bin', 'python3-gdal']
            elif os.path.exists('/etc/redhat-release'):
                # RHEL/CentOS/Fedora
                if self.ci_mode or os.geteuid() == 0:
                    methods['yum'] = ['yum', 'install', '-y', 'gdal', 'gdal-python']
                else:
                    methods['yum'] = ['sudo', 'yum', 'install', '-y', 'gdal', 'gdal-python']
            
            # Conda as alternative
            if shutil.which('conda'):
                methods['conda'] = ['conda', 'install', '-c', 'conda-forge', 'gdal', '-y']
        
        elif self.system == "Windows":
            # Windows primarily uses Conda
            if shutil.which('conda'):
                methods['conda'] = ['conda', 'install', '-c', 'conda-forge', 'gdal', '-y']
            
            # OSGeo4W as alternative (manual process)
            methods['osgeo4w'] = 'manual'
        
        return methods
    
    def install_with_method(self, method, command):
        """Execute installation with specified method"""
        print(f"\nAttempting installation with {method}...")
        
        if command == 'manual':
            print(f"Please install GDAL manually using {method}")
            if method == 'osgeo4w':
                print("Download from: https://osgeo4w.osgeo.org/")
            return False
        
        try:
            # Special handling for sudo commands
            if command[0] == 'sudo' and not self.auto:
                print("This command requires administrator privileges.")
                response = input("Continue? [y/N]: ")
                if response.lower() != 'y':
                    return False
            
            # For apt-based systems, update package lists first
            if method == 'apt':
                print("Updating package lists...")
                if command[0] == 'sudo':
                    update_cmd = ['sudo', 'apt-get', 'update']
                else:
                    update_cmd = ['apt-get', 'update']
                try:
                    update_process = subprocess.run(
                        update_cmd, 
                        check=True, 
                        capture_output=True, 
                        text=True,
                        timeout=120  # 2 minute timeout
                    )
                    if update_process.returncode != 0:
                        print(f"Warning: Package list update failed: {update_process.stderr}")
                except subprocess.TimeoutExpired:
                    print("Warning: Package list update timed out")
                except Exception as e:
                    print(f"Warning: Could not update package lists: {e}")
            
            # For yum-based systems, clean cache if needed
            elif method == 'yum' and command[0] == 'sudo':
                print("Cleaning yum cache...")
                clean_cmd = ['sudo', 'yum', 'clean', 'all']
                try:
                    subprocess.run(clean_cmd, check=False, capture_output=True, timeout=30)
                except:
                    pass  # Non-critical if this fails
            
            # Run installation command
            print(f"Running: {' '.join(command)}")
            process = subprocess.run(
                command, 
                check=True,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout for installation
            )
            
            if process.returncode == 0:
                print("Installation command completed successfully")
                if process.stdout:
                    print(f"Output: {process.stdout}")
                return True
            else:
                print(f"Installation failed with code {process.returncode}")
                if process.stderr:
                    print(f"Error: {process.stderr}")
                return False
        except subprocess.CalledProcessError as e:
            print(f"Installation failed: {e}")
            if hasattr(e, 'stderr') and e.stderr:
                print(f"Error output: {e.stderr}")
            
            # If sudo failed, suggest running without sudo in CI
            if command[0] == 'sudo' and 'sudo' in str(e):
                print("\nNote: If running in CI/container without sudo, try:")
                no_sudo_cmd = command[1:]
                print(f"  {' '.join(no_sudo_cmd)}")
            return False
        except subprocess.TimeoutExpired:
            print(f"Installation timed out after 300 seconds")
            return False
        except Exception as e:
            print(f"Unexpected error: {e}")
            return False
    
    def confirm_installation(self, method, command):
        """Ask user for confirmation"""
        if isinstance(command, list):
            command_str = ' '.join(command)
        else:
            command_str = str(command)
        
        print(f"\nProposed installation method: {method}")
        print(f"Command: {command_str}")
        response = input("Proceed with this installation? [y/N]: ")
        return response.lower() == 'y'
    
    def get_gdal_version(self):
        """Get GDAL version from gdal-config"""
        try:
            result = subprocess.run(['gdal-config', '--version'], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                return result.stdout.strip()
        except:
            pass
        return None
    
    def verify_installation(self):
        """Verify GDAL installation"""
        try:
            # Test Python bindings
            subprocess.run([sys.executable, '-c', 'from osgeo import gdal, ogr'], 
                         check=True, capture_output=True)
            
            # Test command line tools
            subprocess.run(['ogrinfo', '--version'], 
                         check=True, capture_output=True)
            
            return True
        except:
            return False
    
    def print_manual_instructions(self):
        """Print manual installation instructions"""
        print("\nManual installation instructions:")
        
        if self.system == "Darwin":
            print("\nmacOS:")
            print("  - Homebrew: brew install gdal")
            print("  - Conda: conda install -c conda-forge gdal")
            print("  - MacPorts: sudo port install gdal +python39")
        
        elif self.system == "Linux":
            print("\nLinux:")
            print("  - Ubuntu/Debian: sudo apt-get install gdal-bin python3-gdal")
            print("  - RHEL/CentOS: sudo yum install gdal gdal-python")
            print("  - Conda: conda install -c conda-forge gdal")
        
        elif self.system == "Windows":
            print("\nWindows:")
            print("  - Conda: conda install -c conda-forge gdal")
            print("  - OSGeo4W: https://osgeo4w.osgeo.org/")
            print("  - Or use Windows Subsystem for Linux (WSL)")
        
        print("\nFor more information: https://gdal.org/download.html")

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='Install GDAL for Python and command-line usage'
    )
    parser.add_argument(
        '--auto', 
        action='store_true',
        help='Automatically install without prompts (uses first available method)'
    )
    parser.add_argument(
        '--method',
        choices=['homebrew', 'conda', 'pip', 'apt', 'yum', 'osgeo4w'],
        help='Specify installation method'
    )
    parser.add_argument(
        '--ci',
        action='store_true',
        help='CI mode - assume running as root or with appropriate permissions (no sudo)'
    )
    
    args = parser.parse_args()
    
    installer = GDALInstaller(auto=args.auto, method=args.method, ci_mode=args.ci)
    success = installer.run()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()