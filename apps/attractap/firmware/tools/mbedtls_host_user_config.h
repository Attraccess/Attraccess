// Mbed TLS options of the host builds (desktop simulator, firmware host tests) that must match the
// device (sdkconfig.defaults), so a TLS record the reader cannot take fails on the host too.
#pragma once

#define MBEDTLS_SSL_IN_CONTENT_LEN 8192
#define MBEDTLS_SSL_OUT_CONTENT_LEN 4096
