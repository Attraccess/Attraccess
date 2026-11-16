// Lab-only generic GATT test peripheral (plugin BLE transport hardware tests).
// NimBLE peripheral, no pairing, preferred MTU 517. See ../README.md for the GATT table and the control commands.

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "esp_mac.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "nvs_flash.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

static const char *TAG = "ble-test";

#define MAX_VALUE_LEN 512
#define JOB_QUEUE_LEN 64
#define NOTIFY_RETRY_MS 2000
#define INDICATE_CONFIRM_MS 5000

// a7c0b1e0-XXXX-4f6e-9b3a-5c1d2e3f4a50, little-endian byte order for NimBLE.
#define TEST_UUID(lo, hi) \
    BLE_UUID128_INIT(0x50, 0x4a, 0x3f, 0x2e, 0x1d, 0x5c, 0x3a, 0x9b, 0x6e, 0x4f, lo, hi, 0xe0, 0xb1, 0xc0, 0xa7)

static const ble_uuid128_t svc_uuid = TEST_UUID(0x01, 0x00);
static const ble_uuid128_t chr_read_uuid = TEST_UUID(0x02, 0x00);
static const ble_uuid128_t chr_write_uuid = TEST_UUID(0x03, 0x00);
static const ble_uuid128_t chr_wwr_uuid = TEST_UUID(0x04, 0x00);
static const ble_uuid128_t chr_notify_uuid = TEST_UUID(0x05, 0x00);
static const ble_uuid128_t chr_indicate_uuid = TEST_UUID(0x06, 0x00);
static const ble_uuid128_t chr_control_uuid = TEST_UUID(0x07, 0x00);

enum {
    CMD_ECHO = 0x01,
    CMD_BURST = 0x02,
    CMD_INDICATE = 0x03,
    CMD_RESET = 0x04,
    CMD_SET_READ_LEN = 0x05,
    CMD_DISCONNECT = 0x06,
};

typedef enum { JOB_ACK, JOB_BURST, JOB_INDICATE } job_type_t;

typedef struct {
    job_type_t type;
    uint16_t conn;
    uint32_t count; // burst/indicate: notifications to send
    uint32_t size;  // burst/indicate: bytes per notification
    uint32_t total_bytes; // ack: running byte counter
    uint32_t chunk_seq;   // ack: chunk sequence (1-based)
} job_t;

static uint8_t own_addr_type;
static uint16_t conn_handle = BLE_HS_CONN_HANDLE_NONE;
static uint16_t notify_handle;
static uint16_t indicate_handle;
static uint16_t mtu = 23;
static bool notify_enabled;
static bool indicate_enabled;
static bool echo_enabled;
static uint16_t read_len = 64;
static uint8_t write_value[MAX_VALUE_LEN];
static uint16_t write_value_len;

// Per-connection statistics (host task only).
static int64_t connected_at_us;
static uint32_t rx_bytes;
static uint32_t rx_chunks;
static uint32_t notifications_sent;
static uint32_t acks_dropped;

static QueueHandle_t jobs;
static SemaphoreHandle_t indicate_done;
static volatile int indicate_status;

static void advertise(void);

static void put_u32(uint8_t *out, uint32_t value)
{
    out[0] = value & 0xff;
    out[1] = (value >> 8) & 0xff;
    out[2] = (value >> 16) & 0xff;
    out[3] = (value >> 24) & 0xff;
}

static uint16_t get_u16(const uint8_t *in) { return (uint16_t)(in[0] | (in[1] << 8)); }

static void reset_counters(void)
{
    rx_bytes = 0;
    rx_chunks = 0;
    notifications_sent = 0;
    acks_dropped = 0;
    connected_at_us = esp_timer_get_time();
}

/** Sends one notification, retrying while NimBLE is out of buffers. The stack consumes `om` on every attempt. */
static int send_notify(uint16_t conn, const uint8_t *data, uint16_t len)
{
    const int64_t deadline = esp_timer_get_time() + NOTIFY_RETRY_MS * 1000LL;
    for (;;) {
        if (conn_handle != conn || !notify_enabled) return BLE_HS_ENOTCONN;
        struct os_mbuf *om = ble_hs_mbuf_from_flat(data, len);
        int rc = om ? ble_gatts_notify_custom(conn, notify_handle, om) : BLE_HS_ENOMEM;
        if (rc == 0) {
            notifications_sent++;
            return 0;
        }
        if (rc != BLE_HS_ENOMEM || esp_timer_get_time() > deadline) return rc;
        vTaskDelay(1);
    }
}

static int send_indicate(uint16_t conn, const uint8_t *data, uint16_t len)
{
    if (conn_handle != conn || !indicate_enabled) return BLE_HS_ENOTCONN;
    struct os_mbuf *om = ble_hs_mbuf_from_flat(data, len);
    if (!om) return BLE_HS_ENOMEM;
    xSemaphoreTake(indicate_done, 0);
    int rc = ble_gatts_indicate_custom(conn, indicate_handle, om);
    if (rc != 0) return rc;
    if (xSemaphoreTake(indicate_done, pdMS_TO_TICKS(INDICATE_CONFIRM_MS)) != pdTRUE) return BLE_HS_ETIMEOUT;
    return indicate_status == BLE_HS_EDONE ? 0 : indicate_status;
}

static uint16_t clamp_size(uint32_t size)
{
    uint32_t max = mtu > 3 ? mtu - 3 : 20;
    if (max > MAX_VALUE_LEN) max = MAX_VALUE_LEN;
    if (size < 8) size = 8;
    return (uint16_t)(size > max ? max : size);
}

static void run_series(const job_t *job)
{
    static uint8_t buf[MAX_VALUE_LEN];
    const uint16_t size = clamp_size(job->size);
    const int64_t started = esp_timer_get_time();
    uint32_t sent = 0;
    int rc = 0;
    for (uint32_t i = 0; i < job->count; i++) {
        put_u32(buf, i + 1);
        put_u32(buf + 4, job->count);
        for (uint16_t b = 8; b < size; b++) buf[b] = (uint8_t)(i + b);
        rc = job->type == JOB_BURST ? send_notify(job->conn, buf, size) : send_indicate(job->conn, buf, size);
        if (rc != 0) break;
        sent++;
    }
    const int64_t elapsed_ms = (esp_timer_get_time() - started) / 1000;
    ESP_LOGI(TAG, "%s: sent=%lu/%lu size=%u elapsed=%lldms rc=%d", job->type == JOB_BURST ? "burst" : "indicate",
             (unsigned long)sent, (unsigned long)job->count, size, elapsed_ms, rc);
}

static void worker_task(void *arg)
{
    (void)arg;
    job_t job;
    for (;;) {
        if (xQueueReceive(jobs, &job, portMAX_DELAY) != pdTRUE) continue;
        if (job.type == JOB_ACK) {
            uint8_t ack[8];
            put_u32(ack, job.total_bytes);
            put_u32(ack + 4, job.chunk_seq);
            int rc = send_notify(job.conn, ack, sizeof ack);
            if (rc != 0 && rc != BLE_HS_ENOTCONN) ESP_LOGW(TAG, "ack %lu failed rc=%d", (unsigned long)job.chunk_seq, rc);
        } else {
            run_series(&job);
        }
    }
}

static void received_chunk(uint16_t conn, uint16_t len)
{
    rx_bytes += len;
    rx_chunks++;
    if (!echo_enabled) return;
    job_t job = {.type = JOB_ACK, .conn = conn, .total_bytes = rx_bytes, .chunk_seq = rx_chunks};
    if (xQueueSend(jobs, &job, 0) != pdTRUE) acks_dropped++;
}

static int handle_control(uint16_t conn, const uint8_t *cmd, uint16_t len)
{
    if (len < 1) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    switch (cmd[0]) {
    case CMD_ECHO:
        if (len < 2) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
        echo_enabled = cmd[1] != 0;
        ESP_LOGI(TAG, "echo/ack mode %s", echo_enabled ? "on" : "off");
        return 0;
    case CMD_BURST:
    case CMD_INDICATE: {
        if (len < 5) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
        job_t job = {.type = cmd[0] == CMD_BURST ? JOB_BURST : JOB_INDICATE,
                     .conn = conn,
                     .count = get_u16(cmd + 1),
                     .size = get_u16(cmd + 3)};
        return xQueueSend(jobs, &job, 0) == pdTRUE ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
    }
    case CMD_RESET:
        reset_counters();
        ESP_LOGI(TAG, "counters reset");
        return 0;
    case CMD_SET_READ_LEN: {
        if (len < 3) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
        uint16_t value = get_u16(cmd + 1);
        if (value < 1 || value > MAX_VALUE_LEN) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
        read_len = value;
        return 0;
    }
    case CMD_DISCONNECT:
        ESP_LOGI(TAG, "disconnect requested over control");
        ble_gap_terminate(conn, BLE_ERR_REM_USER_CONN_TERM);
        return 0;
    default:
        return BLE_ATT_ERR_REQ_NOT_SUPPORTED;
    }
}

static int gatt_access(uint16_t conn, uint16_t attr_handle, struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    (void)attr_handle;
    const ble_uuid_t *uuid = ctxt->chr->uuid;
    if (ctxt->op == BLE_GATT_ACCESS_OP_READ_CHR) {
        if (ble_uuid_cmp(uuid, &chr_read_uuid.u) == 0) {
            static uint8_t pattern[MAX_VALUE_LEN];
            for (uint16_t i = 0; i < read_len; i++) pattern[i] = (uint8_t)i;
            return os_mbuf_append(ctxt->om, pattern, read_len) == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
        }
        if (ble_uuid_cmp(uuid, &chr_write_uuid.u) == 0) {
            return os_mbuf_append(ctxt->om, write_value, write_value_len) == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
        }
        return BLE_ATT_ERR_READ_NOT_PERMITTED;
    }
    if (ctxt->op != BLE_GATT_ACCESS_OP_WRITE_CHR) return BLE_ATT_ERR_UNLIKELY;

    static uint8_t buf[MAX_VALUE_LEN];
    uint16_t len = 0;
    if (OS_MBUF_PKTLEN(ctxt->om) > MAX_VALUE_LEN) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    if (ble_hs_mbuf_to_flat(ctxt->om, buf, sizeof buf, &len) != 0) return BLE_ATT_ERR_UNLIKELY;

    if (ble_uuid_cmp(uuid, &chr_control_uuid.u) == 0) return handle_control(conn, buf, len);
    if (ble_uuid_cmp(uuid, &chr_write_uuid.u) == 0) {
        memcpy(write_value, buf, len);
        write_value_len = len;
    }
    received_chunk(conn, len);
    return 0;
}

static const struct ble_gatt_svc_def services[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &svc_uuid.u,
        .characteristics =
            (struct ble_gatt_chr_def[]){
                {.uuid = &chr_read_uuid.u, .access_cb = gatt_access, .flags = BLE_GATT_CHR_F_READ},
                {.uuid = &chr_write_uuid.u,
                 .access_cb = gatt_access,
                 .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_WRITE},
                {.uuid = &chr_wwr_uuid.u, .access_cb = gatt_access, .flags = BLE_GATT_CHR_F_WRITE_NO_RSP},
                {.uuid = &chr_notify_uuid.u,
                 .access_cb = gatt_access,
                 .flags = BLE_GATT_CHR_F_NOTIFY,
                 .val_handle = &notify_handle},
                {.uuid = &chr_indicate_uuid.u,
                 .access_cb = gatt_access,
                 .flags = BLE_GATT_CHR_F_INDICATE,
                 .val_handle = &indicate_handle},
                {.uuid = &chr_control_uuid.u, .access_cb = gatt_access, .flags = BLE_GATT_CHR_F_WRITE},
                {0},
            },
    },
    {0},
};

static void log_connection_summary(int reason)
{
    const int64_t elapsed_ms = (esp_timer_get_time() - connected_at_us) / 1000;
    const double kib_s = elapsed_ms > 0 ? (rx_bytes / 1024.0) / (elapsed_ms / 1000.0) : 0;
    ESP_LOGI(TAG,
             "disconnected reason=0x%x mtu=%u duration=%lldms rx_bytes=%lu rx_chunks=%lu rx=%.2fKiB/s "
             "notifications=%lu acks_dropped=%lu",
             reason, mtu, elapsed_ms, (unsigned long)rx_bytes, (unsigned long)rx_chunks, kib_s,
             (unsigned long)notifications_sent, (unsigned long)acks_dropped);
}

static int gap_event(struct ble_gap_event *event, void *arg)
{
    (void)arg;
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        if (event->connect.status != 0) {
            ESP_LOGW(TAG, "connect failed status=%d", event->connect.status);
            advertise();
            return 0;
        }
        conn_handle = event->connect.conn_handle;
        mtu = 23;
        notify_enabled = indicate_enabled = echo_enabled = false;
        reset_counters();
        ESP_LOGI(TAG, "connected handle=%u", conn_handle);
        return 0;
    case BLE_GAP_EVENT_DISCONNECT:
        log_connection_summary(event->disconnect.reason);
        conn_handle = BLE_HS_CONN_HANDLE_NONE;
        notify_enabled = indicate_enabled = echo_enabled = false;
        xQueueReset(jobs);
        indicate_status = BLE_HS_ENOTCONN;
        xSemaphoreGive(indicate_done);
        advertise();
        return 0;
    case BLE_GAP_EVENT_MTU:
        mtu = event->mtu.value;
        ESP_LOGI(TAG, "mtu=%u", mtu);
        return 0;
    case BLE_GAP_EVENT_SUBSCRIBE:
        if (event->subscribe.attr_handle == notify_handle) notify_enabled = event->subscribe.cur_notify;
        if (event->subscribe.attr_handle == indicate_handle) indicate_enabled = event->subscribe.cur_indicate;
        ESP_LOGI(TAG, "subscribe handle=%u notify=%d indicate=%d", event->subscribe.attr_handle,
                 event->subscribe.cur_notify, event->subscribe.cur_indicate);
        return 0;
    case BLE_GAP_EVENT_NOTIFY_TX:
        if (event->notify_tx.indication && event->notify_tx.status != 0) {
            indicate_status = event->notify_tx.status;
            xSemaphoreGive(indicate_done);
        }
        return 0;
    case BLE_GAP_EVENT_ADV_COMPLETE:
        advertise();
        return 0;
    default:
        return 0;
    }
}

static void advertise(void)
{
    struct ble_hs_adv_fields fields = {0};
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.uuids128 = (ble_uuid128_t *)&svc_uuid;
    fields.num_uuids128 = 1;
    fields.uuids128_is_complete = 1;
    int rc = ble_gap_adv_set_fields(&fields);
    if (rc != 0) {
        ESP_LOGE(TAG, "adv fields rc=%d", rc);
        return;
    }
    struct ble_hs_adv_fields response = {0};
    const char *name = ble_svc_gap_device_name();
    response.name = (uint8_t *)name;
    response.name_len = strlen(name);
    response.name_is_complete = 1;
    rc = ble_gap_adv_rsp_set_fields(&response);
    if (rc != 0) {
        ESP_LOGE(TAG, "scan response rc=%d", rc);
        return;
    }
    struct ble_gap_adv_params params = {.conn_mode = BLE_GAP_CONN_MODE_UND, .disc_mode = BLE_GAP_DISC_MODE_GEN};
    rc = ble_gap_adv_start(own_addr_type, NULL, BLE_HS_FOREVER, &params, gap_event, NULL);
    if (rc != 0 && rc != BLE_HS_EALREADY) ESP_LOGE(TAG, "adv start rc=%d", rc);
}

static void on_sync(void)
{
    ble_hs_util_ensure_addr(0);
    ble_hs_id_infer_auto(0, &own_addr_type);
    uint8_t addr[6] = {0};
    ble_hs_id_copy_addr(own_addr_type, addr, NULL);
    ESP_LOGI(TAG, "ready address=%02X:%02X:%02X:%02X:%02X:%02X type=%s name=%s", addr[5], addr[4], addr[3], addr[2],
             addr[1], addr[0], own_addr_type == BLE_OWN_ADDR_PUBLIC ? "public" : "random", ble_svc_gap_device_name());
    advertise();
}

static void on_reset(int reason) { ESP_LOGW(TAG, "host reset reason=%d", reason); }

static void host_task(void *param)
{
    (void)param;
    nimble_port_run();
    nimble_port_freertos_deinit();
}

void app_main(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    jobs = xQueueCreate(JOB_QUEUE_LEN, sizeof(job_t));
    indicate_done = xSemaphoreCreateBinary();
    xTaskCreate(worker_task, "ble_test_worker", 4096, NULL, 5, NULL);

    ESP_ERROR_CHECK(nimble_port_init());
    ble_hs_cfg.sync_cb = on_sync;
    ble_hs_cfg.reset_cb = on_reset;
    ble_svc_gap_init();
    ble_svc_gatt_init();
    ESP_ERROR_CHECK(ble_gatts_count_cfg(services));
    ESP_ERROR_CHECK(ble_gatts_add_svcs(services));

    uint8_t mac[6] = {0};
    esp_read_mac(mac, ESP_MAC_BT);
    char name[24];
    snprintf(name, sizeof name, "AttrBLE-Test-%02X%02X", mac[4], mac[5]);
    ble_svc_gap_device_name_set(name);
    ble_att_set_preferred_mtu(517);

    nimble_port_freertos_init(host_task);
}
