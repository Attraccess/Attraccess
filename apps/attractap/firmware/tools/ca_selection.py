"""Adaptive TLS certificate selection policy."""
import hashlib
from pathlib import Path


# Configuration
MOZILLA_CA_URL = "https://curl.se/ca/cacert.pem"
OUTPUT_DIR = Path("src/certs")
INDEX_FILE = OUTPUT_DIR / "ca_index.hpp"
TIMESTAMP_FILE = OUTPUT_DIR / ".last_download"
MAX_CERT_AGE_DAYS = 7

# Only keep this many CAs (most common first, per PRIORITY_CAS order) instead
# of storing the full Mozilla bundle - keeps flash usage and build time down.
CERT_LIMIT = 20

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

def config_fingerprint():
    """Fingerprint of the selection config; a change must invalidate cached output."""
    return hashlib.sha256(
        (str(CERT_LIMIT) + "\n" + "\n".join(PRIORITY_CAS)).encode()
    ).hexdigest()[:16]


def prioritize_certificates(certificates, limit):
    """Pick the `limit` most common CAs, PRIORITY_CAS order first."""
    print(f"Selecting top {limit} of {len(certificates)} certificates by priority...")

    # Create a map for quick lookup
    cert_map = {cert['name']: cert for cert in certificates}

    # Start with prioritized certificates
    prioritized_certs = []
    used_names = set()

    # Add priority certificates first
    for priority_name in PRIORITY_CAS:
        if len(prioritized_certs) >= limit:
            break
        # Already consumed (e.g. by an earlier partial match) - do not fall
        # through to partial matching, that would append an unrelated cert.
        if priority_name in used_names:
            continue
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

    # Fill any slots left by priority CAs missing from the bundle
    remaining_slots = limit - len(prioritized_certs)
    remaining_certs = [cert for cert in certificates if cert['name'] not in used_names][:remaining_slots]
    print(f"✓ Added {len(prioritized_certs)} priority certificates")
    print(f"✓ Adding {len(remaining_certs)} remaining certificates")

    # Return prioritized certificates first, then the rest
    return prioritized_certs + remaining_certs
