// mbedTLS allocator of the secure profile (CONFIG_MBEDTLS_CUSTOM_MEM_ALLOC, see sdkconfig.secure): only the
// TLS record buffers go to PSRAM; keys, secrets, bignums, PK/cipher contexts and handshake state stay in
// internal RAM. Standard builds use CONFIG_MBEDTLS_EXTERNAL_MEM_ALLOC and compile nothing here.
#include "sdkconfig.h"

#if CONFIG_MBEDTLS_CUSTOM_MEM_ALLOC

// ssl_misc.h is written for the library's own sources, which see private members and identifiers.
#define MBEDTLS_ALLOW_PRIVATE_ACCESS
#define MBEDTLS_DECLARE_PRIVATE_IDENTIFIERS
#include "esp_heap_caps.h"
#include "mbedtls/platform.h"
// Private mbedTLS headers: the only source of the exact record buffer lengths, the handshake structures and
// the PSA key slot.
#include "psa_crypto_core.h"
#include "ssl_misc.h"

#include "api/security/tls_memory_route.h"

// Both change how record buffers are allocated (resized or per-record buffers of other sizes), so the
// exact-length match below would no longer find them. sdkconfig.secure keeps both off.
#if defined(MBEDTLS_SSL_VARIABLE_BUFFER_LENGTH) || CONFIG_MBEDTLS_DYNAMIC_BUFFER
#error "The secure profile TLS allocator needs fixed TLS record buffers"
#endif

// No secret-bearing mbedTLS structure may share a record buffer length, or it would follow the buffers to PSRAM.
#define TLS_MEMORY_NOT_A_RECORD_LENGTH(type)                                                              \
    _Static_assert(sizeof(type) != MBEDTLS_SSL_IN_BUFFER_LEN && sizeof(type) != MBEDTLS_SSL_OUT_BUFFER_LEN, \
                   #type " has the size of a TLS record buffer")
TLS_MEMORY_NOT_A_RECORD_LENGTH(mbedtls_ssl_context);
TLS_MEMORY_NOT_A_RECORD_LENGTH(mbedtls_ssl_handshake_params);
TLS_MEMORY_NOT_A_RECORD_LENGTH(mbedtls_ssl_transform);
TLS_MEMORY_NOT_A_RECORD_LENGTH(mbedtls_ssl_session);
TLS_MEMORY_NOT_A_RECORD_LENGTH(mbedtls_ssl_config);
TLS_MEMORY_NOT_A_RECORD_LENGTH(mbedtls_pk_context);
TLS_MEMORY_NOT_A_RECORD_LENGTH(psa_key_slot_t);
// PSA key buffers are calloc(1, key size): asymmetric keys must stay below both record buffer lengths. The
// symmetric, HMAC and derivation keys TLS creates are hash or cipher sized.
#define TLS_MEMORY_BELOW_RECORD_LENGTHS(size) \
    ((size) < MBEDTLS_SSL_IN_BUFFER_LEN && (size) < MBEDTLS_SSL_OUT_BUFFER_LEN)
_Static_assert(TLS_MEMORY_BELOW_RECORD_LENGTHS(PSA_EXPORT_KEY_PAIR_MAX_SIZE) &&
                   TLS_MEMORY_BELOW_RECORD_LENGTHS(PSA_EXPORT_PUBLIC_KEY_MAX_SIZE),
               "a PSA key buffer can have the size of a TLS record buffer");

static void *tls_memory_calloc(size_t count, size_t size)
{
    if (tls_memory_is_record_buffer(count, size, MBEDTLS_SSL_IN_BUFFER_LEN, MBEDTLS_SSL_OUT_BUFFER_LEN))
    {
        void *buffer = heap_caps_calloc(count, size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
        if (buffer)
        {
            return buffer;
        }
    }
    return heap_caps_calloc(count, size, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
}

// heap_caps_free() frees from either region, including blocks that mbedTLS took with plain calloc() before
// the allocator was installed.
static void tls_memory_free(void *ptr)
{
    heap_caps_free(ptr);
}

// Runs before the default-priority constructors, after the core init stage has added PSRAM to the heap and
// before the secondary stage calls psa_crypto_init(); nothing in the core stage uses mbedTLS.
// main/CMakeLists.txt keeps it linked.
__attribute__((constructor(101))) void attractap_tls_memory_install(void)
{
    mbedtls_platform_set_calloc_free(tls_memory_calloc, tls_memory_free);
}

#endif
