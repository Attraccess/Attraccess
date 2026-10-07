"""Download and parse Mozilla certificate bundles."""
import urllib.request
import re
from ca_selection import MOZILLA_CA_URL

def download_mozilla_bundle():
    """Download the Mozilla root CA bundle."""
    print("Downloading Mozilla root CA bundle...")
    try:
        with urllib.request.urlopen(MOZILLA_CA_URL, timeout=30) as response:
            if response.status != 200:
                raise RuntimeError(f"HTTP {response.status}")
            bundle_text = response.read().decode("utf-8")
        print(f"Downloaded {len(bundle_text)} bytes")
        return bundle_text
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
