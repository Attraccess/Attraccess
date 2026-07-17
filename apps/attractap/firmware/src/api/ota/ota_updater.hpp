// ESP OTA firmware update state machine streaming image chunks over websocket
// FEATURE: firmware-ota

#pragma once

#include <string>

#include <ArduinoJson.h>
#include <functional>
#include "esp_websocket_client.h"
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "../../logger/logger.hpp"

class OtaUpdater
{
public:
    OtaUpdater(Logger &logger,
               std::function<bool(const char *, JsonObject)> send,
               std::function<void(const char *)> forceReconnect,
               std::function<void(int)> &progressCallback,
               std::function<void(std::string)> &metaCallback,
               std::function<void(const char *, const char *)> &errorCallback)
        : logger(logger), send(send), forceReconnect(forceReconnect), progressCallback(progressCallback), metaCallback(metaCallback), errorCallback(errorCallback) {}

    void begin(JsonObject firmwareMeta);
    void onChunk(esp_websocket_event_data_t data);
    void tick();
    bool inProgress() const { return this->ota.inProgress; }

private:
    struct OtaState
    {
        bool inProgress = false;
        uint32_t totalSize = 0;
        esp_ota_handle_t otaHandle = 0;
        const esp_partition_t *updatePartition = nullptr;
        int lastReportedPercent = -1;
        uint32_t bytesWritten = 0;
        std::string version;
    } ota;

    Logger &logger;
    std::function<bool(const char *, JsonObject)> send;
    std::function<void(const char *)> forceReconnect;
    std::function<void(int)> &progressCallback;
    std::function<void(std::string)> &metaCallback;
    std::function<void(const char *, const char *)> &errorCallback;

    bool readyForNextFirmwareChunk = false;
    uint32_t lastFirmwareChunkRequestTimeMs = 0;
    const uint32_t FIRMWARE_CHUNK_REQUEST_RESPONSE_TIMEOUT_MS = 10000;
    // Fast retry when the request never left the device (tx queue full / alloc failure)
    const uint32_t FIRMWARE_CHUNK_SEND_RETRY_DELAY_MS = 1000;
    // A lost chunk is re-requested at the current offset (server chunk reads are
    // stateless); abort + reboot only after this many consecutive failures.
    static constexpr uint8_t MAX_CONSECUTIVE_CHUNK_FAILURES = 5;
    uint8_t consecutiveChunkFailures = 0;
    bool lastChunkRequestSendFailed = false;
    uint32_t firmwareUpdateFailedTimeMs = 0;
    uint32_t currentChunkExpectedBytes = 0;
    uint32_t currentChunkReceivedBytes = 0;

    void requestNextFirmwareChunk();
    void abortFirmwareUpdate(const char *reason);
    void updateFirmwareProgress(int percent);
};
