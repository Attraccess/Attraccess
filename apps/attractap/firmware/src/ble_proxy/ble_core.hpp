#pragma once

// The proxy's state machine: one BLE owner (a scan or a session) at a time, the session's allowlist, its
// deadlines, its request queue and its notification forwarding. Single-threaded: everything runs on the
// proxy task. The radio (NimBLE) and the outbound channel (websocket) are interfaces, so host tests drive it
// with fakes and a fake clock.
//
// Every request gets exactly one answer (BLE_RESULT or BLE_SCAN_RESULT); BLE_CANCEL gets none. A request whose
// radio work cannot be aborted (a GATT procedure in flight) is answered CANCELLED or TIMEOUT at once, but later
// requests wait until NimBLE finished it, so operations never overlap on the link.

#include <deque>
#include <functional>
#include <string>

#include "ble_notification_buffer.hpp"
#include "ble_types.hpp"

namespace ble
{
    class IBleRadio
    {
    public:
        enum class Start : uint8_t
        {
            Pending, // completes later through BleProxyCore::onOpDone(token, ...)
            Done,    // completed synchronously and successfully (write without response)
            Retry,   // controller buffers are full; try again until the deadline
            Failed,  // `error` says why
        };

        virtual ~IBleRadio() = default;
        // Brings the stack up (lazily, on the first request). Called again after a failure.
        virtual Error init() = 0;
        virtual Error startScan(uint32_t durationMs) = 0;
        virtual void stopScan() = 0;
        // Connects, exchanges the MTU and discovers the allowlisted services; reports onConnected or onConnectFailed.
        virtual Error connect(const Address &address, uint32_t timeoutMs, const PsVector<AllowEntry> &allowlist) = 0;
        virtual void cancelConnect() = 0;
        // Reports onDisconnected once the link is down.
        virtual void disconnect() = 0;
        virtual Start read(uint32_t token, const Uuid &service, const Uuid &characteristic, Error &error) = 0;
        virtual Start write(uint32_t token, const Uuid &service, const Uuid &characteristic, const Bytes &value,
                            bool withoutResponse, Error &error) = 0;
        // mode: 0 off, 1 notify, 2 indicate (writes the CCCD).
        virtual Start setNotifications(uint32_t token, const Uuid &service, const Uuid &characteristic, uint8_t mode,
                                       Error &error) = 0;
    };

    enum class LogLevel : uint8_t
    {
        Debug, // successful operations: one line each, too many for info during bulk transfers
        Info,
        Warn, // a request or stream failed
        Error, // the proxy itself failed
    };

    class IBleSink
    {
    public:
        virtual ~IBleSink() = default;
        // One complete message to the API. false: not taken (queue full, not connected).
        virtual bool send(const std::string &message) = 0;
        // Whether the outbound queue has room for notifications; otherwise they stay in the bounded buffer.
        virtual bool canSendNotification() { return true; }
        virtual void log(LogLevel level, const char *line) { (void)level, (void)line; }
    };

    class BleProxyCore
    {
    public:
        enum class Owner : uint8_t
        {
            None,
            Scan,
            Session,
        };

        BleProxyCore(IBleRadio &radio, IBleSink &sink, NotificationBuffer &notifications)
            : radio(radio), sink(sink), notifications(notifications) {}

        // While true, new work is refused with READER_BUSY `ota`.
        void setOtaActive(std::function<bool()> active) { otaActive = std::move(active); }

        void handle(Command &&command, uint32_t now);
        void tick(uint32_t now);
        // The websocket connection that owns the work is gone (closed, or a channel switch): everything ends,
        // the peripheral is disconnected, nothing is sent (it would reach the next connection).
        void linkLost(uint32_t now);
        // OTA started: everything ends now and the API is told why.
        void otaStarted(uint32_t now);

        // --- radio events (proxy task) ----------------------------------------------------------------------
        void onAdvertisement(const Address &address, int8_t rssi, bool hasRssi, const uint8_t *data, size_t length);
        void onScanComplete(uint32_t now);
        void onConnected(const Address &peer, uint16_t mtu, uint32_t now);
        void onConnectFailed(const Error &error, uint32_t now);
        void onDisconnected(int reason, uint32_t now);
        void onOpDone(uint32_t token, const Error &error, Bytes &&value, uint32_t now);

        Owner owner() const { return currentOwner; }
        bool radioReady() const { return initialized; }
        // Nothing to do until the next request or radio event: no owner (so no deadline), nothing waiting to go
        // out. The proxy task then sleeps instead of polling.
        bool idle() const { return currentOwner == Owner::None && outbox.empty() && notifications.size() == 0; }
        // Whether the next request may be taken. Answers are never dropped: the outbox keeps room for everything
        // already accepted work still owes, so a request waits (in the proxy's command queue) while it is full.
        bool acceptsRequests() const;
        uint16_t mtu() const { return session.mtu; }
        size_t pendingRequests() const { return session.queue.size() + (session.current.active ? 1 : 0); }

    private:
        enum class SessionState : uint8_t
        {
            Connecting,
            Open,
            Releasing,
        };

        struct Queued
        {
            Command command;
            uint32_t deadline = 0;
        };

        struct Current
        {
            bool active = false;
            Command command;
            uint32_t token = 0;
            uint32_t deadline = 0;
            uint32_t startedMs = 0;
            bool answered = false;  // CANCELLED / TIMEOUT already went out; the radio result is discarded
            bool radioBusy = false; // NimBLE still runs the procedure
            bool retry = false;     // write without response waits for controller buffers
        };

        struct Subscription
        {
            Uuid service;
            Uuid characteristic;
            uint32_t id = 0;
            uint32_t seq = 0;
            uint16_t maxBytes = 0;
            bool failed = false;
        };

        struct Session
        {
            char id[MAX_SESSION_ID_LENGTH + 1] = "";
            SessionState state = SessionState::Connecting;
            Address address;
            PsVector<AllowEntry> allowlist;
            uint32_t openRequestId = 0;
            uint32_t openedMs = 0;
            uint32_t leaseMs = 0;
            uint32_t connectDeadline = 0;
            uint32_t leaseDeadline = 0;
            uint16_t mtu = 0;
            std::deque<Queued, PsAlloc<Queued>> queue;
            Current current;
            PsVector<Subscription> subscriptions;
            // Releasing: what goes out once the controller confirmed (or the release deadline passed).
            uint32_t releaseDeadline = 0;
            uint32_t closeRequestId = 0;
            bool announceEnd = false;
            const char *endReason = "";
            char endDetail[sizeof(Error::detail)] = "";
        };

        struct Scan
        {
            Command command;
            uint32_t deadline = 0;
            PsVector<Advertisement> candidates;
        };

        IBleRadio &radio;
        IBleSink &sink;
        NotificationBuffer &notifications;
        std::function<bool()> otaActive;
        bool initialized = false;
        Owner currentOwner = Owner::None;
        Session session;
        Scan scan;
        uint32_t nextToken = 0;
        // Answers and session ends the websocket did not take yet; dropped when the connection is lost.
        // Notifications never wait here: they stay in their own bounded buffer.
        std::deque<std::string, PsAlloc<std::string>> outbox;

        bool ota() const { return otaActive && otaActive(); }
        bool ensureRadio(const Command &command);
        void startScan(Command &&command, uint32_t now);
        void openSession(Command &&command, uint32_t now);
        void queueOperation(Command &&command, uint32_t now);
        void cancel(const Command &command, uint32_t now);
        void close(const Command &command, uint32_t now);
        Error checkAllowed(const Command &command) const;
        const AllowEntry *findEntry(const Uuid &service, const Uuid &characteristic) const;
        Subscription *findSubscription(const Uuid &service, const Uuid &characteristic);
        void removeSubscription(const Uuid &service, const Uuid &characteristic);

        void pump(uint32_t now);
        void startCurrent(uint32_t now);
        void finishCurrent(const Error &error, const Bytes *value, uint32_t now);
        void finishScan(const Error &error, uint32_t now);
        // A candidate whose services or manufacturers already fail the filter; null when there is none.
        Advertisement *evictableCandidate();
        // Ends the session: answers what is outstanding with `pending` (when `announce`), stops the radio and
        // releases the owner once the controller is done.
        void endSession(const char *reason, const Error &pending, bool announce, bool radioDown, uint32_t now);
        void finishRelease();
        void drainNotifications();

        void answer(const Command &command, const Error &error, const Bytes *value = nullptr, uint16_t mtu = 0,
                    uint32_t now = 0);
        void send(std::string &&message);
        void flushOutbox();
        void logf(LogLevel level, const char *format, ...);
    };
}
