#ifdef ATTRACTAP_BLE_BRIDGE

#include "provisioning.hpp"

#include <atomic>
#include <cstdio>
#include <deque>
#include <mutex>
#include <cstring>
#include <string>

#include "esp_heap_caps.h"
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

#include "../logger/logger.hpp"
#include "../platform.hpp"
#include "provisioning_logic.hpp"

extern "C" void ble_store_config_init(void);

namespace bridge::provisioning
{
    namespace
    {
        // As the BLE proxy's host task (ble_radio_nimble.cpp, measured in QA); the setup adds LE Secure Connections
        // pairing, whose key maths runs on this task too.
        constexpr uint32_t HOST_TASK_STACK = 4864;
        // Free DMA-capable internal RAM NimBLE needs to start: the controller asserts and the bridge restarts when it
        // runs short (see STACK_MIN_FREE_INTERNAL in ble_radio_nimble.cpp).
        constexpr size_t MIN_FREE_INTERNAL = 40 * 1024;
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

        // NimBLE belongs to the setup from the start of open() to the end of close().
        std::atomic<bool> owned{false};
        // Advertising and the link are wanted (cleared first when closing).
        std::atomic<bool> running{false};
        std::atomic<bool> connected{false};
        std::atomic<uint16_t> connHandle{BLE_HS_CONN_HANDLE_NONE};
        uint16_t txHandle = 0;
        uint8_t ownAddressType = BLE_OWN_ADDR_RANDOM;
        char deviceName[24] = "Attractap Bridge";
        TaskHandle_t hostTaskHandle = nullptr;

        // Counts links: a reply goes only to the link its command came from.
        std::atomic<uint32_t> linkGeneration{0};

        std::mutex linesMutex;
        LineAssembler assembler(SerialCommandHandler::MAX_COMMAND_LENGTH);
        // Complete lines and the link they came from.
        std::deque<std::pair<uint32_t, std::string>> lines;
        // The link of the line the main loop is handling now.
        uint32_t lineGeneration = 0;

        // Wrong PINs and idle links (provisioning_logic.hpp); touched by the host, main and bridge tasks.
        std::mutex guardMutex;
        LinkGuard guard;

        // Held while sending a reply and while closing: close() must not free NimBLE under a notification.
        std::mutex txMutex;

        // ble_hs_cfg as the BLE proxy expects it: the setup's pairing settings must not outlive the setup.
        struct ble_hs_cfg savedHostConfig;

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
            // the bridge no longer has, and would fail to encrypt instead of pairing again.
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
                    forgetPartialInput();
                    linkGeneration++;
                    {
                        std::lock_guard<std::mutex> lock(guardMutex);
                        guard.connected(millis());
                        connHandle = event->connect.conn_handle;
                    }
                    connected = true;
                    logger.info("Web app connected");
                }
                else
                {
                    startAdvertising();
                }
                return 0;
            case BLE_GAP_EVENT_DISCONNECT:
                connected = false;
                linkGeneration++;
                {
                    std::lock_guard<std::mutex> lock(guardMutex);
                    connHandle = BLE_HS_CONN_HANDLE_NONE;
                    guard.disconnected();
                }
                forgetPartialInput();
                logger.infof("Web app disconnected (%d)", event->disconnect.reason);
                startAdvertising();
                return 0;
            case BLE_GAP_EVENT_ADV_COMPLETE:
                startAdvertising();
                return 0;
            case BLE_GAP_EVENT_ENC_CHANGE:
                if (event->enc_change.status != 0)
                {
                    logger.warnf("Pairing failed: %d", event->enc_change.status);
                    return 0;
                }
                {
                    std::lock_guard<std::mutex> lock(guardMutex);
                    guard.encryptedNow();
                }
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
            {
                std::lock_guard<std::mutex> lock(guardMutex);
                if (guard.lockedOut()) return BLE_ATT_ERR_WRITE_NOT_PERMITTED;
                // A write gets here only on an encrypted link (ENC_CHANGE may still be on its way: key exchange).
                guard.encryptedNow();
                guard.command(millis());
            }
            // Only the NimBLE host task calls this: one buffer, off its small stack.
            static uint8_t buffer[512];
            uint16_t length = 0;
            if (ble_hs_mbuf_to_flat(ctxt->om, buffer, sizeof buffer, &length) != 0) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
            const uint32_t generation = linkGeneration;
            std::lock_guard<std::mutex> lock(linesMutex);
            bool full = false;
            assembler.feed(buffer, length, [&](const std::string &line) {
                if (lines.size() < MAX_QUEUED_LINES) lines.emplace_back(generation, line);
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
            hostTaskHandle = nullptr;
            vTaskDelete(nullptr);
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
                {
                    // Lines queued before the lockout do not get more PIN guesses in.
                    std::lock_guard<std::mutex> lock(guardMutex);
                    if (guard.lockedOut()) return false;
                }
                std::lock_guard<std::mutex> lock(linesMutex);
                if (lines.empty()) return false;
                lineGeneration = lines.front().first;
                line = std::move(lines.front().second);
                lines.pop_front();
                return true;
            }

            void reply(const std::string &line) override
            {
                std::lock_guard<std::mutex> lock(txMutex);
                const uint16_t conn = connHandle;
                if (!running || !connected || conn == BLE_HS_CONN_HANDLE_NONE) return;
                // Only to the link the command came from (a reply can carry the enrolment code or SSIDs). Its lines
                // got in only through the encrypted-write characteristic, so that link is encrypted.
                if (lineGeneration != linkGeneration) return;
                uint16_t mtu = ble_att_mtu(conn);
                if (mtu < MIN_MTU) mtu = MIN_MTU;
                if (!forEachChunk(line.size(), mtu - 3,
                                  [&](size_t offset, size_t size) { return notify(conn, line.data() + offset, size); }))
                    logger.error("Setup reply lost");
            }

            void authFailed() override
            {
                std::lock_guard<std::mutex> lock(guardMutex);
                guard.pinFailed();
                if (!guard.lockedOut()) return;
                logger.warn("Too many wrong PINs: Bluetooth setup refuses commands until reopened");
                std::lock_guard<std::mutex> linesLock(linesMutex);
                lines.clear();
            }
        };

        SetupChannel setupChannel;
    }

    bool open()
    {
        if (owned) return true;
        owned = true;
        uint8_t mac[6] = {};
        esp_read_mac(mac, ESP_MAC_BT);
        snprintf(deviceName, sizeof deviceName, "Attractap Bridge %02X%02X", mac[4], mac[5]);
        forgetPartialInput();
        {
            std::lock_guard<std::mutex> lock(guardMutex);
            guard.reset();
        }

        if (heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA) < MIN_FREE_INTERNAL)
        {
            logger.error("Bluetooth setup: not enough free memory");
            owned = false;
            return false;
        }
        savedHostConfig = ble_hs_cfg;
        if (nimble_port_init() != ESP_OK)
        {
            // Also when the BLE proxy already runs NimBLE (a bridge whose pairing was revoked): a reboot frees it.
            logger.error("Bluetooth setup: NimBLE init failed");
            owned = false;
            return false;
        }
        ble_hs_cfg.sync_cb = onSync;
        ble_hs_cfg.reset_cb = onReset;
        ble_hs_cfg.store_status_cb = ble_store_util_status_rr;
        // Just Works with LE Secure Connections: the bridge has no display or keypad.
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
        if (rc != 0 || xTaskCreatePinnedToCore(hostTask, "nimble_host", HOST_TASK_STACK, nullptr,
                                               configMAX_PRIORITIES - 4, &hostTaskHandle,
                                               CONFIG_BT_NIMBLE_PINNED_TO_CORE) != pdPASS)
        {
            running = false;
            logger.errorf("Bluetooth setup: not enough memory (%d)", rc);
            nimble_port_deinit();
            ble_hs_cfg = savedHostConfig;
            owned = false;
            return false;
        }
        return true;
    }

    void close()
    {
        if (!owned) return;
        // Waits for a reply in progress; later replies see running == false.
        std::lock_guard<std::mutex> lock(txMutex);
        running = false;
        const uint16_t conn = connHandle;
        if (conn != BLE_HS_CONN_HANDLE_NONE) ble_gap_terminate(conn, BLE_ERR_REM_USER_CONN_TERM);
        ble_gap_adv_stop();
        // Let the terminate go out before the host stops.
        delay(200);
        nimble_port_stop();
        nimble_port_deinit();
        // The BLE proxy starts NimBLE with its own settings: no bonding, no key store.
        ble_hs_cfg = savedHostConfig;
        connected = false;
        connHandle = BLE_HS_CONN_HANDLE_NONE;
        forgetPartialInput();
        owned = false;
        logger.info("Bluetooth setup closed");
    }

    bool active() { return owned; }

    void tick()
    {
        if (!running) return;
        uint16_t conn;
        {
            // The clock is read under the lock the host task writes the link's times under: never behind them.
            std::lock_guard<std::mutex> lock(guardMutex);
            conn = connHandle;
            if (conn == BLE_HS_CONN_HANDLE_NONE || !guard.shouldDrop(millis())) return;
        }
        const int rc = ble_gap_terminate(conn, BLE_ERR_REM_USER_CONN_TERM);
        if (rc != 0 && rc != BLE_HS_EALREADY) return; // try again next tick
        std::lock_guard<std::mutex> lock(guardMutex);
        // Once per link (unless a new one came meanwhile): the disconnect event marks it gone.
        if (connHandle == conn) guard.dropping();
        logger.warn("Dropping the setup link (not encrypted, idle, or too many wrong PINs)");
    }

    bool linked() { return running && connected; }

    SerialCommandHandler::Channel &channel() { return setupChannel; }
}

#endif
