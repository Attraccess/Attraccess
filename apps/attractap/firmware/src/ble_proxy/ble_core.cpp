// The proxy state machine, part 1: requests, the allowlist, the operation queue and its deadlines. Part 2 (radio
// events, session end, notifications, outbound queue) is ble_core_events.cpp.
#include "ble_core.hpp"
#include "ble_core_detail.hpp"

#include <algorithm>
#include <cstdarg>
#include <cstdio>

#include "ble_adv.hpp"
#include "ble_codec.hpp"
#include "ble_errors.hpp"

namespace ble
{
    using namespace core_detail;

    void BleProxyCore::logf(LogLevel level, const char *format, ...)
    {
        char line[160];
        va_list args;
        va_start(args, format);
        std::vsnprintf(line, sizeof line, format, args);
        va_end(args);
        sink.log(level, line);
    }

    bool BleProxyCore::acceptsRequests() const { return outbox.size() + OUTBOX_RESERVE < MAX_OUTBOX; }

    // ------------------------------------------------------------------------------------------- requests

    void BleProxyCore::handle(Command &&command, uint32_t now)
    {
        // Every request restarts the idle period, also one that ends before it reaches the radio.
        stackUsedMs = now;
        if (command.type == CommandType::Cancel)
        {
            cancel(command, now);
            return;
        }
        // Taken during an OTA too: it waits for the OTA's end instead of being lost (the API sends it only once).
        if (command.type == CommandType::WatchSet)
        {
            setWatch(std::move(command), now);
            return;
        }
        // A close always goes through: it only ever frees the radio.
        if (ota() && command.type != CommandType::Close)
        {
            answer(command, Error(Code::ReaderBusy, "ota"), nullptr, 0, now);
            return;
        }
        switch (command.type)
        {
        case CommandType::Scan:
            startScan(std::move(command), now);
            break;
        case CommandType::Open:
            openSession(std::move(command), now);
            break;
        case CommandType::Close:
            close(command, now);
            break;
        default:
            queueOperation(std::move(command), now);
            break;
        }
    }

    bool BleProxyCore::ensureRadio(const Command &command)
    {
        if (initialized) return true;
        const Error error = radio.init();
        if (!error.ok())
        {
            logf(LogLevel::Error, "ble init failed detail=%s", error.detail);
            answer(command, Error(Code::ReaderOffline, "ble-init-failed"));
            return false;
        }
        initialized = true;
        return true;
    }

    uint32_t BleProxyCore::shutdownInMs(uint32_t now) const
    {
        const uint32_t deadline = stackUsedMs + STACK_IDLE_SHUTDOWN_MS;
        return due(now, deadline) ? 0 : deadline - now;
    }

    void BleProxyCore::shutdownIdleStack(uint32_t now)
    {
        if (!initialized) return;
        if (stackInUse())
        {
            stackUsedMs = now;
            return;
        }
        if (!due(now, stackUsedMs + STACK_IDLE_SHUTDOWN_MS)) return;
        // Cleared first: whatever happens below, the next request goes through init(), which brings a stack that is
        // down up again and takes one that is still up as it is. Everything runs on this task, so no request can
        // reach the radio while it is going down.
        initialized = false;
        const Error error = radio.shutdown();
        if (error.ok())
            logf(LogLevel::Info, "ble stack shut down after %us idle",
                 static_cast<unsigned>(STACK_IDLE_SHUTDOWN_MS / 1000));
        else logf(LogLevel::Warn, "ble shutdown failed detail=%s", error.detail);
    }

    void BleProxyCore::superviseLink()
    {
        const char *action = radio.superviseLink();
        if (action) logf(LogLevel::Warn, "ble link recovery action=%s", action);
    }

    void BleProxyCore::startScan(Command &&command, uint32_t now)
    {
        // One BLE owner per reader: no queue, the API retries.
        if (currentOwner != Owner::None)
        {
            answer(command, Error(Code::ReaderBusy, "busy"), nullptr, 0, now);
            return;
        }
        if (!heap_guard::fits(SCAN_HEADROOM_BYTES))
        {
            answer(command, noMemory(), nullptr, 0, now);
            return;
        }
        if (!ensureRadio(command)) return;
        // The candidate list never grows during the scan: an advertisement must not need an allocation that can fail.
        PsVector<Advertisement> candidates;
        if (!heap_guard::fits(SCAN_HEADROOM_BYTES))
        {
            answer(command, noMemory(), nullptr, 0, now);
            return;
        }
        candidates.reserve(MAX_SCAN_CANDIDATES);
        // The on-demand scan replaces the watch's for its duration (and feeds the watch meanwhile).
        stopWatchScan();
        const Error error = radio.startScan(command.durationMs);
        if (!error.ok())
        {
            answer(command, error, nullptr, 0, now);
            return;
        }
        currentOwner = Owner::Scan;
        scan.command = std::move(command);
        scan.deadline = now + scan.command.durationMs;
        scan.candidates = std::move(candidates);
    }

    void BleProxyCore::openSession(Command &&command, uint32_t now)
    {
        if (currentOwner != Owner::None)
        {
            answer(command, Error(Code::ReaderBusy, "busy"), nullptr, 0, now);
            return;
        }
        if (!heap_guard::fits(OPEN_HEADROOM_BYTES))
        {
            answer(command, noMemory(), nullptr, 0, now);
            return;
        }
        if (!ensureRadio(command)) return;
        session = Session();
        std::memcpy(session.id, command.sessionId, sizeof session.id);
        session.address = command.address;
        session.allowlist = command.allowlist;
        // One subscription per allowlist entry at most: subscribing never grows the list.
        session.subscriptions.reserve(session.allowlist.size());
        session.openRequestId = command.requestId;
        session.openedMs = now;
        session.leaseMs = command.leaseMs;
        session.connectDeadline = now + command.connectTimeoutMs + OP_GRACE_MS;
        session.state = SessionState::Connecting;
        notifications.clear();
        // NimBLE cannot scan while it initiates a connection: the watch resumes once the link is up or failed.
        stopWatchScan();
        // A link whose end NimBLE never reported is recovered first, so the connect is not refused link-busy for it.
        superviseLink();
        const Error error = radio.connect(command.address, command.connectTimeoutMs, session.allowlist);
        if (!error.ok())
        {
            answer(command, error, nullptr, 0, now);
            session = Session();
            return;
        }
        currentOwner = Owner::Session;
        // Kept as the open request, answered on connect/failure/cancel.
        session.current = Current();
        session.queue.clear();
        session.current.command = std::move(command);
    }

    const AllowEntry *BleProxyCore::findEntry(const Uuid &service, const Uuid &characteristic) const
    {
        for (const AllowEntry &entry : session.allowlist)
            if (entry.service == service && entry.characteristic == characteristic) return &entry;
        return nullptr;
    }

    Error BleProxyCore::checkAllowed(const Command &command) const
    {
        const AllowEntry *entry = findEntry(command.service, command.characteristic);
        if (!entry) return Error(Code::UnknownCharacteristic, "not-in-allowlist");
        switch (command.type)
        {
        case CommandType::Read:
            if (!(entry->ops & OP_READ)) return Error(Code::OperationNotAllowed, "read");
            break;
        case CommandType::Write:
        {
            const uint8_t bit = command.withoutResponse ? OP_WRITE_WITHOUT_RESPONSE : OP_WRITE;
            if (!(entry->ops & bit))
                return Error(Code::OperationNotAllowed, command.withoutResponse ? "writeWithoutResponse" : "write");
            if (command.value.size() > entry->maxWrite) return Error(Code::PayloadTooLarge, "max-write");
            // A write without response is one ATT packet: it cannot use the long-write procedure.
            if (command.withoutResponse && command.value.size() + 3 > session.mtu)
                return Error(Code::PayloadTooLarge, "exceeds-mtu");
            break;
        }
        case CommandType::Subscribe:
        {
            const uint8_t bit = command.indicate ? OP_INDICATE : OP_NOTIFY;
            if (!(entry->ops & bit)) return Error(Code::OperationNotAllowed, command.indicate ? "indicate" : "notify");
            break;
        }
        case CommandType::Unsubscribe:
            if (!(entry->ops & (OP_NOTIFY | OP_INDICATE))) return Error(Code::OperationNotAllowed, "notify");
            break;
        default:
            break;
        }
        return Error();
    }

    void BleProxyCore::queueOperation(Command &&command, uint32_t now)
    {
        if (currentOwner != Owner::Session || std::strcmp(session.id, command.sessionId) != 0)
        {
            answer(command, Error(Code::SessionClosed, "unknown-session"), nullptr, 0, now);
            return;
        }
        if (session.state != SessionState::Open)
        {
            answer(command, Error(Code::SessionClosed, session.state == SessionState::Connecting ? "not-open" : "closed"),
                   nullptr, 0, now);
            return;
        }
        // Checked before anything reaches the radio: the API's checks may have a bug; these may not.
        const Error allowed = checkAllowed(command);
        if (!allowed.ok())
        {
            char id[9];
            shortId(command.sessionId, id);
            logf(LogLevel::Warn, "ble %s session=%s req=%u rejected by allowlist detail=%s", opName(command.type), id,
                 static_cast<unsigned>(command.requestId), allowed.detail);
            answer(command, allowed, nullptr, 0, now);
            return;
        }
        if (session.queue.size() >= MAX_PENDING_REQUESTS)
        {
            answer(command, Error(Code::ReaderBusy, "queue-full"), nullptr, 0, now);
            return;
        }
        if (!heap_guard::fits(QUEUE_HEADROOM_BYTES))
        {
            answer(command, noMemory(), nullptr, 0, now);
            return;
        }
        Queued queued;
        queued.deadline = now + command.timeoutMs + OP_GRACE_MS;
        queued.command = std::move(command);
        session.queue.push_back(std::move(queued));
        pump(now);
    }

    void BleProxyCore::cancel(const Command &command, uint32_t now)
    {
        const uint32_t target = command.targetRequestId;
        if (currentOwner == Owner::Scan && scan.command.requestId == target &&
            std::strcmp(scan.command.sessionId, command.sessionId) == 0)
        {
            radio.stopScan();
            finishScan(Error(Code::Cancelled), now);
            return;
        }
        if (currentOwner != Owner::Session || std::strcmp(session.id, command.sessionId) != 0) return;
        if (session.state == SessionState::Connecting && session.openRequestId == target)
        {
            answer(session.current.command, Error(Code::Cancelled), nullptr, 0, now);
            session.current = Current();
            endSession("cancelled", Error(Code::Cancelled), true, false, now);
            return;
        }
        for (auto it = session.queue.begin(); it != session.queue.end(); ++it)
        {
            if (it->command.requestId != target) continue;
            answer(it->command, Error(Code::Cancelled), nullptr, 0, now);
            session.queue.erase(it);
            return;
        }
        Current &current = session.current;
        if (current.active && current.command.requestId == target && !current.answered)
        {
            answer(current.command, Error(Code::Cancelled), nullptr, 0, now);
            current.answered = true;
            if (current.command.type == CommandType::Subscribe)
                removeSubscription(current.command.service, current.command.characteristic);
            // Not started yet (waiting for controller buffers): nothing to wait for.
            if (!current.radioBusy) session.current = Current();
            pump(now);
        }
    }

    void BleProxyCore::close(const Command &command, uint32_t now)
    {
        if (currentOwner != Owner::Session || std::strcmp(session.id, command.sessionId) != 0)
        {
            answer(command, Error(Code::SessionClosed, "unknown-session"), nullptr, 0, now);
            return;
        }
        if (session.state == SessionState::Releasing)
        {
            // Already ending: the close is answered once the link is down, like the first one.
            if (!session.closeRequestId) session.closeRequestId = command.requestId;
            else answer(command, Error(), nullptr, 0, now);
            return;
        }
        if (session.state == SessionState::Connecting)
            answer(session.current.command, Error(Code::SessionClosed, "closed"), nullptr, 0, now);
        session.closeRequestId = command.requestId;
        endSession("closed", Error(Code::SessionClosed, "closed"), true, false, now);
    }

    // ------------------------------------------------------------------------------------------- operations

    BleProxyCore::Subscription *BleProxyCore::findSubscription(const Uuid &service, const Uuid &characteristic)
    {
        for (Subscription &s : session.subscriptions)
            if (s.service == service && s.characteristic == characteristic) return &s;
        return nullptr;
    }

    void BleProxyCore::removeSubscription(const Uuid &service, const Uuid &characteristic)
    {
        // Buffered notifications belong to the subscription that ends here; a later one must not see them.
        notifications.forget(service, characteristic);
        auto &subs = session.subscriptions;
        subs.erase(std::remove_if(subs.begin(), subs.end(),
                                  [&](const Subscription &s) {
                                      return s.service == service && s.characteristic == characteristic;
                                  }),
                   subs.end());
    }

    void BleProxyCore::pump(uint32_t now)
    {
        while (currentOwner == Owner::Session && session.state == SessionState::Open)
        {
            Current &current = session.current;
            if (current.active)
            {
                if (current.radioBusy || !current.retry) return;
                startCurrent(now);
                if (session.current.active) return;
                continue;
            }
            if (session.queue.empty()) return;
            Queued next = std::move(session.queue.front());
            session.queue.pop_front();
            current = Current();
            current.active = true;
            current.command = std::move(next.command);
            current.deadline = next.deadline;
            current.startedMs = now;
            current.token = ++nextToken;
            startCurrent(now);
        }
    }

    void BleProxyCore::startCurrent(uint32_t now)
    {
        Current &current = session.current;
        const Command &command = current.command;
        Error error;
        IBleRadio::Start start = IBleRadio::Start::Failed;
        switch (command.type)
        {
        case CommandType::Read:
            if (!heap_guard::fits(READ_HEADROOM_BYTES))
            {
                error = noMemory();
                break;
            }
            start = radio.read(current.token, command.service, command.characteristic, error);
            break;
        case CommandType::Write:
            start = radio.write(current.token, command.service, command.characteristic, command.value,
                                command.withoutResponse, error);
            break;
        case CommandType::Subscribe:
        {
            if (!current.retry)
            {
                // Forwarding starts with the CCCD write: a notification may beat its confirmation. A previous
                // subscription to the characteristic ends here, with whatever it still had buffered.
                const AllowEntry *entry = findEntry(command.service, command.characteristic);
                removeSubscription(command.service, command.characteristic);
                Subscription subscription;
                subscription.service = command.service;
                subscription.characteristic = command.characteristic;
                subscription.id = command.requestId;
                subscription.maxBytes = entry ? entry->maxNotification : 0;
                session.subscriptions.push_back(subscription);
            }
            start = radio.setNotifications(current.token, command.service, command.characteristic,
                                           command.indicate ? 2 : 1, error);
            break;
        }
        case CommandType::Unsubscribe:
            if (!findSubscription(command.service, command.characteristic))
            {
                start = IBleRadio::Start::Done;
                break;
            }
            removeSubscription(command.service, command.characteristic);
            start = radio.setNotifications(current.token, command.service, command.characteristic, 0, error);
            break;
        default:
            error = Error(Code::Internal, "unexpected-op");
            break;
        }
        current.retry = false;
        switch (start)
        {
        case IBleRadio::Start::Pending:
            current.radioBusy = true;
            return;
        case IBleRadio::Start::Retry:
            current.retry = true;
            session.writeRetries++;
            return;
        case IBleRadio::Start::Done:
            finishCurrent(Error(), nullptr, now);
            return;
        case IBleRadio::Start::Failed:
        default:
            finishCurrent(error, nullptr, now);
            return;
        }
    }

    void BleProxyCore::finishCurrent(const Error &error, const Bytes *value, uint32_t now)
    {
        Current &current = session.current;
        if (!current.answered)
        {
            if (current.command.type == CommandType::Subscribe && !error.ok())
                removeSubscription(current.command.service, current.command.characteristic);
            if (current.command.type == CommandType::Read && error.ok())
            {
                const AllowEntry *entry = findEntry(current.command.service, current.command.characteristic);
                // A read larger than the profile allows is refused, not truncated.
                if (!value || !entry || value->size() > entry->maxRead)
                    answer(current.command, Error(Code::PayloadTooLarge, "max-read"), nullptr, 0, now);
                else
                    answer(current.command, error, value, 0, now);
            }
            else
            {
                answer(current.command, error, nullptr, 0, now);
            }
        }
        session.current = Current();
        // A lost link ends the session; anything else keeps it.
        if (error.code == Code::Disconnected) return;
        pump(now);
    }

    void BleProxyCore::onOpDone(uint32_t token, const Error &error, Bytes &&value, uint32_t now)
    {
        Current &current = session.current;
        if (currentOwner != Owner::Session || !current.active || current.token != token)
        {
            logf(LogLevel::Debug, "ble late radio result dropped");
            return;
        }
        current.radioBusy = false;
        if (current.answered && current.command.type == CommandType::Subscribe && error.ok() &&
            session.state == SessionState::Open)
        {
            // A cancelled or timed-out subscribe is not left enabled on the peripheral.
            Error ignored;
            const uint32_t undo = ++nextToken;
            current.token = undo;
            current.command.type = CommandType::Unsubscribe;
            if (radio.setNotifications(undo, current.command.service, current.command.characteristic, 0, ignored) ==
                IBleRadio::Start::Pending)
            {
                current.radioBusy = true;
                return;
            }
        }
        finishCurrent(error, &value, now);
    }
}
