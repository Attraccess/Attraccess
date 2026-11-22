// `CMND heap` of the BLE bridge (ATT-1315), see SerialCommandHandler::handleCommand.
#include "serialCommandHandler.hpp"

#if !defined(ATTRACTAP_HOST) && defined(ATTRACTAP_BLE_BRIDGE)

#include <ArduinoJson.h>
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "../platform.hpp"

// `CMND heap`: internal heap now, its low-water mark since boot and its largest block, DMA-capable heap, and the
// unused stack (bytes never touched since the task started) of the firmware's own tasks. The bridge has no PSRAM, so
// these numbers are its whole memory budget.
void SerialCommandHandler::sendHeapStatus(const std::string &topic)
{
    DynamicJsonDocument resp(768);
    resp["internalFree"] = heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    resp["internalMinFree"] = heap_caps_get_minimum_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    resp["internalLargest"] = heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    resp["dmaFree"] = heap_caps_get_free_size(MALLOC_CAP_DMA);
    resp["uptimeMs"] = millis();
    JsonObject stacks = resp.createNestedObject("stackFree");
    static const char *const TASKS[] = {"main", "websocket_task", "ws_conn", "ws_tx", "rl_tls", "ble_proxy",
                                        "nimble_host", "bridge", "NetworkTask", "tiT", "wifi", "sys_evt",
                                        "esp_timer", "btController", "Tmr Svc"};
    for (const char *name : TASKS)
    {
        TaskHandle_t handle = xTaskGetHandle(name);
        if (handle) stacks[name] = static_cast<unsigned>(uxTaskGetStackHighWaterMark(handle) * sizeof(StackType_t));
    }
    std::string json;
    serializeJson(resp, json);
    sendJsonResponse(topic, json);
}

#endif
