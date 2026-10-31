// A reader without credentials, end to end through the production ReaderLink, API, Application
// and pending-approval screen. Only the WebSocket and the server's pairing side are simulated.
#include "../reader/server-fixtures.hpp"

#include "api/security/pairing_codec.hpp"
#include "api/security/reader_identity.hpp"
#include "api/security/reader_link.hpp"
#include "api/security/session_framing.hpp"
#include "display/display.hpp"
#include "settings/reader_credentials.hpp"
#include "settings/settings.hpp"
#include "state/state.hpp"

#include "mbedtls/ssl.h"
#include "mbedtls/x509_crt.h"

#include <stdexcept>

namespace
{
// The WebSocket under ReaderLink, with the server's half of attractap-pairing.v1.
class PairingSocket : public IReaderTransport
{
public:
    std::string subprotocol = "unset";
    std::vector<std::string> sentText;
    size_t binaryFrames = 0;
    std::vector<uint8_t> binaryOut;
    std::function<void(const char *, size_t)> receive;
    std::function<void(bool)> connection;
    std::function<bool(const uint8_t *, size_t)> binary;
    bool connected = false;
    int reconnects = 0;

    void setup() override {}
    void loop() override {}
    bool sendMessage(const char *data, size_t size) override
    {
        sentText.emplace_back(data, size);
        return connected;
    }
    bool sendHeartbeat(const char *data, size_t size) override { return sendMessage(data, size); }
    void setMessageCallbackRaw(std::function<void(const char *, size_t)> value) override { receive = std::move(value); }
    void enableConnectionAttempts() override {}
    void disableConnectionAttempts() override { drop(); }
    void forceReconnect(const char *) override
    {
        drop();
        reconnects++;
    }
    void resetCertificateTrust() override {}
    void setSubprotocol(const std::string &value) override { subprotocol = value; }
    bool sendBinary(const uint8_t *data, size_t size) override
    {
        binaryFrames++;
        binaryOut.insert(binaryOut.end(), data, data + size);
        return connected;
    }
    void setRawBinaryCallback(std::function<bool(const uint8_t *, size_t)> value) override { binary = std::move(value); }
    void setConnectionCallback(std::function<void(bool)> value) override { connection = std::move(value); }

    void open()
    {
        connected = true;
        sentText.clear();
        connection(true);
    }
    void drop()
    {
        if (!connected) return;
        connected = false;
        connection(false);
    }
    void deliver(const std::string &text) { receive(text.data(), text.size()); }
    JsonDocument last() const
    {
        JsonDocument doc;
        if (sentText.empty() || deserializeJson(doc, sentText.back())) throw std::runtime_error("no reader message");
        return doc;
    }
};

struct PairingServer
{
    std::unique_ptr<SoftwareReaderKey> ca = SoftwareReaderKey::generate();
    std::vector<uint8_t> readerKey;

    std::string round(int number, const std::vector<uint8_t> &serverNonce, const char *appUrl)
    {
        std::vector<uint8_t> commitment;
        PairingCodec::commitment(ca->publicKeySpki(), readerKey, serverNonce, commitment);
        JsonDocument doc;
        doc["type"] = "round";
        doc["round"] = number;
        doc["serverPublicKey"] = PairingCodec::base64Encode(ca->publicKeySpki());
        doc["commitment"] = PairingCodec::base64Encode(commitment);
        if (appUrl) doc["appUrl"] = appUrl;
        else doc["appUrl"] = nullptr;
        doc["rotatesInSeconds"] = 30;
        doc["expiresInSeconds"] = 600;
        std::string text;
        serializeJson(doc, text);
        return text;
    }

    static std::string reveal(int number, const std::vector<uint8_t> &serverNonce)
    {
        return std::string(R"({"type":"reveal","round":)") + std::to_string(number) + R"(,"serverNonce":")" +
               PairingCodec::base64Encode(serverNonce) + "\"}";
    }
};

void check(bool condition, const char *what)
{
    if (!condition) throw std::runtime_error(std::string("Check failed: ") + what);
}

// The pairing client's clock: rounds must come at the server's pace (30 s).
uint32_t pairingNow = 1000;
uint32_t pairingClock() { return pairingNow; }

// A TLS 1.3 server whose certificate is not signed by the key the reader pinned: whoever answers the
// session is not the installation that approved the reader.
struct ImpostorTlsServer
{
    std::unique_ptr<SoftwareReaderKey> key = SoftwareReaderKey::generate();
    std::vector<uint8_t> certificate;
    mbedtls_ssl_config conf;
    mbedtls_ssl_context ssl;
    mbedtls_x509_crt chain;
    mbedtls_pk_context pk;
    std::vector<uint8_t> in, out;
    size_t inOffset = 0;

    ImpostorTlsServer()
    {
        mbedtls_ssl_config_init(&conf);
        mbedtls_ssl_init(&ssl);
        mbedtls_x509_crt_init(&chain);
        mbedtls_pk_init(&pk);
        check(key && ReaderIdentity::selfSignedCertificate(*key, certificate), "impostor certificate");
        check(mbedtls_ssl_config_defaults(&conf, MBEDTLS_SSL_IS_SERVER, MBEDTLS_SSL_TRANSPORT_STREAM,
                                          MBEDTLS_SSL_PRESET_DEFAULT) == 0, "server config");
        mbedtls_ssl_conf_min_tls_version(&conf, MBEDTLS_SSL_VERSION_TLS1_3);
        mbedtls_ssl_conf_max_tls_version(&conf, MBEDTLS_SSL_VERSION_TLS1_3);
        mbedtls_ssl_conf_authmode(&conf, MBEDTLS_SSL_VERIFY_OPTIONAL);
        check(mbedtls_x509_crt_parse_der(&chain, certificate.data(), certificate.size()) == 0, "parse certificate");
        check(mbedtls_pk_wrap_psa(&pk, key->keyId()) == 0, "wrap key");
        check(mbedtls_ssl_conf_own_cert(&conf, &chain, &pk) == 0, "own certificate");
        check(mbedtls_ssl_setup(&ssl, &conf) == 0, "server setup");
        mbedtls_ssl_set_bio(&ssl, this, send, receive, nullptr);
    }
    ~ImpostorTlsServer()
    {
        mbedtls_ssl_free(&ssl);
        mbedtls_ssl_config_free(&conf);
        mbedtls_x509_crt_free(&chain);
        mbedtls_pk_free(&pk);
    }
    static int send(void *context, const unsigned char *data, size_t length)
    {
        auto *self = static_cast<ImpostorTlsServer *>(context);
        self->out.insert(self->out.end(), data, data + length);
        return static_cast<int>(length);
    }
    static int receive(void *context, unsigned char *data, size_t length)
    {
        auto *self = static_cast<ImpostorTlsServer *>(context);
        const size_t available = self->in.size() - self->inOffset;
        if (available == 0) return MBEDTLS_ERR_SSL_WANT_READ;
        const size_t count = available < length ? available : length;
        std::memcpy(data, self->in.data() + self->inOffset, count);
        self->inOffset += count;
        return static_cast<int>(count);
    }
    // The server's answer to the reader's ClientHello.
    std::vector<uint8_t> answer(const std::vector<uint8_t> &clientHello)
    {
        in = clientHello;
        for (int i = 0; i < 4; i++) mbedtls_ssl_handshake(&ssl);
        std::vector<uint8_t> result;
        result.swap(out);
        return result;
    }
};

// Connects the session channel and lets an impostor answer the handshake. `step` runs the reader.
void untrustedHandshake(PairingSocket &socket, const std::function<void()> &step)
{
    socket.binaryOut.clear();
    socket.open();
    step();
    check(!socket.binaryOut.empty(), "ClientHello sent");
    ImpostorTlsServer impostor;
    const std::vector<uint8_t> reply = impostor.answer(socket.binaryOut);
    check(!reply.empty(), "impostor answered");
    socket.binary(reply.data(), reply.size());
    step();
}

// Completes one pairing round trip and the approval on an open pairing connection.
void approve(PairingSocket &socket, PairingServer &server, const std::function<void()> &step)
{
    const std::vector<uint8_t> ns(16, 0x41);
    socket.deliver(server.round(1, ns, nullptr));
    step();
    socket.deliver(PairingServer::reveal(1, ns));
    step();
    socket.deliver(R"({"type":"accepted"})");
    step();
}

// A token reader an admin asked to pair, whose approval came from someone posing as the server: the
// session never verifies, so after a few attempts it forgets that key and keeps its token.
void tokenReaderFallsBackWhenTheServerNeverVerifies()
{
    Settings::saveAttraccessAuthConfig("token-1", 7);
    PairingSocket socket;
    ReaderLink link(socket, {false, {"attractap-desktop", "desktop", "test"}, pairingClock});
    link.setup();
    const auto step = [&] { for (int i = 0; i < 4; i++) link.loop(); };
    check(link.currentChannel() == ReaderLink::Channel::Legacy, "token reader starts on the token channel");
    link.startPairing("ticket-1");
    step();
    check(link.currentChannel() == ReaderLink::Channel::Pairing, "pairing on request");
    socket.open();
    step();
    JsonDocument hello = socket.last();
    check(hello["ticket"] == "ticket-1", "ticket in hello");
    PairingServer server;
    check(PairingCodec::base64Decode(hello["publicKey"] | "", server.readerKey), "reader key");
    approve(socket, server, step);
    check(link.currentChannel() == ReaderLink::Channel::Session, "session after approval");
    check(Settings::getAttraccessAuthConfig().apiKey == "token-1", "token kept until the grant is verified");

    for (int attempt = 1; attempt < ReaderLink::BOOTSTRAP_UNTRUSTED_LIMIT; attempt++)
    {
        untrustedHandshake(socket, step);
        check(link.serverUntrusted() && link.currentChannel() == ReaderLink::Channel::Session, "retries the session");
    }
    untrustedHandshake(socket, step);
    check(link.currentChannel() == ReaderLink::Channel::Legacy, "back to the token channel");
    check(!CredentialStore::load().paired(), "unconfirmed pin forgotten");
    check(Settings::getAttraccessAuthConfig().apiKey == "token-1", "token still there");
    check(State::getSessionProblem() == State::SESSION_PROBLEM_NONE, "no session error on the token channel");
    std::cout << "PASS token reader keeps its token when the pairing is never confirmed\n";
}
}

int main()
{
    const auto storage = std::filesystem::temp_directory_path() /
                         ("att-pairing-reader-test-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    int status = 0;
    try
    {
        ProfileStore profile("http://reader.test", 0, storage);
        KVStore::setHostProfile(&profile);
        Settings::setup();
        Settings::saveAttraccessApiConfig("reader.test", 80, false);
        Settings::saveAttraccessAuthConfig("", 0);
        Settings::setDevicePin("1234");

        PairingSocket socket;
        ReaderLink link(socket, {false, {"attractap-desktop", "desktop", "test"}, pairingClock});
        API api(link);
        VirtualNfc nfc(profile);
        Application application(nfc, api);
        Framebuffer display;
        Display::setup(display);
        application.setup();
        State::setWifiState(true, {}, "Test");
        State::setWebsocketState(true, "reader.test", 80, false);
        const auto pump = [&](uint32_t duration = 60) {
            const auto end = millis() + duration;
            do
            {
                application.loop();
                lv_timer_handler();
                std::this_thread::sleep_for(std::chrono::milliseconds(5));
            } while (static_cast<int32_t>(end - millis()) > 0);
        };
        pump(2200); // boot screen

        // No credentials: straight to pairing, never the old registration.
        check(link.currentChannel() == ReaderLink::Channel::Pairing, "new reader uses the pairing channel");
        check(socket.subprotocol == SessionFraming::PAIRING_SUBPROTOCOL, "pairing subprotocol");
        socket.open();
        pump();
        JsonDocument hello = socket.last();
        check(hello["type"] == "hello" && hello["kind"] == "touch" && hello["ticket"].isNull(), "hello");
        // Pending from the first moment, before any code (Lite: white breathing, not the init animation).
        check(State::getEnrollmentState().pending && State::getEnrollmentState().stale, "pending without a code");
        pump(200);
        check(lv_screen_active() == Display::pendingApprovalScreen.getScreen(), "pending screen before the first code");
        PairingServer server;
        check(PairingCodec::base64Decode(hello["publicKey"] | "", server.readerKey), "reader key");

        // Round 1 with the app URL: code on screen, QR shown.
        const std::vector<uint8_t> ns1(16, 0x31), ns2(16, 0x32);
        socket.deliver(server.round(1, ns1, "https://attraccess.example"));
        pump();
        std::vector<uint8_t> nr;
        check(socket.last()["type"] == "nonce" && PairingCodec::base64Decode(socket.last()["nonce"] | "", nr), "nonce");
        socket.deliver(PairingServer::reveal(1, ns1));
        pump(200);
        PairingCodec::Derived derived;
        PairingCodec::derive(server.readerKey, server.ca->publicKeySpki(), nr, ns1, derived);
        const std::string code = PairingCodec::displayCode(derived.code);
        check(lv_screen_active() == Display::pendingApprovalScreen.getScreen(), "pending approval screen");
        requireLabel(lv_screen_active(), code.c_str());
        check(Display::pendingApprovalScreen.isQrVisible(), "QR shown with an app URL");
        display.capture("", "pairing");

        // Round 2 without an app URL: the new code, no QR.
        pairingNow += 30000;
        socket.deliver(server.round(2, ns2, nullptr));
        pump();
        check(PairingCodec::base64Decode(socket.last()["nonce"] | "", nr), "nonce 2");
        socket.deliver(PairingServer::reveal(2, ns2));
        pump(200);
        PairingCodec::derive(server.readerKey, server.ca->publicKeySpki(), nr, ns2, derived);
        requireLabel(lv_screen_active(), PairingCodec::displayCode(derived.code).c_str());
        check(!label(lv_screen_active(), code.c_str()), "old code gone");
        check(!Display::pendingApprovalScreen.isQrVisible(), "no QR without an app URL");

        for (const auto &message : socket.sentText)
            check(message.find("READER_REGISTER") == std::string::npos && message.find("HEARTBEAT") == std::string::npos,
                  "nothing of the API leaves an unpaired reader");

        // Approved: the CA key is pinned and the reader opens the TLS session. The pairing connection's
        // "connected" event arrives in the same batch as the approval: it belongs to the old channel and
        // must not start a session handshake.
        socket.deliver(R"({"type":"accepted"})");
        socket.open();
        pump();
        check(socket.binaryFrames == 0, "stale event of the pairing channel ignored");
        check(link.currentChannel() == ReaderLink::Channel::Session, "session channel after approval");
        check(socket.subprotocol == SessionFraming::SESSION_SUBPROTOCOL, "session subprotocol");
        check(CredentialStore::load().caSpki == server.ca->publicKeySpki(), "CA key pinned");
        check(Settings::getAttraccessAuthConfig().apiKey.empty(), "no token");
        socket.open();
        pump();
        check(socket.binaryFrames == 1, "ClientHello sent as one binary frame");
        check(socket.sentText.empty(), "no text on the session channel");

        // A text frame on the session channel is a protocol violation; the pin stays.
        const int reconnects = socket.reconnects;
        socket.deliver(R"({"event":"EVENT"})");
        pump();
        check(socket.reconnects == reconnects + 1, "text frame closes the session");
        check(link.currentChannel() == ReaderLink::Channel::Session, "still paired");
        check(CredentialStore::load().paired(), "pin kept");

        // The server never proves it is the installation that approved us: an error on screen, retries,
        // and since the first session never completed, the reader finally forgets that key (not its
        // own) and asks to be paired again.
        for (int attempt = 1; attempt < ReaderLink::BOOTSTRAP_UNTRUSTED_LIMIT; attempt++)
        {
            untrustedHandshake(socket, [&] { pump(); });
            check(link.serverUntrusted() && link.currentChannel() == ReaderLink::Channel::Session, "untrusted, retrying");
            check(State::getSessionProblem() == State::SESSION_PROBLEM_SERVER_UNTRUSTED, "session problem reported");
            pump(300);
            check(label(lv_screen_active(), "Server could not be verified") ||
                      label(lv_screen_active(), "Server konnte nicht überprüft werden"),
                  "error on the screen");
        }
        untrustedHandshake(socket, [&] { pump(); });
        check(link.currentChannel() == ReaderLink::Channel::Pairing, "unconfirmed pairing abandoned");
        check(!CredentialStore::load().paired(), "pin forgotten");
        socket.open();
        pump();
        check(socket.last()["publicKey"].as<std::string>() == PairingCodec::base64Encode(server.readerKey), "same reader key");

        std::cout << "PASS reader pairing journey\n";

        tokenReaderFallsBackWhenTheServerNeverVerifies();
    }
    catch (const std::exception &error)
    {
        std::cerr << error.what() << "\n";
        status = 1;
    }
    std::filesystem::remove_all(storage);
    return status;
}
