#pragma once

#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// mbedtls_ssl_setup() requests the record input and output buffers as calloc(1, len) with exactly these
// lengths. Matching the exact lengths, not a size threshold, keeps every other request in internal RAM,
// including any large structure that holds keys or handshake secrets.
static inline bool tls_memory_is_record_buffer(size_t count, size_t size, size_t in_buf_len, size_t out_buf_len)
{
    return count == 1 && (size == in_buf_len || size == out_buf_len);
}

#ifdef __cplusplus
}
#endif
