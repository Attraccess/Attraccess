#pragma once

// Custom Root CA Bundle (embedded via PlatformIO)
extern const char root_ca_bundle_pem_start[] asm("_binary_data_cert_root_ca_bundle_pem_start") __attribute__((weak));
extern const char root_ca_bundle_pem_end[] asm("_binary_data_cert_root_ca_bundle_pem_end") __attribute__((weak));