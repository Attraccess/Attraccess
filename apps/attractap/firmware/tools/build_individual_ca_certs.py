#!/usr/bin/env python3
"""
Individual Root CA Certificate Extractor for ESP32 Adaptive SSL
Fetches Mozilla's root CA list and extracts individual certificates.

Features:
- Downloads Mozilla's CA certificate bundle
- Extracts individual PEM certificates 
- Prioritizes common CAs (Let's Encrypt, DigiCert, etc.)
- Generates C++ headers and data files for ESP32
- Caches downloads for 7 days to avoid unnecessary network requests
- Use --force to download fresh certificates regardless of age
"""

import os
import sys
import urllib.request
import re
import hashlib
import shutil
import time
import argparse
from pathlib import Path
from datetime import datetime, timedelta
from ca_selection import (OUTPUT_DIR, INDEX_FILE, TIMESTAMP_FILE, MAX_CERT_AGE_DAYS, CERT_LIMIT, PRIORITY_CAS, config_fingerprint, prioritize_certificates)
from ca_bundle import download_mozilla_bundle, parse_certificates, generate_safe_filename
from ca_output import create_ca_index_header, create_ca_data_file

def check_certificates_age():
    """Check if existing certificates are recent enough (less than MAX_CERT_AGE_DAYS old)."""
    if not OUTPUT_DIR.exists():
        print(f"Output directory {OUTPUT_DIR} doesn't exist - need to download certificates")
        return False
    
    if not TIMESTAMP_FILE.exists():
        print(f"Timestamp file {TIMESTAMP_FILE} doesn't exist - need to download certificates")
        return False
    
    if not INDEX_FILE.exists():
        print(f"Index file {INDEX_FILE} doesn't exist - need to download certificates")
        return False
    
    try:
        # Read the timestamp (line 1) and config fingerprint (line 2) of the last run
        with open(TIMESTAMP_FILE, 'r') as f:
            lines = f.read().strip().split('\n')
        timestamp_str = lines[0]

        if len(lines) < 2 or lines[1] != config_fingerprint():
            print(f"🔧 Certificate selection config changed - need to regenerate certificates")
            return False

        last_download = datetime.fromisoformat(timestamp_str)
        now = datetime.now()
        age = now - last_download
        
        if age <= timedelta(days=MAX_CERT_AGE_DAYS):
            print(f"✅ Certificates are recent (downloaded {age.days} days ago)")
            print(f"✅ Skipping download - certificates are less than {MAX_CERT_AGE_DAYS} days old")
            return True
        else:
            print(f"⏰ Certificates are {age.days} days old (older than {MAX_CERT_AGE_DAYS} days)")
            print(f"📥 Need to download fresh certificates")
            return False
            
    except (ValueError, FileNotFoundError) as e:
        print(f"❌ Error reading timestamp file: {e}")
        print(f"📥 Will download fresh certificates")
        return False


def save_download_timestamp():
    """Save the current timestamp and config fingerprint of this run."""
    timestamp = datetime.now().isoformat()
    with open(TIMESTAMP_FILE, 'w') as f:
        f.write(timestamp + '\n' + config_fingerprint())
    print(f"💾 Saved download timestamp: {timestamp}")


def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Download and process Mozilla CA certificates')
    parser.add_argument('--force', '-f', action='store_true', 
                       help='Force download even if certificates are recent')
    args = parser.parse_args()
    
    if args.force:
        print("🔄 Forcing certificate download (--force flag used)")
    else:
        print("🔍 Checking certificate age...")
        
        # Check if we have recent certificates (unless forced)
        if check_certificates_age():
            return  # Exit early if certificates are recent enough
    
    # Clean and create output directory
    if OUTPUT_DIR.exists():
        print(f"🧹 Cleaning existing output directory: {OUTPUT_DIR}")
        shutil.rmtree(OUTPUT_DIR)
    
    print(f"📁 Creating output directory: {OUTPUT_DIR}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Download and parse certificates
    bundle_text = download_mozilla_bundle()
    if not bundle_text:
        sys.exit(1)
    
    all_certificates = parse_certificates(bundle_text)
    print(f"Parsed {len(all_certificates)} certificates")
    
    # Process all certificates from Mozilla bundle
    all_certs = []
    certificates_map = {}
    
    for cert in all_certificates:
        all_certs.append(cert)
        certificates_map[cert['name']] = cert
        print(f"✓ Including: {cert['name']}")
    
    print(f"\nIncluded {len(all_certs)} certificates from Mozilla bundle")
    
    if not all_certs:
        print("No certificates found!")
        sys.exit(1)
    
    # Keep only the most common CERT_LIMIT certificates
    print(f"\n🔄 Prioritizing certificates...")
    prioritized_certs = prioritize_certificates(all_certs, CERT_LIMIT)
    print(f"✂️  Keeping top {len(prioritized_certs)} certificates (CERT_LIMIT={CERT_LIMIT})")

    # Create certificate files list
    cert_files = []
    for cert in prioritized_certs:
        safe_name = generate_safe_filename(cert['name'])
        filename = f"{safe_name}.pem"
        cert_files.append((cert['name'], filename))
        
        # Write individual certificate file
        cert_path = OUTPUT_DIR / filename
        with open(cert_path, 'w') as f:
            f.write(cert['data'])
    
    # Generate header and implementation files
    header_content = create_ca_index_header(cert_files)
    with open(INDEX_FILE, 'w') as f:
        f.write(header_content)
    
    cpp_file = OUTPUT_DIR / "ca_data.cpp"
    cpp_content = create_ca_data_file(cert_files, certificates_map)
    with open(cpp_file, 'w') as f:
        f.write(cpp_content)
    
    # Save timestamp to indicate successful download
    save_download_timestamp()
    
    print(f"\n✅ Generated {len(cert_files)} certificate files")
    print(f"✅ Created index: {INDEX_FILE}")
    print(f"✅ Created data: {cpp_file}")
    print(f"📊 Total size: ~{sum(len(cert['data']) for cert in prioritized_certs) // 1024}KB")


if __name__ == "__main__":
    main()
