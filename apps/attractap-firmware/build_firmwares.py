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

def hex_to_int(hex_str):
    """Convert hex string to integer"""
    if isinstance(hex_str, str):
        return int(hex_str, 16)
    return hex_str

def main():
    # Load configuration
    config = configparser.ConfigParser()
    config.read('platformio.ini')
    
    # Get firmware information from build_flags
    if 'env' not in config or 'build_flags' not in config['env']:
        print("Error: build_flags is missing in [env] section of platformio.ini")
        sys.exit(1)
        
    env_build_flags = config['env']['build_flags']
    firmware_name = extract_define_value(env_build_flags, 'FIRMWARE_NAME')
    firmware_friendly_name = extract_define_value(env_build_flags, 'FIRMWARE_FRIENDLY_NAME')
    firmware_version = extract_define_value(env_build_flags, 'FIRMWARE_VERSION')
    
    if not firmware_name:
        print("Error: FIRMWARE_NAME is not defined in build_flags of [env] section")
        sys.exit(1)
        
    if not firmware_version:
        print("Error: FIRMWARE_VERSION is not defined in build_flags of [env] section")
        sys.exit(1)
        
    if not firmware_friendly_name:
        print("Error: FIRMWARE_FRIENDLY_NAME is not defined in build_flags of [env] section")
        sys.exit(1)
        
    print(f"Base firmware name: {firmware_name}")
    print(f"Base firmware friendly name: {firmware_friendly_name}")
    print(f"Firmware version: {firmware_version}")
    
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
        firmware_variant = extract_define_value(env_build_flags, 'FIRMWARE_VARIANT')
        firmware_variant_friendly_name = extract_define_value(env_build_flags, 'FIRMWARE_VARIANT_FRIENDLY_NAME')
        
        if not firmware_variant:
            print(f"Error: FIRMWARE_VARIANT is not defined in build_flags for environment '{env}'")
            sys.exit(1)
            
        if not firmware_variant_friendly_name:
            print(f"Error: FIRMWARE_VARIANT_FRIENDLY_NAME is not defined in build_flags for environment '{env}'")
            sys.exit(1)
        
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
            
        print(f"  Firmware name: {firmware_name}")
        print(f"  Firmware variant: {firmware_variant}")
        print(f"  Firmware variant friendly name: {firmware_variant_friendly_name}")
        print(f"  Firmware version: {firmware_version}")
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
        
        # Check firmware files
        firmware_path = f".pio/build/{env}/firmware.bin"
        bootloader_path = f".pio/build/{env}/bootloader.bin"
        partitions_path = f".pio/build/{env}/partitions.bin"
        filesystem_path = f".pio/build/{env}/littlefs.bin"
        idedata_path = f".pio/build/{env}/idedata.json"

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

        # Try to get idedata.json for more accurate offsets, but fall back to manual detection
        flash_images = []
        if os.path.exists(idedata_path):
            try:
                with open(idedata_path, 'r') as f:
                    idedata = json.load(f)
                
                # Collect flash images and offsets from idedata
                if 'extra' in idedata and 'flash_images' in idedata['extra']:
                    for img in idedata['extra']['flash_images']:
                        offset = img['offset']
                        path = img['path']
                        flash_images.append((hex_to_int(offset), offset, path))
                
                # Add application (main firmware) 
                app_offset = idedata['extra'].get('application_offset', '0x10000')
                flash_images.append((hex_to_int(app_offset), app_offset, firmware_path))
                
                print(f"Using idedata.json for flash layout")
            except Exception as e:
                print(f"Warning: Failed to read idedata.json: {e}")
                flash_images = []
        
        # Fall back to manual partition detection if idedata not available or failed
        if not flash_images:
            print(f"Falling back to manual partition detection for {env}")
            
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
                
                # Build flash images manually
                if "ESP32-C3" in board_family or "ESP32_C3" in board_family:
                    flash_images = [
                        (0x0, "0x0", bootloader_path),
                        (0x8000, "0x8000", partitions_path),
                        (0x10000, "0x10000", firmware_path),
                        (hex_to_int(fs_offset), fs_offset, filesystem_path)
                    ]
                else:
                    flash_images = [
                        (0x1000, "0x1000", bootloader_path),
                        (0x8000, "0x8000", partitions_path),
                        (0x10000, "0x10000", firmware_path),
                        (hex_to_int(fs_offset), fs_offset, filesystem_path)
                    ]
            except Exception as e:
                print(f"Warning: Failed to get partition information: {e}")
                print("Using default offsets")
                fs_offset = "0x290000"
                if "ESP32-C3" in board_family or "ESP32_C3" in board_family:
                    flash_images = [
                        (0x0, "0x0", bootloader_path),
                        (0x8000, "0x8000", partitions_path),
                        (0x10000, "0x10000", firmware_path),
                        (hex_to_int(fs_offset), fs_offset, filesystem_path)
                    ]
                else:
                    flash_images = [
                        (0x1000, "0x1000", bootloader_path),
                        (0x8000, "0x8000", partitions_path),
                        (0x10000, "0x10000", firmware_path),
                        (hex_to_int(fs_offset), fs_offset, filesystem_path)
                    ]
        
        # Sort by integer offset to ensure correct order
        flash_images.sort(key=lambda x: x[0])
        
        print(f"Flash layout for {env}:")
        for int_offset, hex_offset, path in flash_images:
            print(f"  {hex_offset}: {os.path.basename(path)}")

        # Check if any file is missing
        missing_files = []
        for _, _, file_path in flash_images:
            if not os.path.exists(file_path):
                missing_files.append(file_path)
        if missing_files:
            print(f"Error: The following files are missing for environment '{env}':")
            for file_path in missing_files:
                print(f"  - {file_path}")
            sys.exit(1)

        # Create merged firmware bin using esptool
        # Name the file after the firmware_name and variant
        firmware_filename = f"{firmware_name}_{firmware_variant}.bin"
        merged_bin_path = os.path.join(output_dir, firmware_filename)
        try:
            print(f"Creating merged firmware for {env}...")
            merge_cmd = [
                'python', '-m', 'esptool', '--chip', board_family.lower().replace('_', '-'), 'merge_bin',
                '-o', merged_bin_path,
                '--flash_mode', 'dio',
                '--flash_freq', '40m',
                '--flash_size', '4MB',
            ]
            
            # Add flash images in sorted order
            for int_offset, hex_offset, path in flash_images:
                merge_cmd.extend([hex_offset, path])
                
            print(f"Running: {' '.join(merge_cmd)}")
            result = subprocess.run(merge_cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                print(f"Error: Failed to create merged firmware for environment '{env}'")
                print(f"Command: {' '.join(merge_cmd)}")
                print(f"Return code: {result.returncode}")
                print(f"STDOUT: {result.stdout}")
                print(f"STDERR: {result.stderr}")
                sys.exit(1)
            
            print(f"Merged firmware created at: {merged_bin_path}")
        except Exception as e:
            print(f"Error: Failed to create merged firmware for environment '{env}': {e}")
            sys.exit(1)

        firmware_info.append({
            "name": firmware_name,
            "friendlyName": firmware_friendly_name,
            "variant": firmware_variant,
            "variantFriendlyName": firmware_variant_friendly_name,
            "version": firmware_version,
            "boardFamily": board_family,
            "filename": firmware_filename
        })
    
    # Create single consolidated firmware manifest
    consolidated_manifest = {
        "firmwares": firmware_info
    }
    
    with open(os.path.join(output_dir, "firmwares.json"), 'w') as f:
        json.dump(consolidated_manifest, f, indent=2)
    
    print(f"Build completed. Output in {output_dir}")
    print(f"Total environments built: {len(firmware_info)}")

if __name__ == "__main__":
    main() 