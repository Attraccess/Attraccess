// The proxy state machine, part 3: the advertisement watch's scan next to the owner (scan or session) and its
// outbound events. The watch's own bookkeeping is ble_watch.cpp.
#include "ble_core.hpp"
#include "ble_core_detail.hpp"

#include "ble_codec.hpp"

namespace ble
{
    using namespace core_detail;

    void BleProxyCore::setWatch(Command &&command, uint32_t now)
    {
        if (command.watchFilters.empty())
        {
            if (watch.active()) logf(LogLevel::Info, "ble watch stopped reason=api");
            watch.clear();
            stopWatchScan();
            watchRetry = false;
            watchAnnouncedInactive = false;
            send(watchStateMessage(command.requestId, Error(), false));
            return;
        }
        // NimBLE comes up with the first filter set (never for an empty one). During an OTA it waits for the OTA.
        if (!ota() && !ensureRadio(command))
        {
            watch.clear();
            stopWatchScan();
            return;
        }
        const size_t filters = command.watchFilters.size();
        watch.set(std::move(command.watchFilters), command.keepaliveMs, now);
        watchRetry = false;
        watchAnnouncedInactive = false;
        updateWatchScan(now, false);
        // The answer says whether it scans right now and, if not, why; a later change comes unsolicited.
        const char *pause = watchPause();
        const char *detail = watchScanning ? "" : pause ? pause : watchError;
        if (!watchScanning) watchAnnouncedInactive = true;
        logf(LogLevel::Info, "ble watch filters=%u keepalive=%ums active=%d%s%s", static_cast<unsigned>(filters),
             static_cast<unsigned>(command.keepaliveMs), watchScanning ? 1 : 0, detail[0] ? " detail=" : "", detail);
        send(watchStateMessage(command.requestId, Error(), watchScanning, detail));
    }

    const char *BleProxyCore::watchPause() const
    {
        if (ota()) return "ota";
        if (currentOwner == Owner::Scan) return "scan";
        if (currentOwner == Owner::Session && session.state == SessionState::Connecting) return "connecting";
        // A release (cancelled connect or disconnect) is short: the scan waits for the controller.
        if (currentOwner == Owner::Session && session.state == SessionState::Releasing) return "radio-busy";
        return nullptr;
    }

    void BleProxyCore::stopWatchScan()
    {
        if (!watchScanning) return;
        radio.stopScan();
        watchScanning = false;
    }

    void BleProxyCore::updateWatchScan(uint32_t now, bool announce)
    {
        const bool want = watch.active() && !watchPause();
        const bool connected = currentOwner == Owner::Session;
        // A session that opened or ended since the scan started: the scan's duty cycle changes with it.
        if (!want || (watchScanning && watchScanConnected != connected)) stopWatchScan();
        if (!want || watchScanning) return;
        if (watchRetry && !due(now, watchRetryAt)) return;
        Error error;
        if (!initialized)
        {
            error = radio.init();
            if (!error.ok()) error = Error(Code::ReaderOffline, "ble-init-failed");
            else initialized = true;
        }
        if (error.ok()) error = radio.startWatchScan(connected);
        if (error.ok())
        {
            watchScanning = true;
            watchScanConnected = connected;
            watchRetry = false;
            watchError[0] = '\0';
            if (watchAnnouncedInactive && announce)
            {
                logf(LogLevel::Info, "ble watch resumed");
                send(watchStateMessage(0, Error(), true));
            }
            if (announce) watchAnnouncedInactive = false;
            return;
        }
        watchRetry = true;
        watchRetryAt = now + WATCH_RETRY_MS;
        std::snprintf(watchError, sizeof watchError, "%s", error.detail[0] ? error.detail : "radio-error");
        if (!watchAnnouncedInactive && announce)
        {
            logf(LogLevel::Warn, "ble watch scan failed detail=%s", watchError);
            send(watchStateMessage(0, Error(), false, watchError));
            watchAnnouncedInactive = true;
        }
    }

    void BleProxyCore::onWatchScanEnded(uint32_t now)
    {
        if (!watchScanning) return;
        // The controller ended it (a reset, say): started again after a pause, so a failing radio is not hammered.
        watchScanning = false;
        watchRetry = true;
        watchRetryAt = now + WATCH_RETRY_MS;
        logf(LogLevel::Warn, "ble watch scan ended by the radio");
    }

    void BleProxyCore::flushWatch(uint32_t now)
    {
        // Answers go first; events, like notifications, only use room the websocket queue has to spare.
        if (!watch.active() || !outbox.empty()) return;
        if (!sink.canSendNotification())
        {
            watch.dropKeepalives();
            return;
        }
        AdvertisementWatch::Batch batch;
        const std::string message = watch.nextMessage(now, batch);
        if (message.empty()) return;
        if (sink.send(message)) watch.markSent(batch, now);
        else watch.dropKeepalives();
    }
}
