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
#include "reader_key_store.hpp"
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
        // Clock of the pairing client (tests); null means millis().
        PairingClient::Clock pairingClock = nullptr;
    };

    // A TLS handshake that takes longer than this is abandoned.
    static constexpr uint32_t HANDSHAKE_TIMEOUT_MS = 20000;
    // After the pinned server could not be verified: wait before trying again.
    static constexpr uint32_t UNTRUSTED_RETRY_MS = 30000;
    // A reader whose first (bootstrap) session never came up: after this many consecutive
    // unverifiable servers it forgets the pinned key (not its own) and asks again (token or pairing).
    // A reader with a certificate never does this.
    static constexpr int BOOTSTRAP_UNTRUSTED_LIMIT = 3;
    // Consecutive failed handshakes (timeouts, errors, text frames) before the screen shows an error.
    static constexpr int HANDSHAKE_FAILURES_BEFORE_ERROR = 2;
    // Session worker (device only): stack in PSRAM, below the LVGL and WebSocket tasks.
    static constexpr uint32_t SESSION_WORKER_STACK = 16384;
    static constexpr unsigned SESSION_WORKER_PRIORITY = 2;

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
    // Lock-free: the main loop never waits for the TLS worker to learn this.
    bool sessionOpen() const { return sessionReady.load(); }
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
        // Results of session work: one decrypted frame, then the session status after the work.
        SessionFrame,
        SessionStatus,
    };
    struct Event
    {
        EventType type;
        std::string data;
        uint32_t generation;
        int code = 0;        // SessionFrame: frame type; SessionStatus: SessionTls::Status
        bool opened = false; // SessionStatus: the handshake completed during this work
        bool sendFailed = false;
        uint32_t epoch = 0;  // SessionStatus: the connection the result belongs to
    };

    // TLS work that needs a deep stack (key exchange, signatures). On the device it runs on a
    // worker task whose stack lives in PSRAM, so the main loop's internal stack is not at risk.
    struct SessionWork
    {
        bool begin = false;
        bool bootstrap = false; // begin: create the self-signed certificate first
        SessionTls::Config config;
        std::string bytes; // feed
        uint32_t generation = 0;
        uint32_t epoch = 0; // the connection this work belongs to
    };

    void post(EventType type, std::string data = "");
    void post(Event event);
    void submitSessionWork(SessionWork work);
    void runSessionWork(const SessionWork &work);
    void onSessionStatus(const Event &event);
#ifdef ESP_PLATFORM
    static void sessionWorkerEntry(void *argument);
    void sessionWorkerLoop();
    void *sessionWorker = nullptr; // TaskHandle_t
    std::mutex workMutex;
    std::deque<SessionWork> work;
#endif
    void handle(Event &event);
    uint32_t liveGeneration() const;
    void useChannel(Channel next, const char *reason);
    void reconnectAfter(uint32_t delayMs);
    bool loadIdentity();
    bool newIdentity();

    void onSessionConnected();
    // A handshake did not complete (not an unverifiable server): shown after a few in a row.
    void onHandshakeFailed();
    // The bootstrap session never reached a server we could verify: forget the pin, ask again.
    void abandonBootstrap();
    // Caller holds sessionMutex.
    void closeSessionLocked();
    void onSessionFrame(SessionFraming::FrameType type, std::string payload);
    void onControl(const std::string &payload);
    void onPairingRemoved(const char *reason);
    // Sends the queued TLS records as one binary frame. Caller holds sessionMutex.
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
    SoftwareReaderKeyStore keyStore;
    std::unique_ptr<IReaderKey> key;
    std::unique_ptr<PairingClient> pairing;
    std::string pairingTicket;
    // Pairing was started from the token channel: a failure goes back to it.
    bool pairingFromToken = false;
    TimeFloor timeFloor;
    bool connected = false;
    bool untrusted = false;
    int bootstrapUntrusted = 0;
    int handshakeFailures = 0;
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
    // Bumped whenever the session connection changes: work and status of an older one are dropped
    // (frames it already decrypted are still delivered).
    std::atomic<uint32_t> sessionEpoch{0};
    SessionTls tls;
    std::vector<uint8_t> outbox;
    // tls.open(), readable without sessionMutex: senders on the main loop must not wait for a
    // handshake step on the worker (LVGL, LEDs and NFC would stall).
    std::atomic<bool> sessionReady{false};
};
