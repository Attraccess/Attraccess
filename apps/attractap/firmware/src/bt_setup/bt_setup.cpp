#include "bt_setup.hpp"

#if ATTRACTAP_BT_SETUP

// Before NimBLE's headers: its log macros (LOG_LEVEL_ERROR, ...) would break the logger's enum.
#include "../logger/logger.hpp"
#include "../platform.hpp"
#include "../serial/serialCommandHandler.hpp"
#include "../settings/reader_credentials.hpp"
#include "bt_setup_logic.hpp"

#include <atomic>
#include <cstdio>
#include <deque>
#include <mutex>
#include <cstring>
#include <string>

#include "esp_mac.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "host/ble_gap.h"
#include "host/ble_gatt.h"
#include "host/ble_hs.h"
#include "host/ble_store.h"
#include "nimble/nimble_port.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

#if !CONFIG_BT_NIMBLE_ROLE_PERIPHERAL || !CONFIG_BT_NIMBLE_ROLE_BROADCASTER || !CONFIG_BT_NIMBLE_SECURITY_ENABLE ||  \
    !CONFIG_BT_NIMBLE_SM_SC
#error "The Bluetooth setup needs the NimBLE peripheral and broadcaster roles and LE Secure Connections (sdkconfig)"
#endif
// Per variant (variants/*.cmake): "Attractap Bridge", "Attractap Touch", "Attractap Lite".
#ifndef BT_SETUP_NAME_PREFIX
#error "BT_SETUP_NAME_PREFIX must be defined by the variant"
#endif

extern "C" void ble_store_config_init(void);

namespace bt_setup
{
    namespace
    {
        constexpr uint32_t HOST_TASK_STACK = 4096;
        // Complete lines waiting for the main loop; the web app sends one command and waits for its reply.
        constexpr size_t MAX_QUEUED_LINES = 4;
        // A notification refused for lack of buffers is retried this often, this many times.
        constexpr TickType_t NOTIFY_RETRY_WAIT = pdMS_TO_TICKS(10);
        constexpr int NOTIFY_RETRIES = 100;
        constexpr uint16_t MIN_MTU = 23;
        constexpr uint16_t ADV_INTERVAL = 160; // 100 ms in 0.625 ms units: found quickly, little air time

        Logger logger("BtSetup");

        // 2665a001-44cd-4fe2-a450-916b627619d7 and its characteristics ...a002 (RX) and ...a003 (TX), least
        // significant byte first.
#define ATTRACTAP_SETUP_UUID(b)                                                                                     \
    BLE_UUID128_INIT(0xd7, 0x19, 0x76, 0x62, 0x6b, 0x91, 0x50, 0xa4, 0xe2, 0x4f, 0xcd, 0x44, b, 0xa0, 0x65, 0x26)
        const ble_uuid128_t SERVICE_UUID = ATTRACTAP_SETUP_UUID(0x01);
        const ble_uuid128_t RX_UUID = ATTRACTAP_SETUP_UUID(0x02);
        const ble_uuid128_t TX_UUID = ATTRACTAP_SETUP_UUID(0x03);
#undef ATTRACTAP_SETUP_UUID

        // The window (the task of request() and update()) and its mirrors for other tasks.
        SetupWindow window;
        std::atomic<bool> windowOpen{false};
        // Until the first request read the credentials, the device counts as paired (no button).
        std::atomic<bool> paired{true};

        // NimBLE belongs to the setup from the start of open() to the end of close().
        std::atomic<bool> owned{false};
        // Advertising and the link are wanted (cleared first when closing).
        std::atomic<bool> running{false};
        std::atomic<bool> connected{false};
        std::atomic<uint16_t> connHandle{BLE_HS_CONN_HANDLE_NONE};
        uint16_t txHandle = 0;
        uint8_t ownAddressType = BLE_OWN_ADDR_RANDOM;
        char deviceName[MAX_NAME_LENGTH + 1] = "";
        // NimBLE's host configuration before open() changed it. close() restores it, so the BLE proxy, which brings
        // NimBLE up again later, starts as a plain central: no pairing setup, no bond store, none of our callbacks.
        struct ble_hs_cfg savedHsCfg;

        std::mutex linesMutex;
        LineAssembler assembler(SerialCommandHandler::MAX_COMMAND_LENGTH);
        std::deque<std::string> lines;

        int gapEvent(struct ble_gap_event *event, void *arg);

        void startAdvertising()
        {
            if (!running || connected) return;
            struct ble_hs_adv_fields fields = {};
            fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
            fields.uuids128 = &SERVICE_UUID;
            fields.num_uuids128 = 1;
            fields.uuids128_is_complete = 1;
            int rc = ble_gap_adv_set_fields(&fields);
            if (rc == 0)
            {
                struct ble_hs_adv_fields response = {};
                response.name = reinterpret_cast<const uint8_t *>(deviceName);
                response.name_len = strlen(deviceName);
                response.name_is_complete = 1;
                rc = ble_gap_adv_rsp_set_fields(&response);
            }
            if (rc == 0)
            {
                struct ble_gap_adv_params params = {};
                params.conn_mode = BLE_GAP_CONN_MODE_UND;
                params.disc_mode = BLE_GAP_DISC_MODE_GEN;
                params.itvl_min = ADV_INTERVAL;
                params.itvl_max = ADV_INTERVAL;
                rc = ble_gap_adv_start(ownAddressType, nullptr, BLE_HS_FOREVER, &params, gapEvent, nullptr);
            }
            if (rc != 0 && rc != BLE_HS_EALREADY) logger.errorf("Advertising failed: %d", rc);
        }

        void onSync()
        {
            // A new random static address for every window: a computer that paired with an earlier window holds keys
            // the device no longer has, and would fail to encrypt instead of pairing again.
            ble_addr_t address;
            if (ble_hs_id_gen_rnd(0, &address) == 0 && ble_hs_id_set_rnd(address.val) == 0)
                ownAddressType = BLE_OWN_ADDR_RANDOM;
            else
                ble_hs_id_infer_auto(0, &ownAddressType);
            startAdvertising();
            logger.infof("Bluetooth setup open as \"%s\"", deviceName);
        }

        void onReset(int reason) { logger.warnf("NimBLE reset: %d", reason); }

        void forgetPartialInput()
        {
            std::lock_guard<std::mutex> lock(linesMutex);
            assembler.reset();
            lines.clear();
        }

        int gapEvent(struct ble_gap_event *event, void *)
        {
            switch (event->type)
            {
            case BLE_GAP_EVENT_CONNECT:
                if (event->connect.status == 0)
                {
                    connHandle = event->connect.conn_handle;
                    connected = true;
                    forgetPartialInput();
                    logger.info("Web app connected");
                }
                else
                {
                    startAdvertising();
                }
                return 0;
            case BLE_GAP_EVENT_DISCONNECT:
                connected = false;
                connHandle = BLE_HS_CONN_HANDLE_NONE;
                forgetPartialInput();
                logger.infof("Web app disconnected (%d)", event->disconnect.reason);
                startAdvertising();
                return 0;
            case BLE_GAP_EVENT_ADV_COMPLETE:
                startAdvertising();
                return 0;
            case BLE_GAP_EVENT_ENC_CHANGE:
                if (event->enc_change.status != 0) logger.warnf("Pairing failed: %d", event->enc_change.status);
                return 0;
            case BLE_GAP_EVENT_REPEAT_PAIRING:
            {
                // The computer lost its keys and pairs again: drop the old bond and let it.
                struct ble_gap_conn_desc desc;
                if (ble_gap_conn_find(event->repeat_pairing.conn_handle, &desc) == 0) ble_store_util_delete_peer(&desc.peer_id_addr);
                return BLE_GAP_REPEAT_PAIRING_RETRY;
            }
            default:
                return 0;
            }
        }

        // RX: the encryption requirement (BLE_GATT_CHR_F_WRITE_ENC) is checked by NimBLE before this runs.
        int access(uint16_t, uint16_t, struct ble_gatt_access_ctxt *ctxt, void *)
        {
            if (ctxt->op != BLE_GATT_ACCESS_OP_WRITE_CHR) return BLE_ATT_ERR_UNLIKELY;
            uint8_t buffer[512];
            uint16_t length = 0;
            if (ble_hs_mbuf_to_flat(ctxt->om, buffer, sizeof buffer, &length) != 0) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
            std::lock_guard<std::mutex> lock(linesMutex);
            bool full = false;
            assembler.feed(buffer, length, [&](const std::string &line) {
                if (lines.size() < MAX_QUEUED_LINES) lines.push_back(line);
                else full = true;
            });
            if (full) logger.error("Setup command dropped: the previous ones are still running");
            return 0;
        }

        // Filled by defineServices(): NimBLE's structs gain members between releases, and every one must be zero.
        struct ble_gatt_chr_def characteristics[3];
        struct ble_gatt_svc_def services[2];

        void defineServices()
        {
            memset(characteristics, 0, sizeof characteristics);
            memset(services, 0, sizeof services);
            characteristics[0].uuid = &RX_UUID.u;
            characteristics[0].access_cb = access;
            characteristics[0].flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_ENC;
            characteristics[1].uuid = &TX_UUID.u;
            characteristics[1].access_cb = access;
            characteristics[1].flags = BLE_GATT_CHR_F_NOTIFY;
            characteristics[1].val_handle = &txHandle;
            services[0].type = BLE_GATT_SVC_TYPE_PRIMARY;
            services[0].uuid = &SERVICE_UUID.u;
            services[0].characteristics = characteristics;
        }

        void hostTask(void *)
        {
            nimble_port_run(); // until close() calls nimble_port_stop()
            vTaskDelete(nullptr);
        }

        // NimBLE's host task, its 4 KB stack in internal RAM as on the bridge: pairing runs the P-256 key generation on
        // it, and NimBLE's own port keeps its host stack internal too.
        bool startHostTask()
        {
            return xTaskCreatePinnedToCore(hostTask, "nimble_host", HOST_TASK_STACK, nullptr, configMAX_PRIORITIES - 4,
                                           nullptr, CONFIG_BT_NIMBLE_PINNED_TO_CORE) == pdPASS;
        }

        bool notify(uint16_t conn, const char *data, size_t size)
        {
            for (int attempt = 0; attempt < NOTIFY_RETRIES; attempt++)
            {
                if (!connected || connHandle != conn) return false;
                struct os_mbuf *om = ble_hs_mbuf_from_flat(data, size);
                // ble_gatts_notify_custom() frees the buffer, also on failure.
                const int rc = om ? ble_gatts_notify_custom(conn, txHandle, om) : BLE_HS_ENOMEM;
                if (rc == 0) return true;
                if (rc != BLE_HS_ENOMEM && rc != BLE_HS_EBUSY) return false;
                vTaskDelay(NOTIFY_RETRY_WAIT);
            }
            return false;
        }

        class SetupChannel : public SerialCommandHandler::Channel
        {
        public:
            bool nextLine(std::string &line) override
            {
                std::lock_guard<std::mutex> lock(linesMutex);
                if (lines.empty()) return false;
                line = std::move(lines.front());
                lines.pop_front();
                return true;
            }

            void reply(const std::string &line) override
            {
                const uint16_t conn = connHandle;
                if (!connected || conn == BLE_HS_CONN_HANDLE_NONE) return;
                uint16_t mtu = ble_att_mtu(conn);
                if (mtu < MIN_MTU) mtu = MIN_MTU;
                if (!forEachChunk(line.size(), mtu - 3,
                                  [&](size_t offset, size_t size) { return notify(conn, line.data() + offset, size); }))
                    logger.error("Setup reply lost");
            }
        };

        SetupChannel setupChannel;

        // Brings NimBLE up and advertises. False when there is not enough memory (nothing stays allocated).
        bool open()
        {
            if (owned) return true;
            owned = true;
            uint8_t mac[6] = {};
            esp_read_mac(mac, ESP_MAC_BT);
            formatName(deviceName, sizeof deviceName, BT_SETUP_NAME_PREFIX, mac);
            forgetPartialInput();

            if (nimble_port_init() != ESP_OK)
            {
                // Also when the BLE proxy already runs NimBLE (a device whose pairing was revoked): a reboot frees it.
                logger.error("Bluetooth setup: NimBLE init failed");
                owned = false;
                return false;
            }
            savedHsCfg = ble_hs_cfg;
            ble_hs_cfg.sync_cb = onSync;
            ble_hs_cfg.reset_cb = onReset;
            ble_hs_cfg.store_status_cb = ble_store_util_status_rr;
            // Just Works with LE Secure Connections: no display or keypad takes part in the pairing.
            ble_hs_cfg.sm_io_cap = BLE_HS_IO_NO_INPUT_OUTPUT;
            ble_hs_cfg.sm_bonding = 1;
            ble_hs_cfg.sm_mitm = 0;
            ble_hs_cfg.sm_sc = 1;
            ble_hs_cfg.sm_our_key_dist = BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;
            ble_hs_cfg.sm_their_key_dist = BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;

            ble_gatts_reset();
            ble_svc_gap_init();
            ble_svc_gatt_init();
            defineServices();
            int rc = ble_gatts_count_cfg(services);
            if (rc == 0) rc = ble_gatts_add_svcs(services);
            if (rc == 0) rc = ble_svc_gap_device_name_set(deviceName);
            ble_store_config_init();
            running = true;
            if (rc != 0 || !startHostTask())
            {
                running = false;
                logger.errorf("Bluetooth setup: not enough memory (%d)", rc);
                nimble_port_deinit();
                ble_hs_cfg = savedHsCfg;
                owned = false;
                return false;
            }
            return true;
        }

        // Drops the link, stops advertising and frees NimBLE.
        void close()
        {
            if (!owned) return;
            running = false;
            const uint16_t conn = connHandle;
            if (conn != BLE_HS_CONN_HANDLE_NONE) ble_gap_terminate(conn, BLE_ERR_REM_USER_CONN_TERM);
            ble_gap_adv_stop();
            // Let the terminate go out before the host stops.
            delay(200);
            nimble_port_stop();
            nimble_port_deinit();
            ble_hs_cfg = savedHsCfg;
            connected = false;
            connHandle = BLE_HS_CONN_HANDLE_NONE;
            forgetPartialInput();
            owned = false;
            logger.info("Bluetooth setup closed");
        }
    }

    void registerChannel() { SerialCommandHandler::setChannel(&setupChannel); }

    Request request(uint32_t now)
    {
        const bool isPaired = CredentialStore::load().paired();
        paired = isPaired;
        if (isPaired) return Request::Paired;
        if (window.request(false, now) != SetupWindow::Change::Open) return Request::AlreadyOpen;
        if (!open())
        {
            window = SetupWindow();
            return Request::NoMemory;
        }
        windowOpen = true;
        return Request::Opened;
    }

    void update(bool authenticated, uint32_t now)
    {
        if (authenticated) paired = true;
        if (window.update(authenticated, now) != SetupWindow::Change::Close) return;
        windowOpen = false;
        close();
    }

    bool isOpen() { return windowOpen; }

    bool linked() { return running && connected; }

    uint32_t remainingMs(uint32_t now) { return window.remainingMs(now); }

    const char *name() { return deviceName; }

    bool offerButton() { return buttonVisible(paired, windowOpen); }

    bool active() { return owned; }
}

#else

namespace bt_setup
{
    void registerChannel() {}
    Request request(uint32_t) { return Request::Unsupported; }
    void update(bool, uint32_t) {}
    bool isOpen() { return false; }
    bool linked() { return false; }
    uint32_t remainingMs(uint32_t) { return 0; }
    const char *name() { return ""; }
    bool offerButton() { return false; }
    bool active() { return false; }
}

#endif
