// Session channel of ReaderLink: the TLS 1.3 session and its control messages.
#include "reader_link.hpp"

#include <ArduinoJson.h>
#include <cstring>

#include "../../platform.hpp"
#include "../../settings/settings.hpp"
#include "../../state/state.hpp"
#include "session_certificates.hpp"

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#endif

namespace
{
    // Server time arrives in milliseconds; anything outside 2000..2100 is ignored.
    constexpr double MIN_SERVER_TIME_MS = 946684800000.0;
    constexpr double MAX_SERVER_TIME_MS = 4102444800000.0;

    bool serverSeconds(JsonVariantConst value, uint32_t &seconds)
    {
        if (!value.is<double>())
        {
            return false;
        }
        const double ms = value.as<double>();
        if (!(ms >= MIN_SERVER_TIME_MS && ms < MAX_SERVER_TIME_MS))
        {
            return false;
        }
        seconds = static_cast<uint32_t>(ms / 1000.0);
        return true;
    }
}

// --- session channel -------------------------------------------------------------------------

bool ReaderLink::flushOutbox()
{
    // All records of one operation leave in one binary frame, in order.
    if (outbox.empty())
    {
        return true;
    }
    std::vector<uint8_t> records;
    records.swap(outbox);
    if (socket.sendBinary(records.data(), records.size()))
    {
        return true;
    }
    // A lost record breaks the TLS stream: start over.
    logger.error("Session data could not be sent, reconnecting");
    tls.close();
    socket.forceReconnect("session send failed");
    return false;
}

void ReaderLink::onSessionConnected()
{
    if (!key || !credentials.paired())
    {
        return;
    }
    SessionTls::Config config;
    config.key = key.get();
    config.caSpki = credentials.caSpki;
    config.timeFloorSeconds = timeFloor.seconds();
    if (credentials.hasCertificate())
    {
        config.certificate = credentials.certificate;
        config.installationId = credentials.installationId;
    }
    else if (!ReaderIdentity::selfSignedCertificate(*key, config.certificate))
    {
        logger.error("Could not create the bootstrap certificate");
        return;
    }
    logger.info(credentials.hasCertificate() ? "Opening secure session" : "Opening first secure session");
    handshakeStartedMs = millis() | 1;
    std::lock_guard<std::mutex> lock(sessionMutex);
    tls.begin(config, [this](const uint8_t *data, size_t length) {
        outbox.insert(outbox.end(), data, data + length);
        return true;
    });
    flushOutbox();
}

void ReaderLink::onSessionBytes(const std::string &bytes)
{
    std::vector<std::pair<SessionFraming::FrameType, std::string>> frames;
    SessionTls::Status status;
    bool justOpened = false;
    {
        std::lock_guard<std::mutex> lock(sessionMutex);
        const bool wasHandshaking = tls.status() == SessionTls::Status::Handshaking;
        status = tls.feed(reinterpret_cast<const uint8_t *>(bytes.data()), bytes.size(),
                          [&frames](SessionFraming::FrameType type, const uint8_t *payload, size_t length) {
                              frames.emplace_back(type, std::string(reinterpret_cast<const char *>(payload), length));
                          });
        justOpened = wasHandshaking && status == SessionTls::Status::Open;
        flushOutbox();
    }
    if (justOpened)
    {
        handshakeStartedMs = 0;
        untrusted = false;
#ifdef ESP_PLATFORM
        // The session's internal-heap cost is budgeted (mbedTLS itself allocates in PSRAM).
        logger.infof("Secure session established; heap internal: free=%u min=%u",
                     (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
                     (unsigned)heap_caps_get_minimum_free_size(MALLOC_CAP_INTERNAL));
#else
        logger.info("Secure session established");
#endif
    }

    // Delivered outside the session lock: handlers answer through sendMessage().
    for (auto &frame : frames)
    {
        onSessionFrame(frame.first, std::move(frame.second));
        if (channel != Channel::Session)
        {
            return; // pairing removed while handling a control message
        }
    }

    if (status == SessionTls::Status::Untrusted)
    {
        // Never unpair because of this: it proves nothing about who is on the other end.
        untrusted = true;
        logger.error("Server could not prove it is the paired installation; retrying later");
        handshakeStartedMs = 0;
        reconnectAfter(UNTRUSTED_RETRY_MS);
    }
    else if (status == SessionTls::Status::Failed || status == SessionTls::Status::Closed)
    {
        logger.errorf("Secure session ended (%d)", tls.lastError());
        handshakeStartedMs = 0;
        socket.forceReconnect("session ended");
    }
}

void ReaderLink::onSessionFrame(SessionFraming::FrameType type, std::string payload)
{
    switch (type)
    {
    case SessionFraming::FrameType::CONTROL:
        onControl(payload);
        return;
    case SessionFraming::FrameType::JSON:
        if (appMessage)
        {
            appMessage(payload.data(), payload.size());
        }
        return;
    case SessionFraming::FrameType::BINARY:
#ifdef ESP_PLATFORM
        if (appBinary)
        {
            // OTA chunks: one complete binary message, as the token channel delivers them.
            esp_websocket_event_data_t data = {};
            data.data_ptr = payload.data();
            data.data_len = static_cast<int>(payload.size());
            data.payload_len = static_cast<int>(payload.size());
            data.payload_offset = 0;
            data.op_code = 0x02;
            data.fin = true;
            appBinary(data);
        }
#endif
        return;
    case SessionFraming::FrameType::HEARTBEAT:
    default:
        return;
    }
}

void ReaderLink::onControl(const std::string &payload)
{
    JsonDocument message;
    if (deserializeJson(message, payload) != DeserializationError::Ok)
    {
        socket.forceReconnect("bad control message");
        return;
    }
    const char *type = message["t"] | "";
    const std::string serverInstallation = tls.serverInstallationId();

    uint32_t seconds = 0;
    if (serverSeconds(message["serverTime"], seconds) && timeFloor.raise(seconds))
    {
        CredentialStore::saveTimeFloorSeconds(timeFloor.seconds());
    }

    if (strcmp(type, "session.hello") == 0)
    {
        const char *installation = message["installationId"] | "";
        if (serverInstallation != installation)
        {
            logger.error("Session hello names another installation");
            socket.forceReconnect("installation mismatch");
        }
        return;
    }

    if (strcmp(type, "pairing.complete") == 0)
    {
        // Only the bootstrap session carries the grant.
        if (credentials.hasCertificate())
        {
            return;
        }
        const uint32_t readerId = message["readerId"] | 0U;
        const char *installation = message["installationId"] | "";
        std::vector<uint8_t> certificate;
        if (readerId == 0 || serverInstallation.empty() || serverInstallation != installation ||
            !SessionCertificates::pemToDer(message["certificate"] | "", certificate) ||
            !SessionCertificates::isReaderCertificate(certificate, key->publicKeySpki(), credentials.caSpki, readerId))
        {
            logger.error("Pairing grant is invalid");
            socket.forceReconnect("invalid grant");
            return;
        }
        if (!CredentialStore::saveGrant(readerId, serverInstallation, certificate))
        {
            logger.error("Could not store the reader certificate");
            return;
        }
        credentials.readerId = readerId;
        credentials.installationId = serverInstallation;
        credentials.certificate = certificate;
        State::clearEnrollment();
        logger.infof("Paired as reader %u", static_cast<unsigned>(readerId));
        // The server closes this session; the next one (soon) uses the certificate.
        socket.setSubprotocol(SessionFraming::SESSION_SUBPROTOCOL);
        return;
    }

    if (strcmp(type, "cert.renew") == 0)
    {
        std::vector<uint8_t> certificate;
        if (credentials.hasCertificate() &&
            SessionCertificates::pemToDer(message["certificate"] | "", certificate) &&
            SessionCertificates::isReaderCertificate(certificate, key->publicKeySpki(), credentials.caSpki,
                                                     credentials.readerId) &&
            CredentialStore::saveCertificate(certificate))
        {
            credentials.certificate = certificate;
            logger.info("Reader certificate renewed");
        }
        else
        {
            logger.error("Certificate renewal rejected");
        }
        return;
    }

    if (strcmp(type, "session.rejected") == 0)
    {
        onPairingRemoved(message["reason"] | "unknown");
        return;
    }
}

void ReaderLink::onPairingRemoved(const char *reason)
{
    // Inside the TLS session with the pinned server: authenticated. The admin removed the
    // pairing (or it never completed): start over with a new key.
    logger.errorf("Server ended the pairing (%s); requesting a new one", reason);
    State::setPairingRemoved();
    Settings::clearAttraccessAuthConfig();
    newIdentity();
    pairingTicket.clear();
    pairingFromToken = false;
    useChannel(Channel::Pairing, "pairing removed");
}

