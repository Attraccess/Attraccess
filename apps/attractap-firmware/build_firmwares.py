#!/usr/bin/env python3
import os
import json
import subprocess
import configparser
import sys
import shutil
import re

def resolve_python_command():
    """Pick a Python executable with fallback."""
    if sys.executable and os.path.exists(sys.executable):
        return sys.executable
    for cmd in ("python3", "python"):
        if shutil.which(cmd):
            return cmd
    return "python3"

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
    
    # Override build_type to production for release builds
    if 'env' not in config:
        config.add_section('env')
    
    original_build_type = config['env'].get('build_type', 'debug')
    print(f"Original build_type: {original_build_type}")
    print("Overriding build_type to 'release' for release builds")
    config['env']['build_type'] = 'release'
    
    # Override LOG_LEVEL to ERROR for production builds and add production flags
    print("Overriding LOG_LEVEL to 'ERROR' for production builds")
    for section_name in config.sections():
        if section_name.startswith('env:'):
            if 'build_flags' in config[section_name]:
                build_flags = config[section_name]['build_flags']
                # Replace existing LOG_LEVEL definition or add it if not present
                if 'LOG_LEVEL=' in build_flags:
                    # Replace existing LOG_LEVEL to ERROR (unquoted token)
                    pattern = r'-D\s*LOG_LEVEL=["\']?[^"\'\s]*["\']?'
                    build_flags = re.sub(pattern, '-D LOG_LEVEL=ERROR', build_flags)
                else:
                    # Add LOG_LEVEL if not present
                    build_flags += '\n\t-D LOG_LEVEL=ERROR'

                # Ensure additional production hardening flags are present
                extra_flags = [
                    '-D LOG_LEVEL_NUM=0',                 # compile-time numeric level (0=ERROR)
                    '-D CORE_DEBUG_LEVEL=0',              # silence Arduino core
                ]

                for flag in extra_flags:
                    if flag not in build_flags:
                        build_flags += f"\n\t{flag}"
                config[section_name]['build_flags'] = build_flags
    
    # Write the modified config to a temporary file for the build process
    temp_config_path = 'platformio_temp.ini'
    try:
        with open(temp_config_path, 'w') as temp_config_file:
            config.write(temp_config_file)
    except Exception as e:
        print(f"Error: Failed to write temporary config file: {e}")
        sys.exit(1)
    
    try:
        # Find all environments first
        environments = []
        for section in config.sections():
            if section.startswith('env:'):
                env_name = section[4:]  # Remove 'env:' prefix
                environments.append(env_name)
        
        if not environments:
            print("Error: No environments found in platformio.ini")
            sys.exit(1)
            
        print(f"Found environments: {environments}")
        
        # Get base firmware information from [env] section and/or first environment
        # Values can be in the base [env] section or in environment-specific sections
        base_build_flags = config['env'].get('build_flags', '') if 'env' in config else ''
        first_env_section = f'env:{environments[0]}'
        first_env_build_flags = config[first_env_section].get('build_flags', '')
        
        # Combine flags for extraction (env-specific can override base)
        combined_flags = base_build_flags + '\n' + first_env_build_flags
        
        firmware_name = extract_define_value(combined_flags, 'FIRMWARE_NAME')
        firmware_friendly_name = extract_define_value(combined_flags, 'FIRMWARE_FRIENDLY_NAME')
        firmware_version = extract_define_value(combined_flags, 'FIRMWARE_VERSION')
        
        if not firmware_name:
            print(f"Error: FIRMWARE_NAME is not defined in build_flags of [env] or [{first_env_section}] section")
            sys.exit(1)
            
        if not firmware_version:
            print(f"Error: FIRMWARE_VERSION is not defined in build_flags of [env] or [{first_env_section}] section")
            sys.exit(1)
            
        if not firmware_friendly_name:
            print(f"Error: FIRMWARE_FRIENDLY_NAME is not defined in build_flags of [env] or [{first_env_section}] section")
            sys.exit(1)
            
        print(f"Base firmware name: {firmware_name}")
        print(f"Base firmware friendly name: {firmware_friendly_name}")
        print(f"Firmware version: {firmware_version}")
        
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
            
            # Extract values from build flags (combine base [env] with environment-specific)
            env_build_flags = config[env_section].get('build_flags', '')
            combined_env_flags = base_build_flags + '\n' + env_build_flags
            
            # Extract firmware name for this specific environment (can override base)
            env_firmware_name = extract_define_value(combined_env_flags, 'FIRMWARE_NAME')
            env_firmware_friendly_name = extract_define_value(combined_env_flags, 'FIRMWARE_FRIENDLY_NAME')
            
            # Use environment-specific values if defined, otherwise fall back to base
            current_firmware_name = env_firmware_name if env_firmware_name else firmware_name
            current_firmware_friendly_name = env_firmware_friendly_name if env_firmware_friendly_name else firmware_friendly_name
            
            firmware_variant = extract_define_value(combined_env_flags, 'FIRMWARE_VARIANT')
            firmware_variant_friendly_name = extract_define_value(combined_env_flags, 'FIRMWARE_VARIANT_FRIENDLY_NAME')
            board_family = extract_define_value(combined_env_flags, 'BOARD_FAMILY')

            if not firmware_variant:
                print(f"Error: FIRMWARE_VARIANT is not defined in build_flags for environment '{env}'")
                sys.exit(1)

            if not firmware_variant_friendly_name:
                print(f"Error: FIRMWARE_VARIANT_FRIENDLY_NAME is not defined in build_flags for environment '{env}'")
                sys.exit(1)

            # Derive chip from the PlatformIO 'board' setting, not from BOARD_FAMILY define
            board = config[env_section].get('board', '')
            board_l = board.lower()
            if 'esp32c3' in board_l or 'esp32-c3' in board_l or '_c3_' in board_l or '_c3' in board_l:
                chip = 'esp32c3'
                board_family_auto = 'ESP32-C3'
            elif 'esp32-s3' in board_l or 'esp32s3' in board_l or '_s3_' in board_l or '_s3' in board_l:
                chip = 'esp32s3'
                board_family_auto = 'ESP32-S3'
            elif 'esp32-s2' in board_l or 'esp32s2' in board_l or '_s2_' in board_l or '_s2' in board_l:
                chip = 'esp32s2'
                board_family_auto = 'ESP32-S2'
            else:
                chip = 'esp32'
                board_family_auto = 'ESP32'

            print(f"  Firmware name: {current_firmware_name}")
            print(f"  Firmware variant: {firmware_variant}")
            print(f"  Firmware variant friendly name: {firmware_variant_friendly_name}")
            print(f"  Firmware version: {firmware_version}")
            print(f"  Board: {board} -> chip: {chip}")
            if board_family:
                print(f"  BOARD_FAMILY define: {board_family}")
            
            # Build firmware using temporary config with production build type
            try:
                subprocess.run(['platformio', 'run', '-c', temp_config_path, '-e', env], check=True)
            except subprocess.CalledProcessError:
                print(f"Error: Build failed for environment '{env}'")
                sys.exit(1)
            
            # Check firmware files
            firmware_path = f".pio/build/{env}/firmware.bin"
            bootloader_path = f".pio/build/{env}/bootloader.bin"
            partitions_path = f".pio/build/{env}/partitions.bin"

            idedata_path = f".pio/build/{env}/idedata.json"

            # Check if any file is missing
            missing_files = []
            for file_path in [firmware_path, bootloader_path, partitions_path]:
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
            
            # Fall back to simple, known-good offsets if idedata not available or failed
            if not flash_images:
                print(f"Falling back to default offsets for chip '{chip}'")
                if chip in ("esp32s3", "esp32c3"):
                    # S3/C3 bootloader at 0x0000
                    flash_images = [
                        (0x0, "0x0", bootloader_path),
                        (0x8000, "0x8000", partitions_path),
                        (0x10000, "0x10000", firmware_path),
                    ]
                else:
                    # Classic ESP32 bootloader at 0x1000
                    flash_images = [
                        (0x1000, "0x1000", bootloader_path),
                        (0x8000, "0x8000", partitions_path),
                        (0x10000, "0x10000", firmware_path),
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
            firmware_filename = f"{current_firmware_name}_{firmware_variant}.bin"
            merged_bin_path = os.path.join(output_dir, firmware_filename)
            try:
                print(f"Creating merged firmware for {env}...")
                python_cmd = resolve_python_command()
                candidate_platformio_homes = [
                    os.environ.get('PLATFORMIO_HOME_DIR'),
                    os.path.join(os.path.expanduser('~'), '.platformio'),
                    os.path.join(os.getcwd(), '.platformio'),
                    '/home/ubuntu/.platformio',
                    '/root/.platformio',
                ]

                esptool_cmd = [python_cmd, '-m', 'esptool']
                for platformio_home in dict.fromkeys(filter(None, candidate_platformio_homes)):
                    esptool_script = os.path.join(platformio_home, 'packages', 'tool-esptoolpy', 'esptool.py')
                    if os.path.exists(esptool_script):
                        esptool_cmd = [python_cmd, esptool_script]
                        break

                merge_cmd = [
                    *esptool_cmd,
                    '--chip', chip, 'merge_bin',
                    '-o', merged_bin_path,
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

            # Also export the app-only OTA image (do not merge bootloader/partitions)
            ota_filename = f"{current_firmware_name}_{firmware_variant}_ota.bin"
            ota_bin_path = os.path.join(output_dir, ota_filename)
            try:
                shutil.copyfile(firmware_path, ota_bin_path)
                print(f"OTA app image copied to: {ota_bin_path}")
            except Exception as e:
                print(f"Error: Failed to copy OTA image for environment '{env}': {e}")
                sys.exit(1)

            # Determine flash parameters based on chip type and board configuration
            # Default flash parameters for each chip type
            if chip == 'esp32s3':
                flash_mode = 'dio'  # DIO is safer/more compatible for ESP32-S3
                flash_freq = '80m'
                flash_size = '16MB'
            elif chip == 'esp32s2':
                flash_mode = 'dio'
                flash_freq = '80m'
                flash_size = '4MB'
            elif chip == 'esp32c3':
                flash_mode = 'dio'
                flash_freq = '80m'
                flash_size = '4MB'
            else:  # esp32
                flash_mode = 'dio'
                flash_freq = '40m'
                flash_size = '4MB'

            firmware_info.append({
                "name": current_firmware_name,
                "friendlyName": current_firmware_friendly_name,
                "variant": firmware_variant,
                "variantFriendlyName": firmware_variant_friendly_name,
                "version": firmware_version,
                "boardFamily": board_family if board_family else board_family_auto,
                "filename": firmware_filename,
                "filenameOTA": ota_filename,
                "chip": chip,
                "flashMode": flash_mode,
                "flashFreq": flash_freq,
                "flashSize": flash_size
            })
        
        # Create single consolidated firmware manifest
        consolidated_manifest = {
            "firmwares": firmware_info
        }
        
        with open(os.path.join(output_dir, "firmwares.json"), 'w') as f:
            json.dump(consolidated_manifest, f, indent=2)
        
        print(f"Build completed. Output in {output_dir}")
        print(f"Total environments built: {len(firmware_info)}")
        
    finally:
        # Clean up temporary config file
        try:
            if os.path.exists(temp_config_path):
                os.remove(temp_config_path)
                print(f"Cleaned up temporary config file: {temp_config_path}")
        except Exception as e:
            print(f"Warning: Could not remove temporary config file: {e}")

if __name__ == "__main__":
    main()