#!/usr/bin/env python3
import hashlib
import os
import json
from pathlib import Path

def get_file_hash(file_path):
    """Calculate SHA256 hash of a file"""
    hasher = hashlib.sha256()
    try:
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hasher.update(chunk)
        return hasher.hexdigest()
    except Exception as e:
        print(f"Error reading file {file_path}: {e}")
        return None

def get_directory_hash(directory_path, extensions=None):
    """Calculate combined hash of all files in a directory"""
    if not os.path.exists(directory_path):
        return None
    
    hasher = hashlib.sha256()
    
    # Get all files recursively, sorted for consistency
    files = []
    for root, dirs, filenames in os.walk(directory_path):
        for filename in filenames:
            if extensions is None or any(filename.endswith(ext) for ext in extensions):
                files.append(os.path.join(root, filename))
    
    files.sort()
    
    for file_path in files:
        file_hash = get_file_hash(file_path)
        if file_hash:
            hasher.update(file_hash.encode('utf-8'))
    
    return hasher.hexdigest()[:8]  # Use first 8 characters for brevity

def generate_version_hash():
    """Generate version hash from all relevant source files"""
    base_dir = Path(__file__).parent.parent
    
    # Files and directories to include in hash
    sources = [
        (base_dir / "src", ['.cpp', '.c', '.h', '.hpp']),
        (base_dir / "lib", ['.cpp', '.c', '.h', '.hpp']),
        (base_dir / "include", ['.h', '.hpp']),
        (base_dir / "data", None),  # All files in data
        (base_dir / "platformio.ini", None),  # The config file itself
    ]
    
    combined_hasher = hashlib.sha256()
    
    for source_path, extensions in sources:
        if source_path.exists():
            if source_path.is_file():
                # Single file (like platformio.ini)
                file_hash = get_file_hash(str(source_path))
                if file_hash:
                    combined_hasher.update(file_hash.encode('utf-8'))
            else:
                # Directory
                dir_hash = get_directory_hash(str(source_path), extensions)
                if dir_hash:
                    combined_hasher.update(dir_hash.encode('utf-8'))
    
    # Generate final version hash
    version_hash = combined_hasher.hexdigest()[:8]
    
    # Create version info
    version_info = {
        "version": version_hash,
        "generated_at": "unknown",
        "sources": [str(s) for s, _ in sources]
    }
    
    # Save version info for reference
    version_file = base_dir / "firmware_version.json"
    with open(version_file, 'w') as f:
        json.dump(version_info, f, indent=2)
    
    return version_hash

if __name__ == "__main__":
    version = generate_version_hash()
    print(f"Generated version hash: {version}")
