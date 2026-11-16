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

#include "ble_adv.hpp"
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
        constexpr uint16_t NO_CONN = 0xffff;
        constexpr uint16_t CCCD_UUID = 0x2902;
        constexpr uint32_t SYNC_TIMEOUT_MS = 3000;
        // NimBLE's own host task, like nimble_port_freertos_init but with its stack in PSRAM.
        constexpr uint32_t HOST_TASK_STACK = 4096;

        NimbleRadio *instance = nullptr;
        SemaphoreHandle_t syncSemaphore = nullptr;

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

        Uuid fromNimble(const ble_uuid_t *uuid)
        {
            switch (uuid->type)
            {
            case BLE_UUID_TYPE_16:
                return uuidFromShort(BLE_UUID16(uuid)->value);
            case BLE_UUID_TYPE_32:
                return uuidFromShort(BLE_UUID32(uuid)->value);
            default:
            {
                Uuid out;
                for (int k = 0; k < 16; k++) out.b[k] = BLE_UUID128(uuid)->value[15 - k];
                return out;
            }
            }
        }

        // The shortest form, so "Discover Primary Service by UUID" matches a 16-bit service.
        void toNimble(const Uuid &uuid, ble_uuid_any_t &out)
        {
            const Uuid base = uuidFromShort(0);
            const bool isBase = std::memcmp(uuid.b + 4, base.b + 4, 12) == 0;
            if (isBase && uuid.b[0] == 0 && uuid.b[1] == 0)
            {
                out.u16.u.type = BLE_UUID_TYPE_16;
                out.u16.value = static_cast<uint16_t>(uuid.b[2] << 8 | uuid.b[3]);
                return;
            }
            out.u128.u.type = BLE_UUID_TYPE_128;
            for (int k = 0; k < 16; k++) out.u128.value[k] = uuid.b[15 - k];
        }

        int gapTrampoline(struct ble_gap_event *event, void *arg)
        {
            return static_cast<NimbleRadio *>(arg)->onGapEvent(event);
        }
        int mtuTrampoline(uint16_t conn, const struct ble_gatt_error *error, uint16_t mtu, void *arg)
        {
            return static_cast<NimbleRadio *>(arg)->onMtu(conn, error, mtu);
        }
        int serviceTrampoline(uint16_t conn, const struct ble_gatt_error *error, const struct ble_gatt_svc *svc, void *arg)
        {
            return static_cast<NimbleRadio *>(arg)->onService(conn, error, svc);
        }
        int chrTrampoline(uint16_t conn, const struct ble_gatt_error *error, const struct ble_gatt_chr *chr, void *arg)
        {
            return static_cast<NimbleRadio *>(arg)->onCharacteristic(conn, error, chr);
        }
        int dscTrampoline(uint16_t conn, const struct ble_gatt_error *error, uint16_t chrValHandle,
                          const struct ble_gatt_dsc *dsc, void *arg)
        {
            return static_cast<NimbleRadio *>(arg)->onDescriptor(conn, error, chrValHandle, dsc);
        }
        int readTrampoline(uint16_t conn, const struct ble_gatt_error *error, struct ble_gatt_attr *attr, void *arg)
        {
            return static_cast<NimbleRadio *>(arg)->onRead(conn, error, attr);
        }
        int writeTrampoline(uint16_t conn, const struct ble_gatt_error *error, struct ble_gatt_attr *attr, void *arg)
        {
            return static_cast<NimbleRadio *>(arg)->onWrite(conn, error, attr);
        }

        void hostTask(void *)
        {
            nimble_port_run(); // returns only after nimble_port_stop(), which this firmware never calls
            vTaskDeleteWithCaps(nullptr);
        }

        void onSyncCallback()
        {
            if (instance) instance->onSync();
        }

        void onResetCallback(int reason)
        {
            (void)reason; // the controller dropped every link: the disconnect events report it
        }

        IBleRadio::Start startResult(int rc, Error &error)
        {
            if (rc == 0) return IBleRadio::Start::Pending;
            if (rc == BLE_HS_ENOMEM) return IBleRadio::Start::Retry;
            error = mapGattStatus(rc);
            return IBleRadio::Start::Failed;
        }
    }

    Error NimbleRadio::init()
    {
        if (synced) return Error();
        if (!syncSemaphore) syncSemaphore = xSemaphoreCreateBinary();
        instance = this;
        const esp_err_t err = nimble_port_init();
        if (err != ESP_OK)
        {
            char detail[sizeof(Error::detail)];
            snprintf(detail, sizeof detail, "esp:0x%x", static_cast<unsigned>(err));
            return Error(Code::ReaderOffline, detail);
        }
        ble_hs_cfg.sync_cb = onSyncCallback;
        ble_hs_cfg.reset_cb = onResetCallback;
        if (xTaskCreatePinnedToCoreWithCaps(hostTask, "nimble_host", HOST_TASK_STACK, nullptr, configMAX_PRIORITIES - 4,
                                            nullptr, CONFIG_BT_NIMBLE_PINNED_TO_CORE,
                                            MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT) != pdPASS)
            return Error(Code::ReaderOffline, "host-task");
        if (xSemaphoreTake(syncSemaphore, pdMS_TO_TICKS(SYNC_TIMEOUT_MS)) != pdTRUE)
            return Error(Code::ReaderOffline, "no-sync");
        return Error();
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
        connectReported = false;
        hasPendingFailure = false;
        mtu = MIN_MTU;
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
        params.filter_duplicates = 1;
        const int rc = ble_gap_disc(ownAddressType, static_cast<int32_t>(durationMs), &params, gapTrampoline, this);
        if (rc != 0) return mapGattStatus(rc);
        return Error();
    }

    void NimbleRadio::stopScan()
    {
        ble_gap_disc_cancel();
    }

    // ------------------------------------------------------------------------------------------- connection

    Error NimbleRadio::connect(const Address &address, uint32_t timeoutMs, const PsVector<AllowEntry> &allow)
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        reset();
        allowlist = allow;
        peer = address;
        ble_addr_t addr;
        toNimble(address, addr);
        const int rc = ble_gap_connect(ownAddressType, &addr, static_cast<int32_t>(timeoutMs), nullptr, gapTrampoline,
                                       this);
        if (rc != 0) return mapConnectFailure(rc);
        connecting = true;
        return Error();
    }

    void NimbleRadio::cancelConnect()
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        if (conn != NO_CONN)
        {
            // Connected but still discovering: the link goes down, its disconnect event confirms.
            if (ble_gap_terminate(conn, BLE_ERR_REM_USER_CONN_TERM) != 0) events.radioConnectFailed(Error(Code::Cancelled));
            return;
        }
        if (!connecting || ble_gap_conn_cancel() != 0) events.radioConnectFailed(Error(Code::Cancelled));
    }

    void NimbleRadio::disconnect()
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        if (conn != NO_CONN && ble_gap_terminate(conn, BLE_ERR_REM_USER_CONN_TERM) == 0) return;
        if (conn == NO_CONN && connecting && ble_gap_conn_cancel() == 0) return;
        // Nothing to take down: confirm at once so the owner is released.
        reset();
        events.radioDisconnected(BLE_HS_ENOTCONN);
    }

    void NimbleRadio::failConnect(const Error &error)
    {
        // Reported only once the link is down, so a new connect can never meet this one's disconnect event.
        if (conn != NO_CONN && ble_gap_terminate(conn, BLE_ERR_REM_USER_CONN_TERM) == 0)
        {
            hasPendingFailure = true;
            pendingFailure = error;
            return;
        }
        connectReported = true;
        events.radioConnectFailed(error);
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
            {
                struct ble_gap_conn_desc desc;
                if (ble_gap_conn_find(conn, &desc) == 0) peer = fromNimble(desc.peer_id_addr);
            }
            // Ask for the largest MTU first: bulk writes without response depend on it.
            if (ble_gattc_exchange_mtu(conn, mtuTrampoline, this) != 0)
            {
                mtu = ble_att_mtu(conn);
                discoveryService = 0;
                discoverNextService();
            }
            return 0;
        case BLE_GAP_EVENT_DISCONNECT:
        {
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

    int NimbleRadio::onMtu(uint16_t c, const struct ble_gatt_error *error, uint16_t value)
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        if (c != conn) return 0;
        // A peripheral that refuses the exchange keeps the default 23.
        mtu = error->status == 0 ? value : ble_att_mtu(conn);
        discoveryService = 0;
        services.clear();
        for (const AllowEntry &entry : allowlist)
        {
            const bool known = std::any_of(services.begin(), services.end(),
                                           [&](const Service &s) { return s.uuid == entry.service; });
            if (!known)
            {
                Service service;
                service.uuid = entry.service;
                services.push_back(service);
            }
        }
        discoverNextService();
        return 0;
    }

    void NimbleRadio::discoverNextService()
    {
        if (discoveryService >= services.size())
        {
            discoveryCharacteristic = 0;
            discoverNextDescriptor();
            return;
        }
        ble_uuid_any_t uuid;
        toNimble(services[discoveryService].uuid, uuid);
        const int rc = ble_gattc_disc_svc_by_uuid(conn, &uuid.u, serviceTrampoline, this);
        if (rc != 0) failConnect(mapGattStatus(rc));
    }

    int NimbleRadio::onService(uint16_t c, const struct ble_gatt_error *error, const struct ble_gatt_svc *svc)
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        if (c != conn || discoveryService >= services.size()) return 0;
        Service &service = services[discoveryService];
        if (error->status == 0 && svc)
        {
            service.start = svc->start_handle;
            service.end = svc->end_handle;
            service.found = true;
            return 0;
        }
        if (error->status != BLE_HS_EDONE)
        {
            failConnect(mapGattStatus(error->status));
            return 0;
        }
        if (!service.found)
        {
            // Missing services are no connect failure: operations on them report characteristic-not-found.
            discoveryService++;
            discoverNextService();
            return 0;
        }
        const int rc = ble_gattc_disc_all_chrs(conn, service.start, service.end, chrTrampoline, this);
        if (rc != 0) failConnect(mapGattStatus(rc));
        return 0;
    }

    int NimbleRadio::onCharacteristic(uint16_t c, const struct ble_gatt_error *error, const struct ble_gatt_chr *chr)
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        if (c != conn || discoveryService >= services.size()) return 0;
        const Service &service = services[discoveryService];
        if (error->status == 0 && chr)
        {
            // The previous characteristic ends right before this one's declaration.
            for (Characteristic &known : characteristics)
                if (known.service == service.uuid && known.endHandle == service.end && known.defHandle < chr->def_handle)
                    known.endHandle = chr->def_handle - 1;
            const Uuid uuid = fromNimble(&chr->uuid.u);
            for (const AllowEntry &entry : allowlist)
            {
                if (entry.service != service.uuid || entry.characteristic != uuid) continue;
                Characteristic found;
                found.service = service.uuid;
                found.uuid = uuid;
                found.defHandle = chr->def_handle;
                found.valHandle = chr->val_handle;
                found.endHandle = service.end;
                found.wantsCccd = entry.ops & (OP_NOTIFY | OP_INDICATE);
                characteristics.push_back(found);
                break;
            }
            return 0;
        }
        if (error->status != BLE_HS_EDONE)
        {
            failConnect(mapGattStatus(error->status));
            return 0;
        }
        discoveryService++;
        discoverNextService();
        return 0;
    }

    void NimbleRadio::discoverNextDescriptor()
    {
        while (discoveryCharacteristic < characteristics.size())
        {
            const Characteristic &c = characteristics[discoveryCharacteristic];
            if (c.wantsCccd && c.endHandle > c.valHandle)
            {
                const int rc = ble_gattc_disc_all_dscs(conn, c.valHandle, c.endHandle, dscTrampoline, this);
                if (rc != 0) failConnect(mapGattStatus(rc));
                return;
            }
            discoveryCharacteristic++;
        }
        finishDiscovery();
    }

    int NimbleRadio::onDescriptor(uint16_t c, const struct ble_gatt_error *error, uint16_t chrValHandle,
                                  const struct ble_gatt_dsc *dsc)
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        if (c != conn || discoveryCharacteristic >= characteristics.size()) return 0;
        Characteristic &characteristic = characteristics[discoveryCharacteristic];
        if (error->status == 0 && dsc)
        {
            if (dsc->uuid.u.type == BLE_UUID_TYPE_16 && ble_uuid_u16(&dsc->uuid.u) == CCCD_UUID) characteristic.cccdHandle = dsc->handle;
            (void)chrValHandle;
            return 0;
        }
        if (error->status != BLE_HS_EDONE)
        {
            failConnect(mapGattStatus(error->status));
            return 0;
        }
        discoveryCharacteristic++;
        discoverNextDescriptor();
        return 0;
    }

    void NimbleRadio::finishDiscovery()
    {
        connectReported = true;
        events.radioConnected(peer, mtu);
    }

    // ------------------------------------------------------------------------------------------- GATT

    const NimbleRadio::Characteristic *NimbleRadio::find(const Uuid &service, const Uuid &characteristic)
    {
        for (const Characteristic &c : characteristics)
            if (c.service == service && c.uuid == characteristic) return &c;
        return nullptr;
    }

    IBleRadio::Start NimbleRadio::read(uint32_t token, const Uuid &service, const Uuid &characteristic, Error &error)
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        const Characteristic *c = find(service, characteristic);
        if (!c)
        {
            error = Error(Code::GattError, "characteristic-not-found");
            return Start::Failed;
        }
        opToken = token;
        opValue.clear();
        const Start start = startResult(ble_gattc_read_long(conn, c->valHandle, 0, readTrampoline, this), error);
        if (start != Start::Pending) opToken = 0;
        return start;
    }

    int NimbleRadio::onRead(uint16_t c, const struct ble_gatt_error *error, struct ble_gatt_attr *attr)
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        if (c != conn || !opToken) return 0;
        if (error->status == 0 && attr)
        {
            // Read long arrives in pieces. One byte past the protocol bound is enough to refuse it.
            const uint16_t length = OS_MBUF_PKTLEN(attr->om);
            const size_t room = MAX_PAYLOAD_BYTES + 1 - std::min(opValue.size(), MAX_PAYLOAD_BYTES + 1);
            const uint16_t take = std::min<uint16_t>(length, static_cast<uint16_t>(room));
            const size_t offset = opValue.size();
            opValue.resize(offset + take);
            os_mbuf_copydata(attr->om, 0, take, opValue.data() + offset);
            return 0;
        }
        const uint32_t token = opToken;
        opToken = 0;
        Bytes value = std::move(opValue);
        opValue = Bytes();
        events.radioOpDone(token, error->status == BLE_HS_EDONE ? Error() : mapGattStatus(error->status),
                           std::move(value));
        return 0;
    }

    IBleRadio::Start NimbleRadio::write(uint32_t token, const Uuid &service, const Uuid &characteristic,
                                        const Bytes &value, bool withoutResponse, Error &error)
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        const Characteristic *c = find(service, characteristic);
        if (!c)
        {
            error = Error(Code::GattError, "characteristic-not-found");
            return Start::Failed;
        }
        const uint16_t length = static_cast<uint16_t>(value.size());
        if (withoutResponse)
        {
            const int rc = ble_gattc_write_no_rsp_flat(conn, c->valHandle, value.data(), length);
            if (rc == 0) return Start::Done;
            return startResult(rc, error);
        }
        opToken = token;
        int rc;
        if (length + 3 <= mtu)
        {
            rc = ble_gattc_write_flat(conn, c->valHandle, value.data(), length, writeTrampoline, this);
        }
        else
        {
            // Longer than one packet: the long-write (prepare/execute) procedure.
            struct os_mbuf *om = ble_hs_mbuf_from_flat(value.data(), length);
            rc = om ? ble_gattc_write_long(conn, c->valHandle, 0, om, writeTrampoline, this) : BLE_HS_ENOMEM;
        }
        const Start start = startResult(rc, error);
        if (start != Start::Pending) opToken = 0;
        return start;
    }

    IBleRadio::Start NimbleRadio::setNotifications(uint32_t token, const Uuid &service, const Uuid &characteristic,
                                                   uint8_t mode, Error &error)
    {
        std::lock_guard<std::recursive_mutex> lock(mutex);
        const Characteristic *c = find(service, characteristic);
        if (!c || !c->cccdHandle)
        {
            error = Error(Code::GattError, c ? "cccd-not-found" : "characteristic-not-found");
            return Start::Failed;
        }
        const uint8_t value[2] = {mode, 0};
        opToken = token;
        const Start start =
            startResult(ble_gattc_write_flat(conn, c->cccdHandle, value, sizeof value, writeTrampoline, this), error);
        if (start != Start::Pending) opToken = 0;
        return start;
    }

    int NimbleRadio::onWrite(uint16_t c, const struct ble_gatt_error *error, struct ble_gatt_attr *attr)
    {
        (void)attr;
        std::lock_guard<std::recursive_mutex> lock(mutex);
        if (c != conn || !opToken) return 0;
        const uint32_t token = opToken;
        opToken = 0;
        events.radioOpDone(token, mapGattStatus(error->status), Bytes());
        return 0;
    }
}

#endif
