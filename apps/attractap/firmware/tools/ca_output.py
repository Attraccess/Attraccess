"""Generate the native certificate index and data definitions."""

def create_ca_index_header(cert_files):
    """Create a header file with CA certificate index."""
    header_content = [
        "#pragma once",
        "",
        "// Auto-generated CA certificate index",
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
        header_content.append(f"extern const char {var_name}[];")

    header_content.extend([
        "",
        "// CA certificate index array",
        "extern const CACertInfo ca_certificates[CA_CERT_COUNT];",
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

        cpp_content.append(f"const char {var_name}[] = R\"CERT(")
        cpp_content.append(cert_data)
        cpp_content.append(")CERT\";")
        cpp_content.append("")

    # Add index array
    cpp_content.extend([
        "// CA certificate index array",
        "const CACertInfo ca_certificates[CA_CERT_COUNT] = {"
    ])

    for i, (name, filename) in enumerate(cert_files):
        var_name = f"ca_cert_{i:02d}_data"
        cpp_content.append(f'    {{"{name}", "{filename}", {var_name}}},')

    cpp_content.append("};")

    return '\n'.join(cpp_content)
