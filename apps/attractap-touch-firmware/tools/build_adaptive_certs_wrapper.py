#!/usr/bin/env python3
"""
PlatformIO pre-build script wrapper for adaptive CA certificate generation.
"""

import subprocess
import sys
import os
from pathlib import Path

def generate_certificates(target=None, source=None, env=None):
    """Generate the CA certificates before build"""
    print("🔐 Generating CA certificates...")
    
    # Get the project root directory - handle PlatformIO context where __file__ might not be available
    try:
        project_root = Path(__file__).parent.parent
    except NameError:
        # In PlatformIO context, __file__ might not be available
        project_root = Path(os.getcwd())
    
    script_path = project_root / "tools" / "build_individual_ca_certs.py"
    
    # Change to project root directory
    os.chdir(project_root)
    
    # Install requirements if needed
    try:
        import requests
    except ImportError:
        print("Installing requirements...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "tools/requirements.txt"])
        except subprocess.CalledProcessError:
            # Try with --user flag for externally managed environments
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "-r", "tools/requirements.txt"])
            except subprocess.CalledProcessError:
                # Try with --break-system-packages as last resort
                subprocess.check_call([sys.executable, "-m", "pip", "install", "--break-system-packages", "-r", "tools/requirements.txt"])
    
    # Run the individual CA certificate build script
    subprocess.check_call([sys.executable, str(script_path)])

# Try different PlatformIO integration approaches
try:
    # PlatformIO script import
    Import("env")
    
    # Register only the working pre-actions
    env.AddPreAction("buildprog", generate_certificates)
    
    # Alternative approach: run immediately when script is loaded
    generate_certificates()
    
except ImportError:
    # Running standalone (not as PlatformIO script)
    pass

# Also add as main function for standalone execution
def main():
    generate_certificates()

if __name__ == "__main__":
    main() 