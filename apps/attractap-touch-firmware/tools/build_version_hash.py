#!/usr/bin/env python3
"""
PlatformIO pre-build script for automatic firmware version generation from source hash.
"""

import subprocess
import sys
import os
from pathlib import Path

def generate_and_inject_version(target=None, source=None, env=None):
    """Generate version hash and inject it into build flags"""
    print("🔢 Generating firmware version hash...")
    
    # Get the project root directory - handle PlatformIO context where __file__ might not be available
    try:
        project_root = Path(__file__).parent.parent
    except NameError:
        # In PlatformIO context, __file__ might not be available
        project_root = Path(os.getcwd())
    
    # Import and run the version hash generator
    sys.path.insert(0, str(project_root / "tools"))
    
    try:
        from generate_version_hash import generate_version_hash
        version_hash = generate_version_hash()
        print(f"✅ Generated version hash: {version_hash}")
        
        # If we have PlatformIO env, inject the version into build flags
        if env is not None:
            # Remove any existing FIRMWARE_VERSION definition to avoid conflicts
            build_flags = env.get("BUILD_FLAGS", [])
            filtered_flags = [flag for flag in build_flags if not flag.startswith("-DFIRMWARE_VERSION")]
            
            # Add our version
            version_flag = f'-DFIRMWARE_VERSION=\\"{version_hash}\\"'
            filtered_flags.append(version_flag)
            
            # Update the environment
            env.Replace(BUILD_FLAGS=filtered_flags)
            
            print(f"✅ Injected FIRMWARE_VERSION={version_hash} into build flags")
        
        # Return 0 for success when used as PlatformIO pre-action
        return 0
        
    except Exception as e:
        print(f"❌ Error generating version hash: {e}")
        # Fall back to DEFAULT if something goes wrong
        if env is not None:
            build_flags = env.get("BUILD_FLAGS", [])
            filtered_flags = [flag for flag in build_flags if not flag.startswith("-DFIRMWARE_VERSION")]
            filtered_flags.append('-DFIRMWARE_VERSION=\\"DEFAULT\\"')
            env.Replace(BUILD_FLAGS=filtered_flags)
            print("⚠️  Using DEFAULT version due to error")
        # Return 1 for error when used as PlatformIO pre-action
        return 1

# Try different PlatformIO integration approaches
try:
    # PlatformIO script import
    Import("env")
    
    # Register the pre-action - this runs before every build
    env.AddPreAction("buildprog", generate_and_inject_version)
    
    # Also run immediately when script is loaded to set the version for this build
    generate_and_inject_version(env=env)
    
except ImportError:
    # Running standalone (not as PlatformIO script)
    pass

# Also add as main function for standalone execution
def main():
    # For standalone execution, we want the actual version hash
    try:
        from generate_version_hash import generate_version_hash
        version = generate_version_hash()
        print(f"Generated version: {version}")
        return version
    except Exception as e:
        print(f"Error: {e}")
        return "DEFAULT"

if __name__ == "__main__":
    main()