#pragma once

#include <ArduinoJson.h>
#include <functional>
#include <string>

#include "host/ble_gap.h"
#include "host/ble_gatt.h"
#include "host/ble_uuid.h"

class BleProxy
{
public:
    using ResultCallback = std::function<void(const char *requestId,
                                              const char *operation,
                                              bool success,
                                              const char *error,
                                              const char *address,
                                              int addressType,
                                              int rssi,
                                              const char *name,
                                              const char *valueHex)>;

    void setup(ResultCallback callback);
    void execute(JsonObjectConst payload);

private:
    static BleProxy *instance;

    ResultCallback resultCallback;
    bool synced = false;
    bool busy = false;
    uint16_t connHandle = BLE_HS_CONN_HANDLE_NONE;
    uint16_t serviceStartHandle = 0;
    uint16_t serviceEndHandle = 0;
    uint16_t characteristicHandle = 0;
    std::string requestId;
    std::string operation;
    std::string serviceUuidText;
    std::string characteristicUuidText;
    std::string valueHex;
    ble_uuid_any_t serviceUuid{};
    ble_uuid_any_t characteristicUuid{};

    static void hostTask(void *param);
    static void onReset(int reason);
    static void onSync();
    static int onGapEvent(struct ble_gap_event *event, void *arg);
    static int onServiceDiscovered(uint16_t connHandle,
                                   const struct ble_gatt_error *error,
                                   const struct ble_gatt_svc *service,
                                   void *arg);
    static int onCharacteristicDiscovered(uint16_t connHandle,
                                          const struct ble_gatt_error *error,
                                          const struct ble_gatt_chr *characteristic,
                                          void *arg);
    static int onRead(uint16_t connHandle,
                      const struct ble_gatt_error *error,
                      struct ble_gatt_attr *attribute,
                      void *arg);
    static int onWrite(uint16_t connHandle,
                       const struct ble_gatt_error *error,
                       struct ble_gatt_attr *attribute,
                       void *arg);

    void scan();
    void connect(JsonObjectConst payload);
    void discoverCharacteristic(JsonObjectConst payload);
    void disconnect();
    void performGattOperation();
    void finish(bool success,
                const char *error = nullptr,
                const char *address = nullptr,
                int addressType = -1,
                int rssi = 0,
                const char *name = nullptr,
                const char *resultValueHex = nullptr);
};
