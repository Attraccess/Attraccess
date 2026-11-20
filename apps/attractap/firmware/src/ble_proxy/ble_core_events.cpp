// The proxy state machine, part 2: radio events (scan, connect, disconnect), session end and release,
// notification forwarding and the outbound queue. Part 1 (requests) is ble_core.cpp.
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

    // ------------------------------------------------------------------------------------------- scan

    void BleProxyCore::onAdvertisement(const Address &address, int8_t rssi, bool hasRssi, const uint8_t *data,
                                       size_t length, uint32_t now)
    {
        // Decoding allocates (names, UUIDs, manufacturer data): with the heap short, the report is skipped. The device
        // advertises again.
        if (!heap_guard::fits(advertisementCost(length))) return;
        // Reports of an on-demand scan feed the watch too, so it does not go blind while the scan replaces its own.
        if (watch.active() && (watchScanning || currentOwner == Owner::Scan))
            watch.onAdvertisement(address, rssi, hasRssi, data, length, now);
        if (currentOwner != Owner::Scan) return;
        Advertisement *target = nullptr;
        for (Advertisement &candidate : scan.candidates)
        {
            if (candidate.address == address)
            {
                target = &candidate;
                break;
            }
        }
        if (!target)
        {
            // The list was reserved when the scan started and never grows.
            if (scan.candidates.size() >= MAX_SCAN_CANDIDATES || scan.candidates.size() == scan.candidates.capacity())
            {
                // A crowded band fills the list: make room by dropping a device its own data already rules out.
                target = evictableCandidate();
                if (!target) return;
                *target = Advertisement();
            }
            else
            {
                scan.candidates.emplace_back();
                target = &scan.candidates.back();
            }
            target->address = address;
        }
        if (hasRssi)
        {
            target->rssi = rssi;
            target->hasRssi = true;
        }
        mergeAdvertisingData(data, length, *target);
    }

    Advertisement *BleProxyCore::evictableCandidate()
    {
        // Judged on services and manufacturers only: a name may still come with the scan response.
        const Command &filter = scan.command;
        for (Advertisement &candidate : scan.candidates)
        {
            if (!filter.filterServices.empty() && !candidate.serviceUuids.empty())
            {
                bool any = false;
                for (const Uuid &uuid : candidate.serviceUuids)
                    any = any || std::find(filter.filterServices.begin(), filter.filterServices.end(), uuid) !=
                                     filter.filterServices.end();
                if (!any) return &candidate;
            }
            if (!filter.filterManufacturers.empty() && !candidate.manufacturers.empty())
            {
                bool any = false;
                for (const auto &m : candidate.manufacturers)
                    any = any || std::find(filter.filterManufacturers.begin(), filter.filterManufacturers.end(),
                                           m.companyId) != filter.filterManufacturers.end();
                if (!any) return &candidate;
            }
        }
        return nullptr;
    }

    void BleProxyCore::onScanComplete(uint32_t now)
    {
        if (currentOwner == Owner::Scan) finishScan(Error(), now);
    }

    void BleProxyCore::finishScan(const Error &scanError, uint32_t now)
    {
        // The matches stay in the candidate list (filtered in place): the result needs no second list.
        PsVector<Advertisement> &matches = scan.candidates;
        size_t kept = 0;
        size_t resultBytes = 1024;
        for (Advertisement &candidate : scan.candidates)
        {
            if (!scanError.ok() || kept >= scan.command.maxResults) break;
            if (!matchesFilter(candidate, scan.command)) continue;
            resultBytes += scanResultCost(candidate);
            if (&scan.candidates[kept] != &candidate) scan.candidates[kept] = std::move(candidate);
            kept++;
        }
        matches.erase(matches.begin() + static_cast<std::ptrdiff_t>(kept), matches.end());
        // The answer is built in one string: with the heap short, the API gets a busy reader and scans again.
        const Error error = scanError.ok() && !heap_guard::fits(resultBytes) ? noMemory() : scanError;
        char id[9];
        shortId(scan.command.sessionId, id);
        const LogLevel level =
            error.ok() ? LogLevel::Debug : error.code == Code::Cancelled ? LogLevel::Info : LogLevel::Warn;
        logf(level, "ble scan session=%s %s results=%u %ums", id, error.ok() ? "ok" : codeName(error.code),
             static_cast<unsigned>(matches.size()), static_cast<unsigned>(now - scan.command.receivedMs));
        send(scanResultMessage(scan.command.sessionId, scan.command.requestId, error, error.ok() ? &matches : nullptr));
        scan = Scan();
        currentOwner = Owner::None;
    }

    // ------------------------------------------------------------------------------------------- connection

    void BleProxyCore::onConnected(const Address &peer, uint16_t mtu, uint32_t now)
    {
        if (currentOwner != Owner::Session || session.state != SessionState::Connecting)
        {
            // A connect that won the race against its cancel: take the link down again.
            radio.disconnect();
            return;
        }
        if (peer != session.address)
        {
            answer(session.current.command, Error(Code::OperationNotAllowed, "address-mismatch"), nullptr, 0, now);
            session.current = Current();
            // The link is up (to the wrong device): end it like an open session.
            session.state = SessionState::Open;
            endSession("error", Error(Code::SessionClosed, "address-mismatch"), true, false, now);
            return;
        }
        session.mtu = std::min<uint16_t>(std::max<uint16_t>(mtu, MIN_MTU), MAX_MTU);
        session.state = SessionState::Open;
        // The API starts its lease once the session is open, so the reader's starts here too, not at the request.
        session.leaseDeadline = now + session.leaseMs + LEASE_GRACE_MS;
        answer(session.current.command, Error(), nullptr, session.mtu, now);
        session.current = Current();
        pump(now);
    }

    void BleProxyCore::onConnectFailed(const Error &error, uint32_t now)
    {
        if (currentOwner != Owner::Session) return;
        if (session.state == SessionState::Releasing)
        {
            finishRelease();
            return;
        }
        if (session.state != SessionState::Connecting) return;
        answer(session.current.command, error, nullptr, 0, now);
        session.current = Current();
        endSession("error", error, true, true, now);
    }

    void BleProxyCore::onDisconnected(int reason, uint32_t now)
    {
        if (currentOwner != Owner::Session) return;
        if (session.state == SessionState::Releasing)
        {
            finishRelease();
            return;
        }
        char detail[sizeof(Error::detail)];
        disconnectDetail(reason, detail, sizeof detail);
        if (session.state == SessionState::Connecting)
        {
            answer(session.current.command, Error(Code::ConnectionFailed, detail), nullptr, 0, now);
            session.current = Current();
        }
        endSession("disconnected", Error(Code::Disconnected, detail), true, true, now);
    }

    void BleProxyCore::endSession(const char *reason, const Error &pending, bool announce, bool radioDown, uint32_t now)
    {
        if (currentOwner != Owner::Session || session.state == SessionState::Releasing) return;
        const SessionState previous = session.state;
        if (announce)
        {
            if (session.current.active && !session.current.answered)
                answer(session.current.command, pending, nullptr, 0, now);
            for (const Queued &queued : session.queue) answer(queued.command, pending, nullptr, 0, now);
        }
        session.queue.clear();
        session.current = Current();
        session.subscriptions.clear();
        notifications.clear();
        session.state = SessionState::Releasing;
        session.announceEnd = announce;
        session.endReason = reason;
        std::snprintf(session.endDetail, sizeof session.endDetail, "%s", pending.detail);
        session.releaseDeadline = now + RELEASE_DEADLINE_MS;
        char id[9];
        shortId(session.id, id);
        logf(LogLevel::Info, "ble session=%s ended reason=%s detail=%s after %ums retries=%u queued=%u", id, reason,
             pending.detail, static_cast<unsigned>(now - session.openedMs), static_cast<unsigned>(session.writeRetries),
             static_cast<unsigned>(session.answersQueued));
        if (radioDown)
        {
            finishRelease();
            return;
        }
        if (previous == SessionState::Connecting) radio.cancelConnect();
        else radio.disconnect();
    }

    void BleProxyCore::finishRelease()
    {
        if (session.announceEnd)
        {
            if (session.closeRequestId)
                send(resultMessage(session.id, session.closeRequestId, Error()));
            send(sessionEndedMessage(session.id, session.endReason, session.endDetail));
        }
        session = Session();
        currentOwner = Owner::None;
    }

    // ------------------------------------------------------------------------------------------- lifecycle

    void BleProxyCore::linkLost(uint32_t now)
    {
        outbox.clear();
        // The API sends its filter set again on the next connection.
        if (watch.active()) logf(LogLevel::Info, "ble watch stopped reason=link-lost");
        watch.clear();
        stopWatchScan();
        watchRetry = false;
        watchAnnouncedInactive = false;
        if (currentOwner == Owner::Scan)
        {
            radio.stopScan();
            scan = Scan();
            currentOwner = Owner::None;
        }
        if (currentOwner == Owner::Session)
        {
            if (session.state == SessionState::Releasing)
            {
                // Nobody is left to tell.
                session.announceEnd = false;
                return;
            }
            endSession("link-lost", Error(Code::Disconnected, "reader-link-lost"), false, false, now);
        }
    }

    void BleProxyCore::otaStarted(uint32_t now)
    {
        if (watch.active())
        {
            // Paused, not ended: it resumes if the OTA fails and the reader keeps running.
            stopWatchScan();
            if (!watchAnnouncedInactive) send(watchStateMessage(0, Error(), false, "ota"));
            watchAnnouncedInactive = true;
        }
        if (currentOwner == Owner::Scan)
        {
            radio.stopScan();
            finishScan(Error(Code::ReaderBusy, "ota"), now);
        }
        if (currentOwner == Owner::Session && session.state != SessionState::Releasing)
        {
            if (session.state == SessionState::Connecting)
            {
                answer(session.current.command, Error(Code::ReaderBusy, "ota"), nullptr, 0, now);
                session.current = Current();
            }
            endSession("ota", Error(Code::SessionClosed, "ota"), true, false, now);
        }
    }

    void BleProxyCore::tick(uint32_t now)
    {
        // First, on the state the requests and radio events of this round left: whatever is still pending keeps it.
        shutdownIdleStack(now);
        flushOutbox();
        if (currentOwner == Owner::Scan && due(now, scan.deadline))
        {
            radio.stopScan();
            finishScan(Error(), now);
        }
        if (currentOwner == Owner::Session)
        {
            switch (session.state)
            {
            case SessionState::Connecting:
                if (due(now, session.connectDeadline))
                {
                    answer(session.current.command, Error(Code::DeviceNotFound, "connect-timeout"), nullptr, 0, now);
                    session.current = Current();
                    endSession("timeout", Error(Code::DeviceNotFound, "connect-timeout"), true, false, now);
                }
                break;
            case SessionState::Releasing:
                if (due(now, session.releaseDeadline)) finishRelease();
                break;
            case SessionState::Open:
            {
                // The reader's own lease: holds even when the API went silent.
                if (due(now, session.leaseDeadline))
                {
                    endSession("lease-expired", Error(Code::SessionClosed, "lease-expired"), true, false, now);
                    break;
                }
                for (auto it = session.queue.begin(); it != session.queue.end();)
                {
                    if (!due(now, it->deadline))
                    {
                        ++it;
                        continue;
                    }
                    answer(it->command, Error(Code::Timeout, "deadline"), nullptr, 0, now);
                    it = session.queue.erase(it);
                }
                Current &current = session.current;
                if (current.active && !current.answered && due(now, current.deadline))
                {
                    answer(current.command, Error(Code::Timeout, "deadline"), nullptr, 0, now);
                    current.answered = true;
                    if (current.command.type == CommandType::Subscribe)
                        removeSubscription(current.command.service, current.command.characteristic);
                    if (!current.radioBusy) session.current = Current();
                }
                if (session.current.active && session.current.radioBusy &&
                    due(now, session.current.startedMs + STUCK_OP_MS))
                {
                    endSession("timeout", Error(Code::Timeout, "stuck-op"), true, false, now);
                    break;
                }
                pump(now);
                break;
            }
            }
        }
        updateWatchScan(now);
        drainNotifications();
        flushWatch(now);
    }

    void BleProxyCore::drainNotifications()
    {
        // Answers go first and a notification leaves the buffer only once the websocket took it: a busy link backs
        // notifications up in their bounded buffer (which overflows with a marker), never into the outbox.
        if (!outbox.empty()) return;
        NotificationBuffer::Entry entry;
        // Asks for room only with a notification to send: an empty buffer must not mark the proxy as waiting. The copy
        // and the message need heap; while it is short, notifications wait in their bounded buffer.
        while (heap_guard::fits(NOTIFY_HEADROOM_BYTES) && notifications.peek(entry) && sink.canSendNotification())
        {
            Subscription *subscription = currentOwner == Owner::Session && session.state == SessionState::Open
                                             ? findSubscription(entry.service, entry.characteristic)
                                             : nullptr;
            if (!subscription || subscription->failed)
            {
                notifications.removeOldest();
                continue;
            }
            Error error;
            if (entry.overflow) error = Error(Code::NotificationOverflow, "reader-buffer");
            else if (entry.oversizedLength || entry.value.size() > subscription->maxBytes)
                error = Error(Code::PayloadTooLarge, "max-notification");
            if (!sink.send(notificationMessage(session.id, subscription->id, subscription->seq + 1, error,
                                               entry.value.data(), entry.value.size())))
                return; // stays buffered; the next tick tries again
            notifications.removeOldest();
            subscription->seq++;
            if (!error.ok())
            {
                // The stream ends here; the API unsubscribes.
                subscription->failed = true;
                char id[9];
                shortId(session.id, id);
                logf(LogLevel::Warn, "ble notification session=%s sub=%u failed code=%s", id,
                     static_cast<unsigned>(subscription->id), codeName(error.code));
            }
        }
    }

    // ------------------------------------------------------------------------------------------- output

    void BleProxyCore::answer(const Command &command, const Error &error, const Bytes *value, uint16_t mtu,
                              uint32_t now)
    {
        if (!command.requestId) return;
        char id[9];
        shortId(command.sessionId, id);
        // The API closes every cancelled open again (the cancel may have raced the connect): not an error.
        const bool expected = error.code == Code::Cancelled ||
                              (command.type == CommandType::Close && error.code == Code::SessionClosed);
        const LogLevel level = error.ok() ? LogLevel::Debug : expected ? LogLevel::Info : LogLevel::Warn;
        logf(level, "ble %s session=%s req=%u %s%s%s %ums", opName(command.type),
             id, static_cast<unsigned>(command.requestId), error.ok() ? "ok" : codeName(error.code),
             error.detail[0] ? " detail=" : "", error.detail,
             static_cast<unsigned>(now ? now - command.receivedMs : 0));
        if (command.type == CommandType::Scan)
            send(scanResultMessage(command.sessionId, command.requestId, error, nullptr));
        else if (command.type == CommandType::WatchSet)
            send(watchStateMessage(command.requestId, error, false));
        else
            send(resultMessage(command.sessionId, command.requestId, error, value, mtu));
    }

    void BleProxyCore::send(std::string &&message)
    {
        // Answers keep their order: nothing overtakes what is already waiting. Never dropped: the API would wait
        // for a lost answer until its own timeout, and a lost session end would leave it holding the reader.
        // acceptsRequests() keeps the outbox bounded.
        if (outbox.empty() && sink.send(message)) return;
        if (currentOwner == Owner::Session) session.answersQueued++;
        outbox.push_back(std::move(message));
    }

    void BleProxyCore::flushOutbox()
    {
        while (!outbox.empty() && sink.send(outbox.front())) outbox.pop_front();
    }
}
