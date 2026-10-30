// Host tests for the reader's pairing and session security code. The derivation vectors are
// the same file the API's jest test (pairing-protocol.spec.ts) runs.
#include <ArduinoJson.h>

#include <cassert>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <functional>
#include <sstream>
#include <string>
#include <vector>

#include "api/security/pairing_client.hpp"
#include "api/security/pairing_codec.hpp"
#include "api/security/reader_identity.hpp"
#include "api/security/session_certificates.hpp"
#include "api/security/session_framing.hpp"
#include "api/security/session_tls.hpp"
#include "clock/trusted_time.hpp"
#include "fakes.hpp"
#include "mbedtls/oid.h"
#include "mbedtls/pk.h"
#include "mbedtls/ssl.h"
#include "mbedtls/x509_crt.h"

using Bytes = std::vector<uint8_t>;

namespace
{
int failures = 0;

#define CHECK(condition)                                                                   \
    do                                                                                     \
    {                                                                                      \
        if (!(condition))                                                                  \
        {                                                                                  \
            std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #condition); \
            failures++;                                                                    \
        }                                                                                  \
    } while (0)

Bytes bytes(const char *base64)
{
    Bytes out;
    CHECK(PairingCodec::base64Decode(base64, out));
    return out;
}

// --- shared vectors ---------------------------------------------------------------------------

void testVectors()
{
    std::ifstream file(PAIRING_VECTORS);
    std::stringstream text;
    text << file.rdbuf();
    JsonDocument doc;
    CHECK(deserializeJson(doc, text.str()) == DeserializationError::Ok);
    JsonArrayConst vectors = doc["vectors"].as<JsonArrayConst>();
    CHECK(vectors.size() >= 4);
    for (JsonObjectConst v : vectors)
    {
        const Bytes pr = bytes(v["readerPublicKey"]);
        const Bytes ps = bytes(v["serverPublicKey"]);
        const Bytes nr = bytes(v["readerNonce"]);
        const Bytes ns = bytes(v["serverNonce"]);
        PairingCodec::Derived derived;
        CHECK(PairingCodec::derive(pr, ps, nr, ns, derived));
        CHECK(derived.code == v["code"].as<std::string>());
        JsonArrayConst pattern = v["pattern"].as<JsonArrayConst>();
        CHECK(pattern.size() == PairingCodec::PATTERN_LENGTH);
        for (size_t i = 0; i < pattern.size(); i++)
        {
            CHECK(std::string(PairingCodec::COLOUR_NAMES[derived.pattern[i]]) == pattern[i].as<std::string>());
        }
        Bytes cs;
        CHECK(PairingCodec::commitment(ps, pr, ns, cs));
        CHECK(PairingCodec::base64Encode(cs) == v["commitment"].as<std::string>());
        CHECK(PairingCodec::commitmentMatches(cs, ps, pr, ns));
        CHECK(!PairingCodec::commitmentMatches(cs, pr, ps, ns));
        Bytes tampered = ns;
        tampered[0] ^= 1;
        CHECK(!PairingCodec::commitmentMatches(cs, ps, pr, tampered));
    }
    CHECK(PairingCodec::displayCode("K7P3XQ") == "K7P-3XQ");
}

// --- pairing protocol -------------------------------------------------------------------------

struct FakeServer
{
    Bytes ps;
    Bytes pr;
    Bytes ns;
    std::vector<std::string> sent;

    std::string round(int round, const Bytes &serverNonce, const char *appUrl = "https://attraccess.example")
    {
        ns = serverNonce;
        Bytes cs;
        PairingCodec::commitment(ps, pr, ns, cs);
        JsonDocument doc;
        doc["type"] = "round";
        doc["round"] = round;
        doc["serverPublicKey"] = PairingCodec::base64Encode(ps);
        doc["commitment"] = PairingCodec::base64Encode(cs);
        if (appUrl) doc["appUrl"] = appUrl;
        else doc["appUrl"] = nullptr;
        doc["rotatesInSeconds"] = 30;
        doc["expiresInSeconds"] = 600;
        std::string text;
        serializeJson(doc, text);
        return text;
    }

    std::string reveal(int round, const Bytes &serverNonce)
    {
        JsonDocument doc;
        doc["type"] = "reveal";
        doc["round"] = round;
        doc["serverNonce"] = PairingCodec::base64Encode(serverNonce);
        std::string text;
        serializeJson(doc, text);
        return text;
    }

    JsonDocument last()
    {
        JsonDocument doc;
        deserializeJson(doc, sent.back());
        return doc;
    }
};

PairingClient::Outcome deliver(PairingClient &client, const std::string &text)
{
    return client.onMessage(text.data(), text.size());
}

void testPairingProtocol()
{
    auto readerKey = SoftwareReaderKey::generate();
    auto caKey = SoftwareReaderKey::generate();
    CHECK(readerKey && caKey);
    CHECK(ReaderIdentity::isCanonicalP256Spki(readerKey->publicKeySpki()));
    FakeServer server{caKey->publicKeySpki(), readerKey->publicKeySpki(), {}, {}};
    const Bytes ns1(16, 0x11), ns2(16, 0x22);

    // Touch reader with a binding ticket: full round trip.
    {
        fakeEnrollment = FakeEnrollment();
        PairingClient client(*readerKey, false, {"attractap_touch_v2", "wifi", "2.0.0"});
        client.start("ticket-1", [&](const std::string &m) { server.sent.push_back(m); return true; });
        JsonDocument hello = server.last();
        CHECK(hello["type"] == "hello");
        CHECK(hello["v"] == 1);
        CHECK(hello["kind"] == "touch");
        CHECK(hello["ticket"] == "ticket-1");
        CHECK(hello["firmware"]["variant"] == "wifi");
        CHECK(hello["publicKey"].as<std::string>() == PairingCodec::base64Encode(readerKey->publicKeySpki()));

        CHECK(deliver(client, server.round(1, ns1)) == PairingClient::Outcome::None);
        JsonDocument nonce = server.last();
        CHECK(nonce["type"] == "nonce");
        CHECK(nonce["round"] == 1);
        const Bytes nr = bytes(nonce["nonce"]);
        CHECK(nr.size() == 16);
        CHECK(deliver(client, server.reveal(1, ns1)) == PairingClient::Outcome::None);
        PairingCodec::Derived expected;
        PairingCodec::derive(server.pr, server.ps, nr, ns1, expected);
        CHECK(client.currentCode() == expected.code);
        CHECK(fakeEnrollment.code == PairingCodec::displayCode(expected.code));
        CHECK(fakeEnrollment.appUrl == "https://attraccess.example");
        CHECK(!fakeEnrollment.hasPattern);
        CHECK(fakeEnrollment.rotatesInMs <= 30000 && fakeEnrollment.rotatesInMs > 29000);
        CHECK(fakeEnrollment.expiresInMs > 599000);

        // Rotation: a new round with a new nonce gives a new code.
        CHECK(deliver(client, server.round(2, ns2, nullptr)) == PairingClient::Outcome::None);
        const Bytes nr2 = bytes(server.last()["nonce"]);
        CHECK(nr2 != nr);
        CHECK(deliver(client, server.reveal(2, ns2)) == PairingClient::Outcome::None);
        CHECK(fakeEnrollment.rounds == 2);
        CHECK(fakeEnrollment.appUrl.empty());

        CHECK(deliver(client, R"({"type":"accepted"})") == PairingClient::Outcome::Accepted);
        CHECK(client.serverPublicKey() == caKey->publicKeySpki());
        CHECK(fakeEnrollment.outcome == 1);
    }

    // Lite reader: the pattern goes to State; no ticket in hello.
    {
        fakeEnrollment = FakeEnrollment();
        PairingClient client(*readerKey, true, {"attractap_lite", "ethernet", "2.0.0"});
        client.start("", [&](const std::string &m) { server.sent.push_back(m); return true; });
        CHECK(server.last()["kind"] == "lite");
        CHECK(server.last()["ticket"].isNull());
        CHECK(fakeEnrollment.lite);
        deliver(client, server.round(1, ns1));
        const Bytes nr = bytes(server.last()["nonce"]);
        deliver(client, server.reveal(1, ns1));
        PairingCodec::Derived expected;
        PairingCodec::derive(server.pr, server.ps, nr, ns1, expected);
        CHECK(fakeEnrollment.hasPattern);
        CHECK(memcmp(fakeEnrollment.pattern, expected.pattern, 8) == 0);
    }

    // The revealed nonce does not match the commitment: abort, new request.
    {
        PairingClient client(*readerKey, false, {"n", "v", "1"});
        client.start("", [&](const std::string &m) { server.sent.push_back(m); return true; });
        deliver(client, server.round(1, ns1));
        CHECK(deliver(client, server.reveal(1, ns2)) == PairingClient::Outcome::Retry);
        CHECK(client.failureReason() == "commitment");
        CHECK(client.currentCode().empty());
    }

    // The server key changes between rounds.
    {
        auto otherKey = SoftwareReaderKey::generate();
        PairingClient client(*readerKey, false, {"n", "v", "1"});
        client.start("", [&](const std::string &m) { server.sent.push_back(m); return true; });
        deliver(client, server.round(1, ns1));
        FakeServer impostor{otherKey->publicKeySpki(), readerKey->publicKeySpki(), {}, {}};
        CHECK(deliver(client, impostor.round(2, ns2)) == PairingClient::Outcome::Retry);
        CHECK(client.failureReason() == "server-key-changed");
    }

    // Server refusals back off; expiry starts over quickly; garbage is a protocol error.
    {
        PairingClient client(*readerKey, false, {"n", "v", "1"});
        const auto start = [&] { client.start("", [&](const std::string &m) { server.sent.push_back(m); return true; }); };
        start();
        CHECK(deliver(client, R"({"type":"failed","reason":"busy"})") == PairingClient::Outcome::Retry);
        CHECK(client.retryDelayMs() == PairingClient::RETRY_AFTER_LIMIT_MS);
        start();
        CHECK(deliver(client, R"({"type":"failed","reason":"rate-limited"})") == PairingClient::Outcome::Retry);
        CHECK(client.retryDelayMs() == PairingClient::RETRY_AFTER_LIMIT_MS);
        start();
        CHECK(deliver(client, R"({"type":"failed","reason":"expired"})") == PairingClient::Outcome::Retry);
        CHECK(client.retryDelayMs() == PairingClient::RETRY_AFTER_EXPIRY_MS);
        start();
        CHECK(deliver(client, "not json") == PairingClient::Outcome::Retry);
        start();
        CHECK(deliver(client, server.reveal(5, ns1)) == PairingClient::Outcome::Retry); // reveal without round
        start();
        CHECK(deliver(client, R"({"type":"accepted"})") == PairingClient::Outcome::Retry); // accepted before any round
        start();
        fakeEnrollment.disconnected = 0;
        CHECK(client.onDisconnected() == PairingClient::Outcome::Retry);
        CHECK(fakeEnrollment.disconnected == 1);
        CHECK(client.onDisconnected() == PairingClient::Outcome::None);
    }
}

// --- framing ----------------------------------------------------------------------------------

void testFraming()
{
    using SessionFraming::FrameType;
    Bytes a, b;
    const std::string json = R"({"event":"EVENT"})";
    CHECK(SessionFraming::encode(FrameType::JSON, reinterpret_cast<const uint8_t *>(json.data()), json.size(), a));
    CHECK(SessionFraming::encode(FrameType::HEARTBEAT, nullptr, 0, b));
    a.insert(a.end(), b.begin(), b.end());
    SessionFraming::Decoder decoder;
    std::vector<std::pair<FrameType, std::string>> frames;
    const auto collect = [&](FrameType type, const uint8_t *payload, size_t length) {
        frames.emplace_back(type, std::string(reinterpret_cast<const char *>(payload), length));
    };
    for (uint8_t byte : a) CHECK(decoder.push(&byte, 1, collect)); // one byte at a time
    CHECK(frames.size() == 2);
    CHECK(frames[0].first == FrameType::JSON && frames[0].second == json);
    CHECK(frames[1].first == FrameType::HEARTBEAT && frames[1].second.empty());

    const uint8_t unknown[] = {9, 0, 0, 0, 0};
    CHECK(!decoder.push(unknown, sizeof(unknown), collect));
    SessionFraming::Decoder fresh;
    const uint8_t oversized[] = {1, 0, 1, 0, 1}; // 64 KiB + 1
    CHECK(!fresh.push(oversized, sizeof(oversized), collect));
    Bytes tooBig(SessionFraming::MAX_MESSAGE_BYTES + 1);
    Bytes out;
    CHECK(!SessionFraming::encode(FrameType::BINARY, tooBig.data(), tooBig.size(), out));
}

// --- TLS session against an in-process TLS 1.3 server -------------------------------------------

struct Certificate
{
    Bytes der;
};

Bytes writeCertificate(const IReaderKey &subject, const IReaderKey &issuer, const char *subjectName,
                       const char *issuerName, bool ca, const char *uri, const char *eku, size_t ekuLength,
                       const char *notBefore = "20250101000000", const char *notAfter = "20450101000000")
{
    mbedtls_pk_context subjectPk, issuerPk;
    mbedtls_pk_init(&subjectPk);
    mbedtls_pk_init(&issuerPk);
    CHECK(mbedtls_pk_wrap_psa(&subjectPk, subject.keyId()) == 0);
    CHECK(mbedtls_pk_wrap_psa(&issuerPk, issuer.keyId()) == 0);
    mbedtls_x509write_cert writer;
    mbedtls_x509write_crt_init(&writer);
    mbedtls_x509write_crt_set_version(&writer, MBEDTLS_X509_CRT_VERSION_3);
    mbedtls_x509write_crt_set_md_alg(&writer, MBEDTLS_MD_SHA256);
    mbedtls_x509write_crt_set_subject_key(&writer, &subjectPk);
    mbedtls_x509write_crt_set_issuer_key(&writer, &issuerPk);
    CHECK(mbedtls_x509write_crt_set_subject_name(&writer, subjectName) == 0);
    CHECK(mbedtls_x509write_crt_set_issuer_name(&writer, issuerName) == 0);
    const uint8_t serial[] = {0x42};
    CHECK(mbedtls_x509write_crt_set_serial_raw(&writer, serial, sizeof(serial)) == 0);
    CHECK(mbedtls_x509write_crt_set_validity(&writer, notBefore, notAfter) == 0);
    CHECK(mbedtls_x509write_crt_set_basic_constraints(&writer, ca ? 1 : 0, ca ? 0 : -1) == 0);
    mbedtls_x509_san_list san{};
    mbedtls_asn1_sequence usage{};
    if (uri)
    {
        san.node.type = MBEDTLS_X509_SAN_UNIFORM_RESOURCE_IDENTIFIER;
        san.node.san.unstructured_name.p = reinterpret_cast<unsigned char *>(const_cast<char *>(uri));
        san.node.san.unstructured_name.len = strlen(uri);
        CHECK(mbedtls_x509write_crt_set_subject_alternative_name(&writer, &san) == 0);
    }
    if (eku)
    {
        usage.buf.tag = MBEDTLS_ASN1_OID;
        usage.buf.p = reinterpret_cast<unsigned char *>(const_cast<char *>(eku));
        usage.buf.len = ekuLength;
        CHECK(mbedtls_x509write_crt_set_ext_key_usage(&writer, &usage) == 0);
    }
    Bytes buffer(2048);
    const int written = mbedtls_x509write_crt_der(&writer, buffer.data(), buffer.size());
    CHECK(written > 0);
    mbedtls_x509write_crt_free(&writer);
    mbedtls_pk_free(&subjectPk);
    mbedtls_pk_free(&issuerPk);
    return Bytes(buffer.end() - written, buffer.end());
}

// Minimal TLS 1.3 server configured like session-connection.ts.
struct TestServer
{
    mbedtls_ssl_config conf;
    mbedtls_ssl_context ssl;
    mbedtls_x509_crt chain;
    mbedtls_pk_context key;
    Bytes toClient;
    Bytes fromClient;
    size_t fromClientOffset = 0;
    bool done = false;
    int handshakeResult = 0;

    TestServer(const IReaderKey &serverKey, const Bytes &serverCertificate)
    {
        static const int suites[] = {MBEDTLS_TLS1_3_AES_128_GCM_SHA256, MBEDTLS_TLS1_3_AES_256_GCM_SHA384, 0};
        mbedtls_ssl_config_init(&conf);
        mbedtls_ssl_init(&ssl);
        mbedtls_x509_crt_init(&chain);
        mbedtls_pk_init(&key);
        CHECK(mbedtls_ssl_config_defaults(&conf, MBEDTLS_SSL_IS_SERVER, MBEDTLS_SSL_TRANSPORT_STREAM,
                                          MBEDTLS_SSL_PRESET_DEFAULT) == 0);
        mbedtls_ssl_conf_min_tls_version(&conf, MBEDTLS_SSL_VERSION_TLS1_3);
        mbedtls_ssl_conf_max_tls_version(&conf, MBEDTLS_SSL_VERSION_TLS1_3);
        mbedtls_ssl_conf_ciphersuites(&conf, suites);
        mbedtls_ssl_conf_authmode(&conf, MBEDTLS_SSL_VERIFY_OPTIONAL); // the server's authorizer decides
        CHECK(mbedtls_x509_crt_parse_der(&chain, serverCertificate.data(), serverCertificate.size()) == 0);
        CHECK(mbedtls_pk_wrap_psa(&key, serverKey.keyId()) == 0);
        CHECK(mbedtls_ssl_conf_own_cert(&conf, &chain, &key) == 0);
        CHECK(mbedtls_ssl_setup(&ssl, &conf) == 0);
        mbedtls_ssl_set_bio(&ssl, this, send, receive, nullptr);
    }

    ~TestServer()
    {
        mbedtls_ssl_free(&ssl);
        mbedtls_ssl_config_free(&conf);
        mbedtls_x509_crt_free(&chain);
        mbedtls_pk_free(&key);
    }

    static int send(void *context, const unsigned char *data, size_t length)
    {
        auto *self = static_cast<TestServer *>(context);
        self->toClient.insert(self->toClient.end(), data, data + length);
        return static_cast<int>(length);
    }

    static int receive(void *context, unsigned char *data, size_t length)
    {
        auto *self = static_cast<TestServer *>(context);
        const size_t available = self->fromClient.size() - self->fromClientOffset;
        if (available == 0) return MBEDTLS_ERR_SSL_WANT_READ;
        const size_t count = available < length ? available : length;
        memcpy(data, self->fromClient.data() + self->fromClientOffset, count);
        self->fromClientOffset += count;
        return static_cast<int>(count);
    }

    void step()
    {
        if (done) return;
        const int result = mbedtls_ssl_handshake(&ssl);
        if (result == 0 || (result != MBEDTLS_ERR_SSL_WANT_READ && result != MBEDTLS_ERR_SSL_WANT_WRITE))
        {
            done = true;
            handshakeResult = result;
        }
    }

    std::string read()
    {
        unsigned char buffer[4096];
        std::string out;
        for (;;)
        {
            const int result = mbedtls_ssl_read(&ssl, buffer, sizeof(buffer));
            if (result <= 0) break;
            out.append(reinterpret_cast<char *>(buffer), result);
        }
        return out;
    }
};

struct SessionPki
{
    std::unique_ptr<SoftwareReaderKey> caKey = SoftwareReaderKey::generate();
    std::unique_ptr<SoftwareReaderKey> serverKey = SoftwareReaderKey::generate();
    std::unique_ptr<SoftwareReaderKey> readerKey = SoftwareReaderKey::generate();
    Bytes serverCertificate;
    Bytes readerCertificate;

    explicit SessionPki(const char *installationUri = "urn:attraccess:installation:inst-1",
                        const char *notAfter = "20450101000000")
    {
        serverCertificate = writeCertificate(*serverKey, *caKey, "CN=server", "CN=Attractap CA", false, installationUri,
                                             MBEDTLS_OID_SERVER_AUTH, MBEDTLS_OID_SIZE(MBEDTLS_OID_SERVER_AUTH),
                                             "20250101000000", notAfter);
        readerCertificate = writeCertificate(*readerKey, *caKey, "CN=reader", "CN=Attractap CA", false,
                                             "urn:attraccess:reader:7", MBEDTLS_OID_CLIENT_AUTH,
                                             MBEDTLS_OID_SIZE(MBEDTLS_OID_CLIENT_AUTH));
    }
};

// Pumps bytes between the client and the server until neither makes progress.
SessionTls::Status handshake(SessionTls &client, TestServer &server, const SessionTls::Config &config,
                             std::vector<std::string> *received = nullptr)
{
    // Client records go straight to the server's input; the client keeps this sink for later frames.
    CHECK(client.begin(config, [&server](const uint8_t *data, size_t length) {
        server.fromClient.insert(server.fromClient.end(), data, data + length);
        return true;
    }) || client.status() != SessionTls::Status::Handshaking);
    const auto onFrame = [&](SessionFraming::FrameType, const uint8_t *payload, size_t length) {
        if (received) received->emplace_back(reinterpret_cast<const char *>(payload), length);
    };
    for (int i = 0; i < 50; i++)
    {
        const size_t pendingForServer = server.fromClient.size() - server.fromClientOffset;
        server.step();
        const bool serverSent = !server.toClient.empty();
        if (serverSent)
        {
            Bytes chunk;
            chunk.swap(server.toClient);
            client.feed(chunk.data(), chunk.size(), onFrame);
        }
        if (!serverSent && pendingForServer == 0 &&
            (server.done || client.status() != SessionTls::Status::Handshaking))
        {
            break;
        }
    }
    return client.status();
}

void testSessionTls()
{
    // Pinned CA, matching installation: open, AES-128-GCM, frames both ways.
    {
        SessionPki pki;
        TestServer server(*pki.serverKey, pki.serverCertificate);
        SessionTls client;
        SessionTls::Config config{pki.readerKey.get(), pki.readerCertificate, pki.caKey->publicKeySpki(), "inst-1",
                                  TimeFloor::FIRMWARE_FLOOR_SECONDS};
        std::vector<std::string> received;
        CHECK(handshake(client, server, config, &received) == SessionTls::Status::Open);
        CHECK(server.handshakeResult == 0);
        CHECK(std::string(mbedtls_ssl_get_version(&server.ssl)) == "TLSv1.3");
        CHECK(std::string(mbedtls_ssl_get_ciphersuite(&server.ssl)) == "TLS1-3-AES-128-GCM-SHA256");
        CHECK(client.serverInstallationId() == "inst-1");
        CHECK(mbedtls_ssl_get_peer_cert(&server.ssl) != nullptr); // mutual authentication

        const std::string hello = R"({"event":"HEARTBEAT"})";
        CHECK(client.sendFrame(SessionFraming::FrameType::JSON, reinterpret_cast<const uint8_t *>(hello.data()), hello.size()));
        // (The handshake pump left the client's Finished in fromClient; the frame follows it.)
        const std::string plain = server.read();
        CHECK(plain.size() == SessionFraming::HEADER_BYTES + hello.size());
        CHECK(plain.substr(SessionFraming::HEADER_BYTES) == hello);

        Bytes frame;
        const std::string control = R"({"t":"session.hello"})";
        SessionFraming::encode(SessionFraming::FrameType::CONTROL, reinterpret_cast<const uint8_t *>(control.data()),
                               control.size(), frame);
        CHECK(mbedtls_ssl_write(&server.ssl, frame.data(), frame.size()) == static_cast<int>(frame.size()));
        Bytes chunk;
        chunk.swap(server.toClient);
        client.feed(chunk.data(), chunk.size(), [&](SessionFraming::FrameType type, const uint8_t *payload, size_t length) {
            CHECK(type == SessionFraming::FrameType::CONTROL);
            received.emplace_back(reinterpret_cast<const char *>(payload), length);
        });
        CHECK(!received.empty() && received.back() == control);
    }

    // Bootstrap: no installation known yet, learned from the verified certificate.
    {
        SessionPki pki;
        TestServer server(*pki.serverKey, pki.serverCertificate);
        SessionTls client;
        Bytes selfSigned;
        CHECK(ReaderIdentity::selfSignedCertificate(*pki.readerKey, selfSigned));
        SessionTls::Config config{pki.readerKey.get(), selfSigned, pki.caKey->publicKeySpki(), "", 0};
        CHECK(handshake(client, server, config) == SessionTls::Status::Open);
        CHECK(client.serverInstallationId() == "inst-1");
    }

    // Another installation's server, a server not signed by the pinned key, a certificate that
    // expired before the trusted-time floor: never trusted.
    {
        SessionPki pki("urn:attraccess:installation:other");
        TestServer server(*pki.serverKey, pki.serverCertificate);
        SessionTls client;
        SessionTls::Config config{pki.readerKey.get(), pki.readerCertificate, pki.caKey->publicKeySpki(), "inst-1", 0};
        CHECK(handshake(client, server, config) == SessionTls::Status::Untrusted);
    }
    {
        SessionPki pki;
        auto otherCa = SoftwareReaderKey::generate();
        TestServer server(*pki.serverKey, pki.serverCertificate);
        SessionTls client;
        SessionTls::Config config{pki.readerKey.get(), pki.readerCertificate, otherCa->publicKeySpki(), "inst-1", 0};
        CHECK(handshake(client, server, config) == SessionTls::Status::Untrusted);
    }
    {
        SessionPki pki("urn:attraccess:installation:inst-1", "20260101000000");
        TestServer server(*pki.serverKey, pki.serverCertificate);
        SessionTls client;
        SessionTls::Config config{pki.readerKey.get(), pki.readerCertificate, pki.caKey->publicKeySpki(), "inst-1",
                                  TimeFloor::FIRMWARE_FLOOR_SECONDS};
        CHECK(handshake(client, server, config) == SessionTls::Status::Untrusted);
    }

    // Issued reader certificates are checked before they are stored.
    {
        SessionPki pki;
        CHECK(SessionCertificates::isReaderCertificate(pki.readerCertificate, pki.readerKey->publicKeySpki(),
                                                       pki.caKey->publicKeySpki(), 7));
        CHECK(!SessionCertificates::isReaderCertificate(pki.readerCertificate, pki.readerKey->publicKeySpki(),
                                                        pki.caKey->publicKeySpki(), 8));
        CHECK(!SessionCertificates::isReaderCertificate(pki.readerCertificate, pki.serverKey->publicKeySpki(),
                                                        pki.caKey->publicKeySpki(), 7));
        CHECK(!SessionCertificates::isReaderCertificate(pki.readerCertificate, pki.readerKey->publicKeySpki(),
                                                        pki.serverKey->publicKeySpki(), 7));
        const std::string pem = "-----BEGIN CERTIFICATE-----\n" + PairingCodec::base64Encode(pki.readerCertificate) +
                                "\n-----END CERTIFICATE-----\n";
        Bytes der;
        CHECK(SessionCertificates::pemToDer(pem, der) && der == pki.readerCertificate);
    }
}

void testIdentity()
{
    auto key = SoftwareReaderKey::generate();
    Bytes scalar;
    CHECK(key->exportPrivateKey(scalar) && scalar.size() == 32);
    auto restored = SoftwareReaderKey::fromPrivateKey(scalar.data(), scalar.size());
    CHECK(restored && restored->publicKeySpki() == key->publicKeySpki());
    CHECK(!SoftwareReaderKey::fromPrivateKey(scalar.data(), 31));
    auto other = SoftwareReaderKey::generate();
    CHECK(other->publicKeySpki() != key->publicKeySpki());
}

void testTimeFloor()
{
    TimeFloor floor(0);
    CHECK(floor.seconds() == TimeFloor::FIRMWARE_FLOOR_SECONDS);
    CHECK(!floor.raise(TimeFloor::FIRMWARE_FLOOR_SECONDS - 100)); // earlier time ignored
    CHECK(floor.seconds() == TimeFloor::FIRMWARE_FLOOR_SECONDS);
    CHECK(floor.raise(TimeFloor::FIRMWARE_FLOOR_SECONDS + 2 * TimeFloor::PERSIST_STEP_SECONDS));
    CHECK(!floor.raise(floor.seconds() + 60)); // risen but not worth an NVS write
    CHECK(floor.seconds() == TimeFloor::FIRMWARE_FLOOR_SECONDS + 2 * TimeFloor::PERSIST_STEP_SECONDS + 60);
    TimeFloor stored(TimeFloor::FIRMWARE_FLOOR_SECONDS + 5);
    CHECK(stored.seconds() == TimeFloor::FIRMWARE_FLOOR_SECONDS + 5);
}
}

int main()
{
    testVectors();
    testPairingProtocol();
    testFraming();
    testIdentity();
    testSessionTls();
    testTimeFloor();
    if (failures)
    {
        std::fprintf(stderr, "%d check(s) failed\n", failures);
        return 1;
    }
    std::puts("pairing host tests passed");
    return 0;
}
