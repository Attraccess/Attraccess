#!/usr/bin/env python3
import os
import json
import subprocess
import configparser
import sys
import shutil
import re

def extract_define_value(flags, define_name):
    """Extract a -D define value from build_flags"""
    pattern = fr'-D\s*{define_name}=(["\']?)(.*?)\1(?:\s|$)'
    match = re.search(pattern, flags)
    if match:
        value = match.group(2)
        # Strip extra quotes if present
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        return value
    return None

def main():
    # Load configuration
    config = configparser.ConfigParser()
    config.read('platformio.ini')
    
    # Get base version from build_flags
    if 'env' not in config or 'build_flags' not in config['env']:
        print("Error: build_flags is missing in [env] section of platformio.ini")
        sys.exit(1)
        
    env_build_flags = config['env']['build_flags']
    base_version = extract_define_value(env_build_flags, 'BASE_VERSION')
    
    if not base_version:
        print("Error: BASE_VERSION is not defined in build_flags of [env] section")
        sys.exit(1)
        
    print(f"Base version: {base_version}")
    
    # Find all environments
    environments = []
    for section in config.sections():
        if section.startswith('env:'):
            env_name = section[4:]  # Remove 'env:' prefix
            environments.append(env_name)
    
    if not environments:
        print("Error: No environments found in platformio.ini")
        sys.exit(1)
        
    print(f"Found environments: {environments}")
    
    # Create output directory
    output_dir = os.path.abspath("firmware_output")
    
    # Clean output directory if it exists
    if os.path.exists(output_dir):
        print(f"Cleaning output directory: {output_dir}")
        shutil.rmtree(output_dir)
    
    # Create fresh output directory
    os.makedirs(output_dir, exist_ok=True)
    print(f"Created clean output directory: {output_dir}")
    
    # Build each environment and create manifest
    firmware_info = []
    
    for env in environments:
        print(f"Building environment: {env}")
        
        env_section = f'env:{env}'
        
        # Check if build_flags is present
        if 'build_flags' not in config[env_section]:
            print(f"Error: 'build_flags' is missing for environment '{env}' in platformio.ini")
            sys.exit(1)
            
        # Extract values from build flags
        env_build_flags = config[env_section]['build_flags']
        env_version = extract_define_value(env_build_flags, 'ENV_VERSION')
        friendly_name = extract_define_value(env_build_flags, 'FRIENDLY_NAME')
        
        # Look for CHIP_FAMILY in this environment or inherited ones
        board_family = None
        current_section = env_section
        
        # Try to find CHIP_FAMILY in the current environment or its ancestors
        while current_section and not board_family:
            if 'build_flags' in config[current_section]:
                board_family = extract_define_value(config[current_section]['build_flags'], 'CHIP_FAMILY')
            
            # Move to parent environment if extends is defined
            if 'extends' in config[current_section]:
                current_section = config[current_section]['extends']
            else:
                current_section = None
        
        # If board_family not found in build_flags, check for explicit board_family
        if not board_family and 'board_family' in config[env_section]:
            board_family = config[env_section]['board_family'].strip()
        
        # Default to ESP32 if still not found
        if not board_family:
            print(f"Warning: Could not determine board family for '{env}', defaulting to ESP32")
            board_family = "ESP32"
            
        # Verify required values are present
        if not env_version:
            print(f"Error: ENV_VERSION is not defined for environment '{env}'")
            sys.exit(1)
            
        full_version = f"{base_version}-{env_version}"
        print(f"  Version for {env}: {full_version}")
        print(f"  Friendly name: {friendly_name or env}")
        print(f"  Board family: {board_family}")
        
        # Build firmware
        try:
            subprocess.run(['platformio', 'run', '-e', env], check=True)
        except subprocess.CalledProcessError:
            print(f"Error: Build failed for environment '{env}'")
            sys.exit(1)
            
        # Build filesystem image
        try:
            print(f"Building filesystem image for {env}...")
            subprocess.run(['platformio', 'run', '--target', 'buildfs', '-e', env], check=True)
        except subprocess.CalledProcessError:
            print(f"Error: Filesystem build failed for environment '{env}'")
            sys.exit(1)
        
        # Create environment-specific directory
        env_dir = os.path.join(output_dir, env)
        os.makedirs(env_dir, exist_ok=True)
        
        # Check firmware files
        firmware_path = f".pio/build/{env}/firmware.bin"
        bootloader_path = f".pio/build/{env}/bootloader.bin"
        partitions_path = f".pio/build/{env}/partitions.bin"
        filesystem_path = f".pio/build/{env}/littlefs.bin"
        
        # Check if any file is missing
        missing_files = []
        for file_path in [firmware_path, bootloader_path, partitions_path, filesystem_path]:
            if not os.path.exists(file_path):
                missing_files.append(file_path)
                
        if missing_files:
            print(f"Error: The following files are missing for environment '{env}':")
            for file_path in missing_files:
                print(f"  - {file_path}")
            sys.exit(1)
        
        # Copy individual files for reference
        try:
            subprocess.run(['cp', firmware_path, os.path.join(env_dir, "firmware.bin")], check=True)
            subprocess.run(['cp', bootloader_path, os.path.join(env_dir, "bootloader.bin")], check=True)
            subprocess.run(['cp', partitions_path, os.path.join(env_dir, "partitions.bin")], check=True)
            subprocess.run(['cp', filesystem_path, os.path.join(env_dir, "littlefs.bin")], check=True)
        except subprocess.CalledProcessError:
            print(f"Error: Failed to copy firmware files for environment '{env}'")
            sys.exit(1)
        
        # Get partition information to find the filesystem offset
        try:
            print(f"Getting partition information for {env}...")
            partinfo = subprocess.check_output(['python', '-m', 'esptool', 'partition_table', partitions_path]).decode('utf-8')
            print(partinfo)
            
            # Find the spiffs/littlefs partition
            fs_offset = None
            for line in partinfo.split('\n'):
                if 'spiffs' in line.lower() or 'littlefs' in line.lower():
                    parts = line.split()
                    for i, part in enumerate(parts):
                        if part.startswith('0x'):
                            fs_offset = part
                            break
                    if fs_offset:
                        break
                        
            if not fs_offset:
                print("Warning: Could not find filesystem partition offset, using default 0x290000")
                fs_offset = "0x290000"
                
            print(f"Filesystem offset: {fs_offset}")
        except Exception as e:
            print(f"Warning: Failed to get partition information: {e}")
            print("Using default filesystem offset 0x290000")
            fs_offset = "0x290000"
            
        # Create merged firmware bin using esptool
        merged_bin_path = os.path.join(env_dir, "merged-firmware.bin")
        try:
            print(f"Creating merged firmware for {env}...")
            # For ESP32-C3, we need to adapt the command
            if "ESP32-C3" in board_family or "ESP32_C3" in board_family:
                merge_cmd = [
                    'python', '-m', 'esptool', '--chip', 'esp32c3', 'merge_bin',
                    '-o', merged_bin_path,
                    '--flash_mode', 'dio',  # Use dio for most compatibility
                    '--flash_freq', '80m',  # ESP32-C3 typically uses 80MHz
                    '--flash_size', '4MB',
                    '0x0', bootloader_path,  # bootloader at 0x0 for ESP32-C3
                    '0x8000', partitions_path,
                    '0x10000', firmware_path,
                    fs_offset, filesystem_path  # Add filesystem to the merged binary
                ]
            else:
                # Default command for ESP32
                chip_type = board_family.lower().replace('_', '-')
                merge_cmd = [
                    'python', '-m', 'esptool', '--chip', chip_type, 'merge_bin',
                    '-o', merged_bin_path,
                    '--flash_mode', 'dio',
                    '--flash_freq', '40m',
                    '--flash_size', '4MB',
                    '0x1000', bootloader_path,
                    '0x8000', partitions_path,
                    '0x10000', firmware_path,
                    fs_offset, filesystem_path  # Add filesystem to the merged binary
                ]
            
            print(f"Running: {' '.join(merge_cmd)}")
            subprocess.run(merge_cmd, check=True)
            print(f"Merged firmware created at: {merged_bin_path}")
        except subprocess.CalledProcessError as e:
            print(f"Error: Failed to create merged firmware for environment '{env}'")
            print(f"Command failed: {e}")
            sys.exit(1)
        
        # Create manifest with the merged firmware
        manifest = {
            "name": friendly_name or env,
            "version": full_version,
            "new_install_prompt_erase": True,
            "builds": [{
                "chipFamily": board_family.replace('_', '-'),
                "parts": [
                    {"path": f"/_attractap_assets/{env}/merged-firmware.bin", "offset": 0}
                ]
            }]
        }
        
        # Save manifest
        manifest_path = os.path.join(env_dir, "manifest.json")
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
        
        # Add to firmware info
        firmware_info.append({
            "environment": env,
            "friendly_name": friendly_name or env,
            "version": full_version,
            "board_family": board_family,
            "manifest_path": f"/_attractap_assets/{env}/manifest.json"
        })
    
    # Create index.json
    index = {
        "firmwares": firmware_info
    }
    
    with open(os.path.join(output_dir, "index.json"), 'w') as f:
        json.dump(index, f, indent=2)
    
    print(f"Build completed. Output in {output_dir}")
    print(f"Total environments built: {len(firmware_info)}")
    print(f"Copy the contents of {output_dir} to your frontend public/_attractap_assets directory")

if __name__ == "__main__":
    main() 