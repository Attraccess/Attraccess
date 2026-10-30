#include "session_tls.hpp"
#include "session_certificates.hpp"

#include <cstring>

#include "mbedtls/oid.h"
#include "mbedtls/pk.h"
#include "mbedtls/ssl.h"
#include "mbedtls/x509.h"
#include "mbedtls/x509_crt.h"

namespace
{
    // One ciphersuite, one group, one signature algorithm: the ClientHello stays small and the
    // server (session-connection.ts) needs no HelloRetryRequest.
    const int CIPHERSUITES[] = {MBEDTLS_TLS1_3_AES_128_GCM_SHA256, 0};
    const uint16_t GROUPS[] = {MBEDTLS_SSL_IANA_TLS_GROUP_SECP256R1, MBEDTLS_SSL_IANA_TLS_GROUP_NONE};
    const uint16_t SIGNATURE_ALGORITHMS[] = {MBEDTLS_TLS1_3_SIG_ECDSA_SECP256R1_SHA256, MBEDTLS_TLS1_3_SIG_NONE};
    constexpr size_t READ_CHUNK_BYTES = 2048;
    // A TLS read that loops forever on a hostile peer must not starve the main loop.
    constexpr int MAX_READS_PER_FEED = 64;

    int verifyCallback(void *context, mbedtls_x509_crt *crt, int depth, uint32_t *flags)
    {
        return static_cast<SessionTls *>(context)->verifyServerCertificate(crt, depth, flags);
    }
}

struct SessionTls::Impl
{
    mbedtls_ssl_config conf;
    mbedtls_ssl_context ssl;
    mbedtls_x509_crt ownCertificate;
    mbedtls_pk_context ownKey;
    std::vector<uint8_t> inbound;
    size_t inboundOffset = 0;
    SessionTls *owner = nullptr;

    Impl()
    {
        mbedtls_ssl_config_init(&conf);
        mbedtls_ssl_init(&ssl);
        mbedtls_x509_crt_init(&ownCertificate);
        mbedtls_pk_init(&ownKey);
    }

    ~Impl()
    {
        mbedtls_ssl_free(&ssl);
        mbedtls_ssl_config_free(&conf);
        mbedtls_x509_crt_free(&ownCertificate);
        // Wrapped PSA keys stay owned by the IReaderKey.
        mbedtls_pk_free(&ownKey);
    }

    static int send(void *context, const unsigned char *data, size_t length)
    {
        auto *self = static_cast<Impl *>(context);
        return self->owner->sendRecords && self->owner->sendRecords(data, length) ? static_cast<int>(length)
                                                                                  : MBEDTLS_ERR_SSL_INTERNAL_ERROR;
    }

    static int receive(void *context, unsigned char *data, size_t length)
    {
        auto *self = static_cast<Impl *>(context);
        const size_t available = self->inbound.size() - self->inboundOffset;
        if (available == 0)
        {
            return MBEDTLS_ERR_SSL_WANT_READ;
        }
        const size_t count = available < length ? available : length;
        memcpy(data, self->inbound.data() + self->inboundOffset, count);
        self->inboundOffset += count;
        if (self->inboundOffset == self->inbound.size())
        {
            self->inbound.clear();
            self->inboundOffset = 0;
        }
        return static_cast<int>(count);
    }
};

SessionTls::SessionTls() = default;

SessionTls::~SessionTls() = default;

bool SessionTls::begin(const Config &newConfig, SendRecords send)
{
    impl.reset(new Impl());
    impl->owner = this;
    config = newConfig;
    sendRecords = std::move(send);
    decoder.reset();
    verifiedInstallationId.clear();
    pinVerified = false;
    pinRejected = false;
    error = 0;
    state = Status::Idle;

    if (!config.key || config.certificate.empty() || !ReaderIdentity::isCanonicalP256Spki(config.caSpki) ||
        psa_crypto_init() != PSA_SUCCESS)
    {
        fail(MBEDTLS_ERR_SSL_BAD_CONFIG);
        return false;
    }

    mbedtls_ssl_config &conf = impl->conf;
    int result = mbedtls_ssl_config_defaults(&conf, MBEDTLS_SSL_IS_CLIENT, MBEDTLS_SSL_TRANSPORT_STREAM,
                                             MBEDTLS_SSL_PRESET_DEFAULT);
    if (result == 0)
    {
        mbedtls_ssl_conf_min_tls_version(&conf, MBEDTLS_SSL_VERSION_TLS1_3);
        mbedtls_ssl_conf_max_tls_version(&conf, MBEDTLS_SSL_VERSION_TLS1_3);
        mbedtls_ssl_conf_ciphersuites(&conf, CIPHERSUITES);
        mbedtls_ssl_conf_groups(&conf, GROUPS);
        mbedtls_ssl_conf_sig_algs(&conf, SIGNATURE_ALGORITHMS);
        // Full ephemeral handshakes only: no PSK, so no resumption and no 0-RTT.
        mbedtls_ssl_conf_tls13_key_exchange_modes(&conf, MBEDTLS_SSL_TLS1_3_KEY_EXCHANGE_MODE_EPHEMERAL);
#if defined(MBEDTLS_SSL_SESSION_TICKETS)
        mbedtls_ssl_conf_session_tickets(&conf, MBEDTLS_SSL_SESSION_TICKETS_DISABLED);
#endif
        // The chain is not anchored in a CA certificate but in the pinned key: the callback decides,
        // and any failure there aborts the handshake.
        mbedtls_ssl_conf_authmode(&conf, MBEDTLS_SSL_VERIFY_OPTIONAL);
        mbedtls_ssl_conf_verify(&conf, verifyCallback, this);
        result = mbedtls_x509_crt_parse_der(&impl->ownCertificate, config.certificate.data(), config.certificate.size());
    }
    if (result == 0)
    {
        result = mbedtls_pk_wrap_psa(&impl->ownKey, config.key->keyId());
    }
    if (result == 0)
    {
        result = mbedtls_ssl_conf_own_cert(&conf, &impl->ownCertificate, &impl->ownKey);
    }
    if (result == 0)
    {
        result = mbedtls_ssl_setup(&impl->ssl, &conf);
    }
    if (result == 0)
    {
        // The installation ID in the certificate identifies the server, not the host name.
        result = mbedtls_ssl_set_hostname(&impl->ssl, nullptr);
    }
    if (result != 0)
    {
        fail(result);
        return false;
    }
    mbedtls_ssl_set_bio(&impl->ssl, impl.get(), Impl::send, Impl::receive, nullptr);
    state = Status::Handshaking;
    // Sends the ClientHello.
    advance(nullptr);
    return state == Status::Handshaking || state == Status::Open;
}

int SessionTls::verifyServerCertificate(void *certificate, int depth, uint32_t *flags)
{
    auto *crt = static_cast<mbedtls_x509_crt *>(certificate);
    if (depth != 0)
    {
        // Anything above the leaf is irrelevant: only the pinned key can vouch for it.
        *flags = 0;
        return 0;
    }
    std::string installationId;
    const bool trusted =
        SessionCertificates::signedByPinnedKey(crt, config.caSpki) && crt->MBEDTLS_PRIVATE(ca_istrue) == 0 &&
        mbedtls_x509_crt_check_extended_key_usage(crt, MBEDTLS_OID_SERVER_AUTH,
                                                  MBEDTLS_OID_SIZE(MBEDTLS_OID_SERVER_AUTH)) == 0 &&
        SessionCertificates::uriSanValue(crt, SessionCertificates::INSTALLATION_URI_PREFIX, installationId) && !installationId.empty() &&
        (config.installationId.empty() || installationId == config.installationId) &&
        SessionCertificates::notAfterSeconds(crt) > static_cast<int64_t>(config.timeFloorSeconds);
    if (!trusted)
    {
        pinRejected = true;
        // A fatal error (not a verify flag) aborts the handshake even in VERIFY_OPTIONAL mode.
        return MBEDTLS_ERR_X509_FATAL_ERROR;
    }
    verifiedInstallationId = installationId;
    pinVerified = true;
    // Validity against the system clock is replaced by the trusted-time floor check above.
    *flags = 0;
    return 0;
}

SessionTls::Status SessionTls::feed(const uint8_t *data, size_t length,
                                    const SessionFraming::Decoder::FrameCallback &onFrame)
{
    if (state != Status::Handshaking && state != Status::Open)
    {
        return state;
    }
    impl->inbound.insert(impl->inbound.end(), data, data + length);
    return advance(onFrame);
}

SessionTls::Status SessionTls::advance(const SessionFraming::Decoder::FrameCallback &onFrame)
{
    if (state == Status::Handshaking)
    {
        const int result = mbedtls_ssl_handshake(&impl->ssl);
        if (result == MBEDTLS_ERR_SSL_WANT_READ || result == MBEDTLS_ERR_SSL_WANT_WRITE)
        {
            return state;
        }
        if (result != 0)
        {
            fail(result, pinRejected ? Status::Untrusted : Status::Failed);
            return state;
        }
        // Defence in depth: the callback must have run and accepted the leaf.
        if (!pinVerified)
        {
            fail(MBEDTLS_ERR_X509_CERT_VERIFY_FAILED, Status::Untrusted);
            return state;
        }
        state = Status::Open;
    }

    uint8_t chunk[READ_CHUNK_BYTES];
    for (int reads = 0; reads < MAX_READS_PER_FEED && state == Status::Open; reads++)
    {
        const int result = mbedtls_ssl_read(&impl->ssl, chunk, sizeof(chunk));
        if (result > 0)
        {
            if (!onFrame || !decoder.push(chunk, static_cast<size_t>(result), onFrame))
            {
                fail(MBEDTLS_ERR_SSL_DECODE_ERROR);
            }
            continue;
        }
        if (result == MBEDTLS_ERR_SSL_WANT_READ || result == MBEDTLS_ERR_SSL_WANT_WRITE)
        {
            // A consumed post-handshake message (session ticket) also returns WANT_READ: keep
            // reading while received bytes are still waiting.
            if (impl->inbound.size() > impl->inboundOffset || mbedtls_ssl_check_pending(&impl->ssl))
            {
                continue;
            }
            break;
        }
#if defined(MBEDTLS_SSL_SESSION_TICKETS)
        if (result == MBEDTLS_ERR_SSL_RECEIVED_NEW_SESSION_TICKET)
        {
            continue; // never used: the reader does not resume sessions
        }
#endif
        if (result == 0 || result == MBEDTLS_ERR_SSL_PEER_CLOSE_NOTIFY)
        {
            state = Status::Closed;
            break;
        }
        fail(result);
    }
    return state;
}

bool SessionTls::sendFrame(SessionFraming::FrameType type, const uint8_t *payload, size_t length)
{
    if (state != Status::Open)
    {
        return false;
    }
    std::vector<uint8_t> frame;
    if (!SessionFraming::encode(type, payload, length, frame))
    {
        return false;
    }
    size_t offset = 0;
    while (offset < frame.size())
    {
        const int written = mbedtls_ssl_write(&impl->ssl, frame.data() + offset, frame.size() - offset);
        if (written <= 0)
        {
            fail(written);
            return false;
        }
        offset += static_cast<size_t>(written);
    }
    return true;
}

void SessionTls::close()
{
    if (impl && state == Status::Open)
    {
        mbedtls_ssl_close_notify(&impl->ssl);
    }
    impl.reset();
    decoder.reset();
    state = Status::Closed;
}

void SessionTls::fail(int code, Status status)
{
    error = code;
    state = status;
}
