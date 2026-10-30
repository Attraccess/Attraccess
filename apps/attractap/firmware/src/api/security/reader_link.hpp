#pragma once

#include <atomic>
#include <cstdint>
#include <deque>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "../reader_transport.hpp"
#include "../../clock/trusted_time.hpp"
#include "../../logger/logger.hpp"
#include "../../settings/reader_credentials.hpp"
#include "pairing_client.hpp"
#include "reader_identity.hpp"
#include "session_tls.hpp"

// The reader's connection to the server, as the API sees it. It picks one of three channels on
// the same WebSocket path and switches between them:
//  - Session (attractap-session.v1): paired readers. TLS 1.3 inside binary frames, mutually
//    authenticated against the pinned installation CA. A paired reader never leaves it except
//    after an authenticated "session.rejected" (pairing removed), which starts a new identity.
//  - Pairing (attractap-pairing.v1): readers without credentials, and token readers an admin
//    asked to pair. Shows the rotating code until approved.
//  - Legacy (no subprotocol): readers that still sign in with their token. Unchanged, until an
//    admin starts pairing.
// The API's messages and heartbeats travel inside the session; on the pairing channel they are
// dropped. All TLS and pairing work runs on the main loop (loop()); transport callbacks only queue.
class ReaderLink : public IReaderTransport
{
public:
    enum class Channel
    {
        Legacy,
        Pairing,
        Session,
    };

    struct Options
    {
        bool lite = false;
        PairingClient::Firmware firmware;
    };

    // A TLS handshake that takes longer than this is abandoned.
    static constexpr uint32_t HANDSHAKE_TIMEOUT_MS = 20000;
    // After the pinned server could not be verified: wait before trying again.
    static constexpr uint32_t UNTRUSTED_RETRY_MS = 30000;

    ReaderLink(IReaderTransport &socket, Options options);

    void setup() override;
    void loop() override;
    bool sendMessage(const char *message, size_t length) override;
    bool sendHeartbeat(const char *message, size_t length) override;
    void setMessageCallbackRaw(std::function<void(const char *, size_t)> callback) override;
    void enableConnectionAttempts() override;
    void disableConnectionAttempts() override;
    void forceReconnect(const char *reason) override;
    void resetCertificateTrust() override { socket.resetCertificateTrust(); }
#ifdef ESP_PLATFORM
    void setBinaryDataCallback(std::function<void(esp_websocket_event_data_t)> callback) override;
#endif
    void startPairing(const std::string &ticket) override;
    bool authenticatesReader() const override { return channel == Channel::Session; }

    Channel currentChannel() const { return channel.load(); }
    bool sessionOpen() const;
    // The pinned server could not be verified on the last attempt (shown as a connection error).
    bool serverUntrusted() const { return untrusted; }

private:
    enum class EventType
    {
        Connected,
        Disconnected,
        Text,
        Binary,
        StartPairing,
    };
    struct Event
    {
        EventType type;
        std::string data;
        uint32_t generation;
    };

    void post(EventType type, std::string data = "");
    void handle(const Event &event);
    void useChannel(Channel next, const char *reason);
    void reconnectAfter(uint32_t delayMs);
    bool loadIdentity();
    bool newIdentity();

    void onSessionConnected();
    void onSessionBytes(const std::string &bytes);
    void onSessionFrame(SessionFraming::FrameType type, std::string payload);
    void onControl(const std::string &payload);
    void onPairingRemoved(const char *reason);
    bool flushOutbox();

    void onPairingConnected();
    void onPairingText(const std::string &text);
    void onPairingEnded(PairingClient::Outcome outcome);

    IReaderTransport &socket;
    Options options;
    Logger logger;

    // Main-loop state.
    // Read by the transport callbacks to route frames.
    std::atomic<Channel> channel{Channel::Pairing};
    ReaderCredentials credentials;
    std::unique_ptr<SoftwareReaderKey> key;
    std::unique_ptr<PairingClient> pairing;
    std::string pairingTicket;
    // Pairing was started from the token channel: a failure goes back to it.
    bool pairingFromToken = false;
    TimeFloor timeFloor;
    bool connected = false;
    bool untrusted = false;
    bool attemptsEnabled = true;
    uint32_t holdUntilMs = 0;
    bool holding = false;
    uint32_t handshakeStartedMs = 0;
    std::function<void(const char *, size_t)> appMessage;
#ifdef ESP_PLATFORM
    std::function<void(esp_websocket_event_data_t)> appBinary;
#endif

    // Shared with the transport tasks.
    mutable std::mutex eventsMutex;
    std::deque<Event> events;
    uint32_t generation = 0; // bumped on every channel switch; stale events are dropped

    // TLS session, used from the main loop and from API senders.
    mutable std::mutex sessionMutex;
    SessionTls tls;
    std::vector<uint8_t> outbox;
};
