// NimBLE central, part 1: the stack, the scan and the connection lifecycle. Part 2 (discovery after the connect,
// GATT operations) is ble_radio_nimble_gatt.cpp.
#include "ble_radio_nimble.hpp"

#if ATTRACTAP_BLE_PROXY

#include <algorithm>

#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/idf_additions.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "host/ble_gap.h"
#include "host/ble_gatt.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "nimble/nimble_port.h"

#include "ble_errors.hpp"

namespace ble
{
    static_assert(nimble::HS_ENOMEM == BLE_HS_ENOMEM && nimble::HS_ENOTCONN == BLE_HS_ENOTCONN &&
                      nimble::HS_ETIMEOUT == BLE_HS_ETIMEOUT && nimble::HS_EDONE == BLE_HS_EDONE &&
                      nimble::HS_ETIMEOUT_HCI == BLE_HS_ETIMEOUT_HCI && nimble::ERR_ATT_BASE == BLE_HS_ERR_ATT_BASE &&
                      nimble::ERR_HCI_BASE == BLE_HS_ERR_HCI_BASE,
                  "NimBLE status codes changed: update ble_errors.hpp");

    namespace
    {
        constexpr uint32_t SYNC_TIMEOUT_MS = 3000;
        // NimBLE's own host task, like nimble_port_freertos_init but with its stack in PSRAM where the board has it.
        constexpr uint32_t HOST_TASK_STACK = 4096;
        // Free DMA-capable internal RAM the stack needs to start. Espressif's controller takes about 24 KB of it
        // (28 KB with a link) and does not check every allocation: with too little it asserts and the reader
        // restarts (seen with 20 KB free). The rest is headroom for whatever else needs internal RAM meanwhile.
        constexpr size_t STACK_MIN_FREE_INTERNAL = 40 * 1024;
        // The watch's passive scan, in 0.625 ms units: 30 ms of every 100 ms without a link (30 %), 30 ms of every
        // 200 ms with one (15 %). The rest of the air time stays with the connection's events and with Wi-Fi, which
        // shares the radio through the coexistence arbiter.
        constexpr uint16_t WATCH_WINDOW = 48;
        constexpr uint16_t WATCH_INTERVAL = 160;
        constexpr uint16_t WATCH_INTERVAL_CONNECTED = 320;

        NimbleRadio *instance = nullptr;
        SemaphoreHandle_t syncSemaphore = nullptr;
        // Given once nimble_port_run() returned; the host task then waits to be deleted.
        SemaphoreHandle_t hostStopped = nullptr;
        // Set while the stack is up (nimble_port_init done, host task running).
        TaskHandle_t hostTaskHandle = nullptr;
        // The host task's stack came from xTaskCreatePinnedToCoreWithCaps (PSRAM), so it is deleted the same way.
        bool hostTaskWithCaps = false;

        void toNimble(const Address &address, ble_addr_t &out)
        {
            out.type = address.random ? BLE_ADDR_RANDOM : BLE_ADDR_PUBLIC;
            // NimBLE stores the address least significant byte first.
            for (int i = 0; i < 6; i++) out.val[i] = address.b[5 - i];
        }

        Address fromNimble(const ble_addr_t &addr)
        {
            Address out;
            out.random = addr.type != BLE_ADDR_PUBLIC;
            for (int i = 0; i < 6; i++) out.b[i] = addr.val[5 - i];
            return out;
        }

        int gapTrampoline(struct ble_gap_event *event, void *arg)
        {
            return static_cast<NimbleRadio *>(arg)->onGapEvent(event);
        }

        int watchTrampoline(struct ble_gap_event *event, void *arg)
        {
            return static_cast<NimbleRadio *>(arg)->onWatchGapEvent(event);
        }

        void hostTask(void *)
        {
            nimble_port_run(); // returns once NimbleRadio::shutdown() called nimble_port_stop()
            // Deleted by shutdown(), not by itself: a WithCaps task that deletes itself needs a helper task in
            // internal RAM, and aborts the reader when that allocation fails.
            xSemaphoreGive(hostStopped);
            vTaskSuspend(nullptr);
        }

        Error espError(esp_err_t err)
        {
            char detail[sizeof(Error::detail)];
            snprintf(detail, sizeof detail, "esp:0x%x", static_cast<unsigned>(err));
            return Error(Code::ReaderOffline, detail);
        }

        void onSyncCallback()
        {
            if (instance) instance->onSync();
        }

        void onResetCallback(int reason)
        {
            (void)reason; // the controller dropped every link: the disconnect events report it
        }

    }

    Error NimbleRadio::init()
    {
        if (synced) return Error();
        if (!syncSemaphore) syncSemaphore = xSemaphoreCreateBinary();
        if (!hostStopped) hostStopped = xSemaphoreCreateBinary();
        if (!syncSemaphore || !hostStopped) return Error(Code::ReaderOffline, "no-memory");
        // A stack that came up but never synced stays up: the next request waits for its sync again. Stopping it
        // instead would race the host task's own sync retries, which reschedule the host timer that the stop frees.
        if (!hostTaskHandle)
        {
            instance = this;
            // A sync that came after an earlier timeout must not stand in for this stack's.
            (void)xSemaphoreTake(syncSemaphore, 0);
            if (heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA) < STACK_MIN_FREE_INTERNAL)
                return Error(Code::ReaderOffline, "low-memory");
            // On failure nimble_port_init() takes the controller down again itself.
            const esp_err_t err = nimble_port_init();
            if (err != ESP_OK) return espError(err);
            ble_hs_cfg.sync_cb = onSyncCallback;
            ble_hs_cfg.reset_cb = onResetCallback;
            // Boards without PSRAM (the BLE bridge) take the host stack from internal RAM.
            hostTaskWithCaps = xTaskCreatePinnedToCoreWithCaps(hostTask, "nimble_host", HOST_TASK_STACK, nullptr,
                                                               configMAX_PRIORITIES - 4, &hostTaskHandle,
                                                               CONFIG_BT_NIMBLE_PINNED_TO_CORE,
                                                               MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT) == pdPASS;
            if (!hostTaskWithCaps &&
                xTaskCreatePinnedToCore(hostTask, "nimble_host", HOST_TASK_STACK, nullptr, configMAX_PRIORITIES - 4,
                                        &hostTaskHandle, CONFIG_BT_NIMBLE_PINNED_TO_CORE) != pdPASS)
            {
                hostTaskHandle = nullptr;
                (void)nimble_port_deinit();
                return Error(Code::ReaderOffline, "host-task");
            }
        }
        if (xSemaphoreTake(syncSemaphore, pdMS_TO_TICKS(SYNC_TIMEOUT_MS)) != pdTRUE)
            return Error(Code::ReaderOffline, "no-sync");
        return Error();
    }

    Error NimbleRadio::shutdown()
    {
        if (!hostTaskHandle) return Error();
        // Not under `mutex`: stopping waits for the host task, whose GAP callbacks take it. Stopping also ends any
        // link the controller still holds after the core gave up on it.
        const int rc = nimble_port_stop();
        if (rc != 0)
        {
            char detail[sizeof(Error::detail)];
            snprintf(detail, sizeof detail, "nimble:rc=%d", rc);
            return Error(Code::Internal, detail);
        }
        synced = false;
        // nimble_port_stop() returns once the host task ran its stop event; it gives this a few instructions later.
        xSemaphoreTake(hostStopped, portMAX_DELAY);
        if (hostTaskWithCaps) vTaskDeleteWithCaps(hostTaskHandle);
        else vTaskDelete(hostTaskHandle);
        hostTaskHandle = nullptr;
        {
            std::lock_guard<std::recursive_mutex> lock(mutex);
            reset();
        }
        // Host first, then the controller (disable, deinit): their heap goes back.
        const esp_err_t err = nimble_port_deinit();
        if (err != ESP_OK) return espError(err);
        return Error();
    }

    bool NimbleRadio::active()
    {
        if (!hostTaskHandle) return false;
        std::lock_guard<std::recursive_mutex> lock(mutex);
        // NimBLE's own view of the procedures: it covers any scan, whoever started it. A host that is syncing again
        // after a controller reset counts too: its sync procedure reschedules the host timer that stopping frees.
        return conn != NO_CONN || connecting || ble_gap_disc_active() || ble_gap_conn_active() || !ble_hs_synced();
    }

    void NimbleRadio::onSync()
    {
        ble_hs_id_infer_auto(0, &ownAddressType);
        synced = true;
        xSemaphoreGive(syncSemaphore);
    }

    void NimbleRadio::reset()
    {
        conn = NO_CONN;
        connecting = false;
        abandoned = false;
        connectReported = false;
        hasPendingFailure = false;
        mtu = MIN_MTU;
        link = LinkState();
        services.clear();
        characteristics.clear();
        opToken = 0;
        opValue.clear();
    }

    // ------------------------------------------------------------------------------------------- scan

    Error NimbleRadio::startScan(uint32_t durationMs)
    {
        struct ble_gap_disc_params params = {};
        params.passive = 0; // names often come with the scan response only
        // Repeated reports: an advertisement lost to a full event queue comes again. The core deduplicates.
        params.filter_duplicates = 0;
        const int rc = ble_gap_disc(ownAddressType, static_cast<int32_t>(durationMs), &params, gapTrampoline, this);
        if (rc != 0) return mapGattStatus(rc);
        return Error();
    }

    Error NimbleRadio::startWatchScan(bool connected)
    {
        struct ble_gap_disc_params params = {};
        params.itvl = connected ? WATCH_INTERVAL_CONNECTED : WATCH_INTERVAL;
        params.window = WATCH_WINDOW;
        params.passive = 1; // no scan requests: the watch only listens
        // Every report: changes and keepalives are the point. The watch's table deduplicates.
        params.filter_duplicates = 0;
        const int rc = ble_gap_disc(ownAddressType, BLE_HS_FOREVER, &params, watchTrampoline, this);
        // BLE_HS_EALREADY: still running (the core missed nothing, it only lost track after a stale end event).
        if (rc != 0 && rc != BLE_HS_EALREADY) return mapGattStatus(rc);
        return Error();
    }

    int NimbleRadio::onWatchGapEvent(struct ble_gap_event *event)
    {
        // Scan events touch no connection state: no lock.
        switch (event->type)
        {
        case BLE_GAP_EVENT_DISC:
        {
            const auto &d = event->disc;
            events.radioAdvertisement(fromNimble(d.addr), d.rssi, d.rssi != 127, d.data, d.length_data);
            return 0;
        }
        case BLE_GAP_EVENT_DISC_COMPLETE:
            events.radioWatchScanEnded();
            return 0;
        default:
            return 0;
        }
    }

    void NimbleRadio::stopScan()
    {
        ble_gap_disc_cancel();
    }

    // ------------------------------------------------------------------------------------------- connection

    // The link is tracked until NimBLE confirms it is gone (its connect or disconnect event): `conn` and
    // `connecting` are never cleared, and no event is made up, while a link may still be up. Otherwise the real
    // event would arrive later and end the next session.

    Error NimbleRadio::connect(const Address &address, uint32_t timeoutMs, const PsVector<AllowEntry> &allow)
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        // The core may give up on a link (its release deadline) before the controller let it go: no second link
        // until then. Retryable; the terminate is asked again in case the first one failed.
        if (conn != NO_CONN || connecting)
        {
            if (conn != NO_CONN) terminate();
            return Error(Code::ReaderBusy, "link-busy");
        }
        reset();
        epoch++;
        allowlist = allow;
        peer = address;
        ble_addr_t addr;
        toNimble(address, addr);
        // A shorter interval than NimBLE's 30..50 ms default: fewer milliseconds per write and ack. The peripheral
        // may refuse it or ask for other values later (accepted, see onGapEvent).
        struct ble_gap_conn_params params = {};
        params.scan_itvl = 0x0010;
        params.scan_window = 0x0010;
        params.itvl_min = link::INTERVAL_MIN;
        params.itvl_max = link::INTERVAL_MAX;
        params.latency = link::LATENCY;
        params.supervision_timeout = link::SUPERVISION_TIMEOUT;
        const int rc = ble_gap_connect(ownAddressType, &addr, static_cast<int32_t>(timeoutMs), &params, gapTrampoline,
                                       this);
        if (rc != 0) return mapConnectFailure(rc);
        connecting = true;
        return Error();
    }

    void NimbleRadio::terminate()
    {
        // 0, BLE_HS_EALREADY (a terminate is already pending) and BLE_HS_ENOTCONN (NimBLE dropped the link and
        // deletes it before it reports the disconnect) all end in a disconnect event. Any other failure leaves the
        // link up: connect() asks again before it allows a new one.
        (void)ble_gap_terminate(conn, BLE_ERR_REM_USER_CONN_TERM);
    }

    void NimbleRadio::tuneLink()
    {
        // Requests only: a peripheral that refuses them keeps the link it has, and the session goes on.
        const int rc = ble_gap_set_data_len(conn, link::DATA_LENGTH_OCTETS, link::DATA_LENGTH_TIME_US);
        if (rc != 0) reportLink("data-length-refused", rc);
    }

    void NimbleRadio::reportLink(const char *what, int status)
    {
        struct ble_gap_conn_desc desc;
        if (ble_gap_conn_find(conn, &desc) == 0)
        {
            link.interval = desc.conn_itvl;
            link.latency = desc.conn_latency;
            link.timeout = desc.supervision_timeout;
        }
        events.radioLinkChanged(link, what, status);
    }

    void NimbleRadio::cancelConnect()
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        if (conn != NO_CONN)
        {
            // Connected but still discovering: the disconnect event reports the connect as failed.
            terminate();
            return;
        }
        if (connecting)
        {
            abandonConnect();
            return;
        }
        // Nothing pending: confirm at once so the owner is released.
        events.radioConnectFailed(Error(Code::Cancelled));
    }

    void NimbleRadio::disconnect()
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        if (conn != NO_CONN)
        {
            terminate();
            return;
        }
        if (connecting)
        {
            abandonConnect();
            return;
        }
        // Nothing to take down: confirm at once so the owner is released.
        reset();
        events.radioDisconnected(BLE_HS_ENOTCONN);
    }

    void NimbleRadio::abandonConnect()
    {
        // Whatever ble_gap_conn_cancel returns, a connect event follows: BLE_HS_EALREADY means it is already on its
        // way, any other failure ends with NimBLE's own connect timeout. A link that comes up anyway goes straight
        // down again (onGapEvent).
        abandoned = true;
        (void)ble_gap_conn_cancel();
    }

    void NimbleRadio::failConnect(const Error &error)
    {
        if (conn == NO_CONN)
        {
            connectReported = true;
            events.radioConnectFailed(error);
            return;
        }
        // Reported only once the link is down (the disconnect event), so a new connect can never meet this one's
        // disconnect. The first failure is the one that counts.
        if (!hasPendingFailure)
        {
            hasPendingFailure = true;
            pendingFailure = error;
        }
        terminate();
    }

    int NimbleRadio::onGapEvent(struct ble_gap_event *event)
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        switch (event->type)
        {
        case BLE_GAP_EVENT_DISC:
        {
            const auto &d = event->disc;
            events.radioAdvertisement(fromNimble(d.addr), d.rssi, d.rssi != 127, d.data, d.length_data);
            return 0;
        }
        case BLE_GAP_EVENT_DISC_COMPLETE:
            events.radioScanComplete();
            return 0;
        case BLE_GAP_EVENT_CONNECT:
            connecting = false;
            if (event->connect.status != 0)
            {
                connectReported = true;
                events.radioConnectFailed(mapConnectFailure(event->connect.status));
                return 0;
            }
            conn = event->connect.conn_handle;
            if (abandoned)
            {
                // The connect was cancelled but won the race: no discovery, the disconnect event reports it.
                failConnect(Error(Code::Cancelled));
                return 0;
            }
            {
                struct ble_gap_conn_desc desc;
                if (ble_gap_conn_find(conn, &desc) == 0) peer = fromNimble(desc.peer_id_addr);
            }
            reportLink("connected", 0);
            tuneLink();
            startDiscovery();
            return 0;
        case BLE_GAP_EVENT_DISCONNECT:
        {
            // Only the tracked link ends the tracked link.
            if (event->disconnect.conn.conn_handle != conn) return 0;
            const int reason = event->disconnect.reason;
            const bool reported = connectReported;
            const uint32_t token = opToken;
            const bool pending = hasPendingFailure;
            const Error failure = pendingFailure;
            reset();
            if (pending)
            {
                events.radioConnectFailed(failure);
                return 0;
            }
            if (!reported)
            {
                events.radioConnectFailed(mapConnectFailure(reason));
                return 0;
            }
            if (token) events.radioOpDone(token, Error(Code::Disconnected, "link-lost"), Bytes());
            events.radioDisconnected(reason);
            return 0;
        }
        case BLE_GAP_EVENT_MTU:
            if (event->mtu.conn_handle == conn) mtu = event->mtu.value;
            return 0;
        case BLE_GAP_EVENT_CONN_UPDATE:
            if (event->conn_update.conn_handle == conn) reportLink("conn-update", event->conn_update.status);
            return 0;
        case BLE_GAP_EVENT_L2CAP_UPDATE_REQ:
        case BLE_GAP_EVENT_CONN_UPDATE_REQ:
            // The peripheral asks for other connection parameters: accepted as they are (its battery, its call).
            return 0;
        case BLE_GAP_EVENT_DATA_LEN_CHG:
            // NimBLE leaves data_len_chg.conn_handle at 0; it calls only this link's callback, the one connection.
            link.txOctets = event->data_len_chg.max_tx_octets;
            link.rxOctets = event->data_len_chg.max_rx_octets;
            reportLink("data-length", 0);
            return 0;
        case BLE_GAP_EVENT_PHY_UPDATE_COMPLETE:
            if (event->phy_updated.conn_handle != conn) return 0;
            if (event->phy_updated.status == 0)
            {
                link.txPhy = event->phy_updated.tx_phy;
                link.rxPhy = event->phy_updated.rx_phy;
            }
            reportLink("phy", event->phy_updated.status);
            return 0;
        case BLE_GAP_EVENT_NOTIFY_RX:
        {
            const auto &n = event->notify_rx;
            if (n.conn_handle != conn) return 0;
            for (const Characteristic &c : characteristics)
            {
                if (c.valHandle != n.attr_handle) continue;
                const uint16_t length = OS_MBUF_PKTLEN(n.om);
                uint8_t data[MAX_PAYLOAD_BYTES];
                const uint16_t copied = std::min<uint16_t>(length, sizeof data);
                os_mbuf_copydata(n.om, 0, copied, data);
                events.radioNotification(c.service, c.uuid, data, length);
                break;
            }
            return 0;
        }
        default:
            return 0;
        }
    }
}

#endif
