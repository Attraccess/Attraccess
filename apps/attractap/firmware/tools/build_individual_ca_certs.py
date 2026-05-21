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
import requests
import re
import hashlib
import shutil
import time
import argparse
from pathlib import Path
from datetime import datetime, timedelta

# Configuration
MOZILLA_CA_URL = "https://curl.se/ca/cacert.pem"
OUTPUT_DIR = Path("src/certs")
INDEX_FILE = OUTPUT_DIR / "ca_index.hpp"
TIMESTAMP_FILE = OUTPUT_DIR / ".last_download"
MAX_CERT_AGE_DAYS = 7

# Most common Certificate Authorities in order of popularity
# Based on SSL certificate market share and usage statistics
PRIORITY_CAS = [
    # Let's Encrypt (most popular free CA)
    "ISRG Root X1",
    "ISRG Root X2",
    
    # Sectigo/Comodo (large market share)
    "Sectigo Public Server Authentication Root R46",
    "Sectigo Public Server Authentication Root E46", 
    "AAA Certificate Services",
    "COMODO RSA Certification Authority",
    "USERTrust RSA Certification Authority",
    "USERTrust ECC Certification Authority",
    
    # DigiCert (widely used enterprise CA)
    "DigiCert Global Root CA",
    "DigiCert Global Root G2",
    "DigiCert Global Root G3", 
    "DigiCert High Assurance EV Root CA",
    "DigiCert Assured ID Root CA",
    "DigiCert TLS RSA SHA256 2020 CA1",
    
    # GlobalSign (popular enterprise CA)
    "GlobalSign Root CA",
    "GlobalSign Root CA - R2",
    "GlobalSign Root CA - R3",
    "GlobalSign Root CA - R6",
    "GlobalSign ECC Root CA - R4",
    "GlobalSign ECC Root CA - R5",
    
    # GoDaddy (popular with small businesses)
    "Go Daddy Root Certificate Authority - G2",
    "Starfield Root Certificate Authority - G2",
    "Go Daddy Class 2 Certification Authority",
    "Starfield Class 2 Certification Authority",
    
    # Amazon (AWS Certificate Manager)
    "Amazon Root CA 1",
    "Amazon Root CA 2", 
    "Amazon Root CA 3",
    "Amazon Root CA 4",
    
    # Google Trust Services
    "GTS Root R1",
    "GTS Root R2",
    "GTS Root R3", 
    "GTS Root R4",
    
    # Microsoft (Azure, Office 365)
    "Microsoft RSA Root Certificate Authority 2017",
    "Microsoft ECC Root Certificate Authority 2017",
    
    # Cloudflare
    "Cloudflare Inc ECC CA-3",
    
    # IdenTrust (Let's Encrypt cross-sign)
    "IdenTrust Commercial Root CA 1",
    "IdenTrust Public Sector Root CA 1",
    "DST Root CA X3",  # Legacy Let's Encrypt cross-sign
    
    # Entrust 
    "Entrust Root Certification Authority",
    "Entrust Root Certification Authority - G2",
    "Entrust Root Certification Authority - EC1",
    "Entrust Root Certification Authority - G4",
    
    # VeriSign/Symantec (now DigiCert)
    "VeriSign Class 3 Public Primary Certification Authority - G5",
    "Class 3 Public Primary Certification Authority",
    
    # Thawte
    "thawte Primary Root CA",
    "thawte Primary Root CA - G2",
    "thawte Primary Root CA - G3",
    
    # GeoTrust (now DigiCert)
    "GeoTrust Global CA",
    "GeoTrust Primary Certification Authority",
    "GeoTrust Primary Certification Authority - G2",
    "GeoTrust Primary Certification Authority - G3",
    
    # RapidSSL (now DigiCert)
    "GeoTrust RSA CA 2018",
    
    # Baltimore CyberTrust (Microsoft services)
    "Baltimore CyberTrust Root",
    
    # Certum
    "Certum Trusted Network CA",
    "Certum Trusted Network CA 2",
]

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
        # Read the timestamp of last download
        with open(TIMESTAMP_FILE, 'r') as f:
            timestamp_str = f.read().strip()
        
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
    """Save the current timestamp to indicate when certificates were last downloaded."""
    timestamp = datetime.now().isoformat()
    with open(TIMESTAMP_FILE, 'w') as f:
        f.write(timestamp)
    print(f"💾 Saved download timestamp: {timestamp}")

def prioritize_certificates(certificates):
    """Reorder certificates to put most common CAs first."""
    print(f"Reordering {len(certificates)} certificates by priority...")
    
    # Create a map for quick lookup
    cert_map = {cert['name']: cert for cert in certificates}
    
    # Start with prioritized certificates
    prioritized_certs = []
    used_names = set()
    
    # Add priority certificates first
    for priority_name in PRIORITY_CAS:
        # Try exact match first
        if priority_name in cert_map:
            prioritized_certs.append(cert_map[priority_name])
            used_names.add(priority_name)
            print(f"✓ Priority CA: {priority_name}")
        else:
            # Try partial matching for certificates that might have slightly different names
            for cert_name in cert_map:
                if (priority_name.lower() in cert_name.lower() or 
                    cert_name.lower() in priority_name.lower()) and cert_name not in used_names:
                    prioritized_certs.append(cert_map[cert_name])
                    used_names.add(cert_name)
                    print(f"✓ Priority CA (partial match): {cert_name} (matched {priority_name})")
                    break
    
    # Add remaining certificates that weren't prioritized
    remaining_certs = [cert for cert in certificates if cert['name'] not in used_names]
    print(f"✓ Added {len(prioritized_certs)} priority certificates")
    print(f"✓ Adding {len(remaining_certs)} remaining certificates")
    
    # Return prioritized certificates first, then the rest
    return prioritized_certs + remaining_certs

def download_mozilla_bundle():
    """Download the Mozilla root CA bundle."""
    print("Downloading Mozilla root CA bundle...")
    try:
        response = requests.get(MOZILLA_CA_URL, timeout=30)
        response.raise_for_status()
        print(f"Downloaded {len(response.text)} bytes")
        return response.text
    except Exception as e:
        print(f"Error downloading CA bundle: {e}")
        return None

def parse_certificates(bundle_text):
    """Parse individual PEM certificates from bundle text."""
    certificates = []
    current_cert_lines = []
    current_cert_name = ""
    in_cert = False
    
    lines = bundle_text.split('\n')
    i = 0
    
    while i < len(lines):
        line = lines[i].strip()
        
        # Look for certificate name pattern (name followed by line of equals)
        if (not in_cert and line and not line.startswith('#') and 
            i + 1 < len(lines) and lines[i + 1].strip().startswith('===')):
            current_cert_name = line.strip()
            i += 1  # Skip the equals line
        elif line == '-----BEGIN CERTIFICATE-----':
            in_cert = True
            current_cert_lines = [line]
        elif line == '-----END CERTIFICATE-----':
            current_cert_lines.append(line)
            in_cert = False
            
            # Store the complete certificate
            if current_cert_name:
                cert_data = '\n'.join(current_cert_lines)
                certificates.append({
                    'name': current_cert_name,
                    'data': cert_data
                })
                print(f"Found certificate: {current_cert_name}")
            current_cert_lines = []
            current_cert_name = ""
        elif in_cert:
            current_cert_lines.append(line)
        
        i += 1
    
    return certificates

def generate_safe_filename(name):
    """Generate a safe filename from certificate name."""
    # Remove special characters and replace spaces/slashes with underscores
    safe_name = re.sub(r'[^\w\s-]', '', name)
    safe_name = re.sub(r'[-\s]+', '_', safe_name)
    return safe_name.lower()

def create_ca_index_header(cert_files):
    """Create a header file with CA certificate index."""
    header_content = [
        "#pragma once",
        "",
        "// Auto-generated CA certificate index",
        "#include <Arduino.h>",
        "",
        f"#define CA_CERT_COUNT {len(cert_files)}",
        "",
        "struct CACertInfo {",
        "    const char* name;",
        "    const char* filename;",
        "    const char* data;",
        "};",
        "",
        "// Individual CA certificate data"
    ]
    
    # Add extern declarations for each certificate
    for i, (name, filename) in enumerate(cert_files):
        var_name = f"ca_cert_{i:02d}_data"
        header_content.append(f"extern const char {var_name}[] PROGMEM;")
    
    header_content.extend([
        "",
        "// CA certificate index array",
        "extern const CACertInfo ca_certificates[CA_CERT_COUNT] PROGMEM;",
        ""
    ])
    
    return '\n'.join(header_content)

def create_ca_data_file(cert_files, certificates_map):
    """Create implementation file with certificate data."""
    cpp_content = [
        '#include "ca_index.hpp"',
        "",
        "// Individual CA certificate data"
    ]
    
    # Add certificate data arrays
    for i, (name, filename) in enumerate(cert_files):
        var_name = f"ca_cert_{i:02d}_data"
        cert_data = certificates_map[name]['data']
        
        cpp_content.append(f"const char {var_name}[] PROGMEM = R\"CERT(")
        cpp_content.append(cert_data)
        cpp_content.append(")CERT\";")
        cpp_content.append("")
    
    # Add index array
    cpp_content.extend([
        "// CA certificate index array",
        "const CACertInfo ca_certificates[CA_CERT_COUNT] PROGMEM = {"
    ])
    
    for i, (name, filename) in enumerate(cert_files):
        var_name = f"ca_cert_{i:02d}_data"
        cpp_content.append(f'    {{"{name}", "{filename}", {var_name}}},')
    
    cpp_content.append("};")
    
    return '\n'.join(cpp_content)

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
    
    # Prioritize certificates to put most common CAs first
    print(f"\n🔄 Prioritizing certificates...")
    prioritized_certs = prioritize_certificates(all_certs)
    
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