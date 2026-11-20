// Routing of the secure profile's mbedTLS allocator (src/api/security/tls_memory.c): only the two record buffers
// of mbedtls_ssl_setup() may go to PSRAM. Runs the routing against host Mbed TLS 4.1.0 with the device's
// record content lengths, through full TLS 1.2 and 1.3 handshakes, so a change in how mbedTLS sizes or
// allocates the buffers fails here. Both sides take the lengths from ssl_misc.h, as the firmware does; the
// host's are larger only by its DTLS connection ID option.
#define MBEDTLS_ALLOW_PRIVATE_ACCESS
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "mbedtls/pk.h"
#include "mbedtls/platform.h"
#include "mbedtls/ssl.h"
#include "mbedtls/x509_crt.h"
#include "psa/crypto.h"
#include "psa_crypto_core.h"
#include "ssl_misc.h"

#include "api/security/tls_memory_route.h"

static int failures;
#define CHECK(condition)                                                    \
    do                                                                      \
    {                                                                       \
        if (!(condition))                                                   \
        {                                                                   \
            fprintf(stderr, "%s:%d: CHECK(%s)\n", __FILE__, __LINE__, #condition); \
            failures++;                                                     \
        }                                                                   \
    } while (0)

enum { MAX_RECORDED = 8 };
static void *record_buffers[MAX_RECORDED];
static size_t record_buffer_count;
static size_t internal_count;

static void *recording_calloc(size_t count, size_t size)
{
    void *ptr = calloc(count, size);
    if (ptr && tls_memory_is_record_buffer(count, size, MBEDTLS_SSL_IN_BUFFER_LEN, MBEDTLS_SSL_OUT_BUFFER_LEN))
    {
        if (record_buffer_count < MAX_RECORDED)
            record_buffers[record_buffer_count] = ptr;
        record_buffer_count++;
    }
    else if (ptr)
    {
        internal_count++;
    }
    return ptr;
}

static int is_recorded(const void *ptr)
{
    for (size_t i = 0; i < record_buffer_count && i < MAX_RECORDED; i++)
        if (record_buffers[i] == ptr)
            return 1;
    return 0;
}

static void routing_is_exact(void)
{
    const size_t in = MBEDTLS_SSL_IN_BUFFER_LEN, out = MBEDTLS_SSL_OUT_BUFFER_LEN;
    CHECK(tls_memory_is_record_buffer(1, in, in, out));
    CHECK(tls_memory_is_record_buffer(1, out, in, out));
    CHECK(!tls_memory_is_record_buffer(1, in - 1, in, out));
    CHECK(!tls_memory_is_record_buffer(1, in + 1, in, out));
    CHECK(!tls_memory_is_record_buffer(1, out + 1, in, out));
    CHECK(!tls_memory_is_record_buffer(1, 64 * 1024, in, out));
    // Arrays (bignum limbs, key slots) never match, even when count * size equals a buffer length.
    CHECK(!tls_memory_is_record_buffer(in, 1, in, out));
    CHECK(!tls_memory_is_record_buffer(0, in, in, out));
}

// Secret-bearing TLS structures must never share a record buffer length.
static void structures_are_not_record_sized(void)
{
    const size_t sizes[] = {sizeof(mbedtls_ssl_context), sizeof(mbedtls_ssl_handshake_params),
                            sizeof(mbedtls_ssl_transform), sizeof(mbedtls_ssl_session), sizeof(mbedtls_ssl_config),
                            sizeof(psa_key_slot_t)};
    for (size_t i = 0; i < sizeof(sizes) / sizeof(sizes[0]); i++)
        CHECK(!tls_memory_is_record_buffer(1, sizes[i], MBEDTLS_SSL_IN_BUFFER_LEN, MBEDTLS_SSL_OUT_BUFFER_LEN));
}

// In-memory transport: each endpoint reads its inbox and writes the peer's.
typedef struct
{
    unsigned char data[64 * 1024];
    size_t length;
} pipe_buffer;

typedef struct
{
    pipe_buffer *inbox;
    pipe_buffer *outbox;
} endpoint;

static int endpoint_send(void *context, const unsigned char *data, size_t length)
{
    pipe_buffer *out = ((endpoint *)context)->outbox;
    if (length > sizeof(out->data) - out->length)
        return MBEDTLS_ERR_SSL_WANT_WRITE;
    memcpy(out->data + out->length, data, length);
    out->length += length;
    return (int)length;
}

static int endpoint_receive(void *context, unsigned char *data, size_t length)
{
    pipe_buffer *in = ((endpoint *)context)->inbox;
    if (in->length == 0)
        return MBEDTLS_ERR_SSL_WANT_READ;
    if (length > in->length)
        length = in->length;
    memcpy(data, in->data, length);
    memmove(in->data, in->data + length, in->length - length);
    in->length -= length;
    return (int)length;
}

static int still_running(int result)
{
    return result == MBEDTLS_ERR_SSL_WANT_READ || result == MBEDTLS_ERR_SSL_WANT_WRITE ||
           result == MBEDTLS_ERR_SSL_RECEIVED_NEW_SESSION_TICKET;
}

// Reads `length` bytes of application data, letting the peer's post-handshake messages through.
static int read_exactly(mbedtls_ssl_context *ssl, unsigned char *data, size_t length)
{
    size_t done = 0;
    for (int attempt = 0; attempt < 64 && done < length; attempt++)
    {
        const int result = mbedtls_ssl_read(ssl, data + done, length - done);
        if (result > 0)
            done += (size_t)result;
        else if (!still_running(result))
            return result;
    }
    return done == length ? 0 : -1;
}

// Setup, a full handshake and application data in both directions, as the reader's outer (TLS 1.2) and inner
// (TLS 1.3) sessions do: across all of it, only the record buffers of the two contexts may match.
static void handshake_routes_only_the_record_buffers(mbedtls_ssl_protocol_version version, psa_key_id_t key,
                                                     const mbedtls_x509_crt *certificate)
{
    static pipe_buffer to_client, to_server;
    endpoint client_end = {&to_client, &to_server}, server_end = {&to_server, &to_client};
    to_client.length = to_server.length = 0;

    mbedtls_ssl_config client_conf, server_conf;
    mbedtls_ssl_context client, server;
    mbedtls_pk_context server_key;
    mbedtls_ssl_config_init(&client_conf);
    mbedtls_ssl_config_init(&server_conf);
    mbedtls_ssl_init(&client);
    mbedtls_ssl_init(&server);
    mbedtls_pk_init(&server_key);
    CHECK(mbedtls_ssl_config_defaults(&client_conf, MBEDTLS_SSL_IS_CLIENT, MBEDTLS_SSL_TRANSPORT_STREAM,
                                      MBEDTLS_SSL_PRESET_DEFAULT) == 0);
    CHECK(mbedtls_ssl_config_defaults(&server_conf, MBEDTLS_SSL_IS_SERVER, MBEDTLS_SSL_TRANSPORT_STREAM,
                                      MBEDTLS_SSL_PRESET_DEFAULT) == 0);
    mbedtls_ssl_config *confs[] = {&client_conf, &server_conf};
    for (size_t i = 0; i < 2; i++)
    {
        mbedtls_ssl_conf_min_tls_version(confs[i], version);
        mbedtls_ssl_conf_max_tls_version(confs[i], version);
    }
    mbedtls_ssl_conf_authmode(&client_conf, MBEDTLS_SSL_VERIFY_NONE);
    CHECK(mbedtls_pk_wrap_psa(&server_key, key) == 0);
    CHECK(mbedtls_ssl_conf_own_cert(&server_conf, (mbedtls_x509_crt *)certificate, &server_key) == 0);

    record_buffer_count = 0;
    internal_count = 0;
    CHECK(mbedtls_ssl_setup(&client, &client_conf) == 0);
    CHECK(record_buffer_count == 2);
    CHECK(is_recorded(client.in_buf) && is_recorded(client.out_buf));
    // Handshake state, the negotiated transform and session are allocated by the same call and stay internal.
    CHECK(client.handshake != NULL && !is_recorded(client.handshake));
    CHECK(client.transform_negotiate != NULL && !is_recorded(client.transform_negotiate));
    CHECK(client.session_negotiate != NULL && !is_recorded(client.session_negotiate));
    CHECK(mbedtls_ssl_setup(&server, &server_conf) == 0);
    CHECK(record_buffer_count == 4);
    CHECK(is_recorded(server.in_buf) && is_recorded(server.out_buf));
    mbedtls_ssl_set_bio(&client, &client_end, endpoint_send, endpoint_receive, NULL);
    mbedtls_ssl_set_bio(&server, &server_end, endpoint_send, endpoint_receive, NULL);

    int client_result = MBEDTLS_ERR_SSL_WANT_READ, server_result = MBEDTLS_ERR_SSL_WANT_READ;
    for (int round = 0; round < 64 && (still_running(client_result) || still_running(server_result)); round++)
    {
        if (still_running(client_result))
            client_result = mbedtls_ssl_handshake(&client);
        if (still_running(server_result))
            server_result = mbedtls_ssl_handshake(&server);
    }
    CHECK(client_result == 0 && server_result == 0);    CHECK(mbedtls_ssl_get_version_number(&client) == version);

    unsigned char sent[3000], received[sizeof(sent)];
    for (size_t i = 0; i < sizeof(sent); i++)
        sent[i] = (unsigned char)i;
    CHECK(mbedtls_ssl_write(&client, sent, sizeof(sent)) == (int)sizeof(sent));
    CHECK(read_exactly(&server, received, sizeof(received)) == 0 && memcmp(sent, received, sizeof(sent)) == 0);
    CHECK(mbedtls_ssl_write(&server, sent, sizeof(sent)) == (int)sizeof(sent));
    CHECK(read_exactly(&client, received, sizeof(received)) == 0 && memcmp(sent, received, sizeof(sent)) == 0);

    // Key schedule, PSA keys, certificates and transforms all went to internal RAM.
    CHECK(record_buffer_count == 4);
    CHECK(internal_count > 10);

    mbedtls_ssl_free(&client);
    mbedtls_ssl_free(&server);
    mbedtls_ssl_config_free(&client_conf);
    mbedtls_ssl_config_free(&server_conf);
    mbedtls_pk_free(&server_key);
}

static void handshakes_route_only_the_record_buffers(void)
{
    mbedtls_platform_set_calloc_free(recording_calloc, free);
    CHECK(psa_crypto_init() == PSA_SUCCESS);

    psa_key_attributes_t attributes = PSA_KEY_ATTRIBUTES_INIT;
    psa_set_key_type(&attributes, PSA_KEY_TYPE_ECC_KEY_PAIR(PSA_ECC_FAMILY_SECP_R1));
    psa_set_key_bits(&attributes, 256);
    psa_set_key_usage_flags(&attributes, PSA_KEY_USAGE_SIGN_HASH | PSA_KEY_USAGE_VERIFY_HASH);
    // The ECDSA variant TLS 1.2 asks of the server key (deterministic when available).
    psa_set_key_algorithm(&attributes, MBEDTLS_PK_ALG_ECDSA(PSA_ALG_ANY_HASH));
    psa_key_id_t key = 0;
    CHECK(psa_generate_key(&attributes, &key) == PSA_SUCCESS);

    mbedtls_pk_context pk;
    mbedtls_pk_init(&pk);
    CHECK(mbedtls_pk_wrap_psa(&pk, key) == 0);
    mbedtls_x509write_cert writer;
    mbedtls_x509write_crt_init(&writer);
    mbedtls_x509write_crt_set_version(&writer, MBEDTLS_X509_CRT_VERSION_3);
    mbedtls_x509write_crt_set_md_alg(&writer, MBEDTLS_MD_SHA256);
    mbedtls_x509write_crt_set_subject_key(&writer, &pk);
    mbedtls_x509write_crt_set_issuer_key(&writer, &pk);
    CHECK(mbedtls_x509write_crt_set_subject_name(&writer, "CN=server") == 0);
    CHECK(mbedtls_x509write_crt_set_issuer_name(&writer, "CN=server") == 0);
    const unsigned char serial[] = {1};
    CHECK(mbedtls_x509write_crt_set_serial_raw(&writer, serial, sizeof(serial)) == 0);
    CHECK(mbedtls_x509write_crt_set_validity(&writer, "20250101000000", "20450101000000") == 0);
    unsigned char der[1024];
    const int written = mbedtls_x509write_crt_der(&writer, der, sizeof(der));
    CHECK(written > 0);
    mbedtls_x509write_crt_free(&writer);
    mbedtls_pk_free(&pk);
    mbedtls_x509_crt certificate;
    mbedtls_x509_crt_init(&certificate);
    CHECK(written > 0 && mbedtls_x509_crt_parse_der(&certificate, der + sizeof(der) - written, (size_t)written) == 0);

    handshake_routes_only_the_record_buffers(MBEDTLS_SSL_VERSION_TLS1_2, key, &certificate);
    handshake_routes_only_the_record_buffers(MBEDTLS_SSL_VERSION_TLS1_3, key, &certificate);

    mbedtls_x509_crt_free(&certificate);
    psa_destroy_key(key);
    mbedtls_psa_crypto_free();
}

int main(void)
{
    routing_is_exact();
    structures_are_not_record_sized();
    handshakes_route_only_the_record_buffers();
    printf("in=%zu out=%zu: %s\n", (size_t)MBEDTLS_SSL_IN_BUFFER_LEN, (size_t)MBEDTLS_SSL_OUT_BUFFER_LEN,
           failures ? "FAILED" : "ok");
    return failures ? 1 : 0;
}
