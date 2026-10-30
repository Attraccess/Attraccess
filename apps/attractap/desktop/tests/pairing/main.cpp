// A reader without credentials, end to end through the production ReaderLink, API, Application
// and pending-approval screen. Only the WebSocket and the server's pairing side are simulated.
#include "../reader/server-fixtures.hpp"

#include "api/security/pairing_codec.hpp"
#include "api/security/reader_link.hpp"
#include "api/security/session_framing.hpp"
#include "display/display.hpp"
#include "settings/reader_credentials.hpp"
#include "settings/settings.hpp"

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
    bool sendBinary(const uint8_t *, size_t) override
    {
        binaryFrames++;
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
        ReaderLink link(socket, {false, {"attractap-desktop", "desktop", "test"}});
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

        // Approved: the CA key is pinned and the reader opens the TLS session.
        socket.deliver(R"({"type":"accepted"})");
        pump();
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

        std::cout << "PASS reader pairing journey\n";
    }
    catch (const std::exception &error)
    {
        std::cerr << error.what() << "\n";
        status = 1;
    }
    std::filesystem::remove_all(storage);
    return status;
}
