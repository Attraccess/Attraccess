#include "ble_proxy.hpp"

#include <cstdio>
#include <cstring>
#include <vector>

#include "esp_log.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "os/os_mbuf.h"

namespace
{
constexpr const char *TAG = "BleProxyPOC";
constexpr const char *DEFAULT_PS_SERVICE_UUID = "4d4f4445-5343-4f2d-574f-514b45523232";

std::string bytesToHex(const uint8_t *data, size_t length)
{
    static constexpr char digits[] = "0123456789abcdef";
    std::string result(length * 2, '0');
    for (size_t i = 0; i < length; ++i)
    {
        result[i * 2] = digits[data[i] >> 4];
        result[i * 2 + 1] = digits[data[i] & 0x0f];
    }
    return result;
}

bool hexToBytes(const std::string &hex, std::vector<uint8_t> &bytes)
{
    if (hex.size() % 2 != 0)
    {
        return false;
    }
    bytes.resize(hex.size() / 2);
    for (size_t i = 0; i < bytes.size(); ++i)
    {
        unsigned int value = 0;
        if (std::sscanf(hex.c_str() + i * 2, "%2x", &value) != 1)
        {
            return false;
        }
        bytes[i] = static_cast<uint8_t>(value);
    }
    return true;
}

std::string addressToString(const uint8_t address[6])
{
    char text[18];
    std::snprintf(text,
                  sizeof(text),
                  "%02x:%02x:%02x:%02x:%02x:%02x",
                  address[5],
                  address[4],
                  address[3],
                  address[2],
                  address[1],
                  address[0]);
    return text;
}
} // namespace

BleProxy *BleProxy::instance = nullptr;

void BleProxy::setup(ResultCallback callback)
{
    instance = this;
    resultCallback = std::move(callback);

    const esp_err_t result = nimble_port_init();
    if (result != ESP_OK)
    {
        ESP_LOGE(TAG, "nimble_port_init failed: %d", result);
        return;
    }

    ble_hs_cfg.reset_cb = onReset;
    ble_hs_cfg.sync_cb = onSync;
    nimble_port_freertos_init(hostTask);
}

void BleProxy::execute(JsonObjectConst payload)
{
    const char *incomingRequestId = payload["requestId"] | "";
    const char *incomingOperation = payload["operation"] | "";
    if (!synced)
    {
        requestId = incomingRequestId;
        operation = incomingOperation;
        finish(false, "BLE_NOT_READY");
        return;
    }
    if (busy)
    {
        if (resultCallback)
        {
            resultCallback(incomingRequestId, incomingOperation, false, "BLE_BUSY", nullptr, -1, 0, nullptr, nullptr);
        }
        return;
    }

    busy = true;
    requestId = incomingRequestId;
    operation = incomingOperation;

    if (operation == "scan")
    {
        serviceUuidText = payload["serviceUuid"] | DEFAULT_PS_SERVICE_UUID;
        scan();
    }
    else if (operation == "connect")
    {
        connect(payload);
    }
    else if (operation == "read" || operation == "write")
    {
        discoverCharacteristic(payload);
    }
    else if (operation == "disconnect")
    {
        disconnect();
    }
    else
    {
        finish(false, "INVALID_OPERATION");
    }
}

void BleProxy::hostTask(void *param)
{
    nimble_port_run();
    nimble_port_freertos_deinit();
}

void BleProxy::onReset(int reason)
{
    ESP_LOGE(TAG, "NimBLE reset: %d", reason);
    if (instance)
    {
        instance->synced = false;
        instance->connHandle = BLE_HS_CONN_HANDLE_NONE;
        if (instance->busy)
        {
            instance->finish(false, "BLE_HOST_RESET");
        }
    }
}

void BleProxy::onSync()
{
    if (!instance)
    {
        return;
    }
    const int result = ble_hs_util_ensure_addr(0);
    instance->synced = result == 0;
    ESP_LOGI(TAG, "NimBLE synchronized: %s", instance->synced ? "yes" : "no");
}

void BleProxy::scan()
{
    if (ble_uuid_from_str(&serviceUuid, serviceUuidText.c_str()) != 0)
    {
        finish(false, "INVALID_SERVICE_UUID");
        return;
    }

    uint8_t ownAddressType = 0;
    int result = ble_hs_id_infer_auto(0, &ownAddressType);
    if (result != 0)
    {
        finish(false, "ADDRESS_TYPE_FAILED");
        return;
    }

    ble_gap_disc_params parameters{};
    parameters.filter_duplicates = 1;
    parameters.passive = 1;
    result = ble_gap_disc(ownAddressType, 5000, &parameters, onGapEvent, this);
    if (result != 0)
    {
        finish(false, "SCAN_START_FAILED");
    }
}

void BleProxy::connect(JsonObjectConst payload)
{
    const char *addressText = payload["address"] | "";
    const int addressType = payload["addressType"] | 0;
    unsigned int parts[6];
    if (std::sscanf(addressText,
                    "%2x:%2x:%2x:%2x:%2x:%2x",
                    &parts[5],
                    &parts[4],
                    &parts[3],
                    &parts[2],
                    &parts[1],
                    &parts[0]) != 6)
    {
        finish(false, "INVALID_ADDRESS");
        return;
    }

    ble_addr_t address{};
    address.type = static_cast<uint8_t>(addressType);
    for (size_t i = 0; i < 6; ++i)
    {
        address.val[i] = static_cast<uint8_t>(parts[i]);
    }

    uint8_t ownAddressType = 0;
    int result = ble_hs_id_infer_auto(0, &ownAddressType);
    if (result == 0)
    {
        result = ble_gap_connect(ownAddressType, &address, 10000, nullptr, onGapEvent, this);
    }
    if (result != 0)
    {
        finish(false, "CONNECT_START_FAILED");
    }
}

void BleProxy::discoverCharacteristic(JsonObjectConst payload)
{
    if (connHandle == BLE_HS_CONN_HANDLE_NONE)
    {
        finish(false, "NOT_CONNECTED");
        return;
    }

    serviceUuidText = payload["serviceUuid"] | "";
    characteristicUuidText = payload["characteristicUuid"] | "";
    valueHex = payload["valueHex"] | "";
    if (ble_uuid_from_str(&serviceUuid, serviceUuidText.c_str()) != 0 ||
        ble_uuid_from_str(&characteristicUuid, characteristicUuidText.c_str()) != 0)
    {
        finish(false, "INVALID_UUID");
        return;
    }

    serviceStartHandle = 0;
    serviceEndHandle = 0;
    characteristicHandle = 0;
    const int result = ble_gattc_disc_svc_by_uuid(connHandle, &serviceUuid.u, onServiceDiscovered, this);
    if (result != 0)
    {
        finish(false, "SERVICE_DISCOVERY_START_FAILED");
    }
}

void BleProxy::disconnect()
{
    if (connHandle == BLE_HS_CONN_HANDLE_NONE)
    {
        finish(true);
        return;
    }
    if (ble_gap_terminate(connHandle, BLE_ERR_REM_USER_CONN_TERM) != 0)
    {
        finish(false, "DISCONNECT_FAILED");
    }
}

int BleProxy::onGapEvent(struct ble_gap_event *event, void *arg)
{
    auto *self = static_cast<BleProxy *>(arg);
    switch (event->type)
    {
    case BLE_GAP_EVENT_DISC:
    {
        ble_hs_adv_fields fields{};
        if (ble_hs_adv_parse_fields(&fields, event->disc.data, event->disc.length_data) != 0)
        {
            return 0;
        }
        bool matches = false;
        for (int i = 0; i < fields.num_uuids128; ++i)
        {
            if (ble_uuid_cmp(&fields.uuids128[i].u, &self->serviceUuid.u) == 0)
            {
                matches = true;
                break;
            }
        }
        if (!matches)
        {
            return 0;
        }

        ble_gap_disc_cancel();
        const std::string address = addressToString(event->disc.addr.val);
        std::string name;
        if (fields.name && fields.name_len > 0)
        {
            name.assign(reinterpret_cast<const char *>(fields.name), fields.name_len);
        }
        self->finish(true,
                     nullptr,
                     address.c_str(),
                     event->disc.addr.type,
                     event->disc.rssi,
                     name.c_str());
        return 0;
    }
    case BLE_GAP_EVENT_DISC_COMPLETE:
        if (self->busy && self->operation == "scan")
        {
            self->finish(false, "LOCK_NOT_FOUND");
        }
        return 0;
    case BLE_GAP_EVENT_CONNECT:
        if (event->connect.status == 0)
        {
            self->connHandle = event->connect.conn_handle;
            self->finish(true);
        }
        else
        {
            self->connHandle = BLE_HS_CONN_HANDLE_NONE;
            self->finish(false, "CONNECT_FAILED");
        }
        return 0;
    case BLE_GAP_EVENT_DISCONNECT:
        self->connHandle = BLE_HS_CONN_HANDLE_NONE;
        if (self->busy)
        {
            self->finish(self->operation == "disconnect",
                         self->operation == "disconnect" ? nullptr : "DISCONNECTED");
        }
        return 0;
    default:
        return 0;
    }
}

int BleProxy::onServiceDiscovered(uint16_t connHandle,
                                  const struct ble_gatt_error *error,
                                  const struct ble_gatt_svc *service,
                                  void *arg)
{
    auto *self = static_cast<BleProxy *>(arg);
    if (error->status == 0 && service)
    {
        self->serviceStartHandle = service->start_handle;
        self->serviceEndHandle = service->end_handle;
        return 0;
    }
    if (error->status != BLE_HS_EDONE || self->serviceStartHandle == 0)
    {
        self->finish(false, "SERVICE_NOT_FOUND");
        return 0;
    }

    const int result = ble_gattc_disc_chrs_by_uuid(connHandle,
                                                    self->serviceStartHandle,
                                                    self->serviceEndHandle,
                                                    &self->characteristicUuid.u,
                                                    onCharacteristicDiscovered,
                                                    self);
    if (result != 0)
    {
        self->finish(false, "CHARACTERISTIC_DISCOVERY_START_FAILED");
    }
    return 0;
}

int BleProxy::onCharacteristicDiscovered(uint16_t connHandle,
                                         const struct ble_gatt_error *error,
                                         const struct ble_gatt_chr *characteristic,
                                         void *arg)
{
    auto *self = static_cast<BleProxy *>(arg);
    if (error->status == 0 && characteristic)
    {
        self->characteristicHandle = characteristic->val_handle;
        return 0;
    }
    if (error->status != BLE_HS_EDONE || self->characteristicHandle == 0)
    {
        self->finish(false, "CHARACTERISTIC_NOT_FOUND");
        return 0;
    }
    self->performGattOperation();
    return 0;
}

void BleProxy::performGattOperation()
{
    int result = 0;
    if (operation == "read")
    {
        result = ble_gattc_read(connHandle, characteristicHandle, onRead, this);
    }
    else
    {
        std::vector<uint8_t> value;
        if (!hexToBytes(valueHex, value))
        {
            finish(false, "INVALID_HEX_VALUE");
            return;
        }
        result = ble_gattc_write_flat(connHandle,
                                      characteristicHandle,
                                      value.data(),
                                      static_cast<uint16_t>(value.size()),
                                      onWrite,
                                      this);
    }
    if (result != 0)
    {
        finish(false, "GATT_OPERATION_START_FAILED");
    }
}

int BleProxy::onRead(uint16_t connHandle,
                     const struct ble_gatt_error *error,
                     struct ble_gatt_attr *attribute,
                     void *arg)
{
    auto *self = static_cast<BleProxy *>(arg);
    if (error->status != 0 || !attribute || !attribute->om)
    {
        self->finish(false, "READ_FAILED");
        return 0;
    }

    const uint16_t length = OS_MBUF_PKTLEN(attribute->om);
    std::vector<uint8_t> value(length);
    if (os_mbuf_copydata(attribute->om, 0, length, value.data()) != 0)
    {
        self->finish(false, "READ_COPY_FAILED");
        return 0;
    }
    const std::string valueText = bytesToHex(value.data(), value.size());
    self->finish(true, nullptr, nullptr, -1, 0, nullptr, valueText.c_str());
    return 0;
}

int BleProxy::onWrite(uint16_t connHandle,
                      const struct ble_gatt_error *error,
                      struct ble_gatt_attr *attribute,
                      void *arg)
{
    auto *self = static_cast<BleProxy *>(arg);
    self->finish(error->status == 0, error->status == 0 ? nullptr : "WRITE_FAILED");
    return 0;
}

void BleProxy::finish(bool success,
                      const char *error,
                      const char *address,
                      int addressType,
                      int rssi,
                      const char *name,
                      const char *resultValueHex)
{
    if (resultCallback)
    {
        resultCallback(requestId.c_str(),
                       operation.c_str(),
                       success,
                       error,
                       address,
                       addressType,
                       rssi,
                       name,
                       resultValueHex);
    }
    busy = false;
}
