// ESP OTA firmware update state machine streaming image chunks over websocket
// FEATURE: firmware-ota

#include "ota_updater.hpp"
#include "platform.hpp"
#include <string>

void OtaUpdater::begin(JsonObject firmwareMeta)
{
    if (this->ota.inProgress)
    {
        this->logger.error("Firmware update already in progress");
        return;
    }

    this->logger.info("Starting OTA firmware update");

    // Set inProgress immediately to suppress heartbeats and avoid WebSocket send contention.
    // processIncomingMessage runs in the WebSocket task; the main loop runs in a different task.
    // Without this, sendHeartbeat could run concurrently and fail (esp_websocket_client_send_text
    // returns -1 when called from multiple tasks or during heavy receive processing).
    this->ota.inProgress = true;

    this->ota.totalSize = firmwareMeta["totalSize"].is<uint32_t>() ? firmwareMeta["totalSize"].as<uint32_t>() : 0;
    this->ota.bytesWritten = 0;

    if (this->ota.totalSize == 0)
    {
        this->logger.error("Invalid firmware meta (totalSize)");
        this->ota.inProgress = false;
        return;
    }

    this->ota.updatePartition = esp_ota_get_next_update_partition(NULL);
    if (!this->ota.updatePartition)
    {
        this->logger.error("OTA: no update partition found");
        this->ota.inProgress = false;
        return;
    }
    esp_err_t err = esp_ota_begin(this->ota.updatePartition, OTA_SIZE_UNKNOWN, &this->ota.otaHandle);
    if (err != ESP_OK)
    {
        this->logger.error((std::string("esp_ota_begin failed: ") + esp_err_to_name(err)).c_str());
        this->ota.inProgress = false;
        return;
    }
    this->ota.lastReportedPercent = -1;

    std::string availableVersion = firmwareMeta["version"].as<std::string>();
    if (this->metaCallback)
    {
        this->logger.debugf("Firmware update available: %s > %s", FIRMWARE_VERSION, availableVersion.c_str());
        this->metaCallback(availableVersion.c_str());
    }

    this->updateFirmwareProgress(0);

    this->readyForNextFirmwareChunk = true;
}

void OtaUpdater::requestNextFirmwareChunk()
{
    this->readyForNextFirmwareChunk = false;
    const uint32_t remaining = (this->ota.totalSize > this->ota.bytesWritten) ? (this->ota.totalSize - this->ota.bytesWritten) : 0;
    if (remaining == 0)
    {
        return;
    }
    const uint32_t CHUNK = 4096; // must match server maxChunk to avoid split across WS frames
    uint32_t len = remaining < CHUNK ? remaining : CHUNK;
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["offset"] = this->ota.bytesWritten;
    payload["length"] = len;

    this->lastFirmwareChunkRequestTimeMs = millis();
    this->send("FIRMWARE_REQUEST_CHUNK", payload);
}

void OtaUpdater::onChunk(esp_websocket_event_data_t data)
{
    if (!this->ota.inProgress)
    {
        return; // ignore unexpected binary frames
    }

    // The ESP websocket client may deliver a single server send across multiple callbacks
    // Use payload_len (total message size) and payload_offset (offset within message) to write contiguously
    const uint8_t *fragmentPtr = (const uint8_t *)data.data_ptr;
    const size_t fragmentLen = (size_t)data.data_len;
    const size_t messageTotal = (size_t)data.payload_len;     // entire WS message length
    const size_t messageOffset = (size_t)data.payload_offset; // offset within current WS message

    // First fragment of this binary message: validate image header if it's the first file bytes
    if (this->ota.bytesWritten == 0 && messageOffset == 0 && fragmentLen >= sizeof(esp_image_header_t))
    {
        const esp_image_header_t *hdr = (const esp_image_header_t *)fragmentPtr;
        if (hdr->magic != ESP_IMAGE_HEADER_MAGIC)
        {
            this->abortFirmwareUpdate("Invalid firmware image header magic");
            return;
        }
    }

    // Write this fragment to OTA
    if (fragmentLen > 0)
    {
        esp_err_t werr = esp_ota_write(this->ota.otaHandle, fragmentPtr, fragmentLen);
        if (werr != ESP_OK)
        {
            this->abortFirmwareUpdate((std::string("esp_ota_write failed: ") + esp_err_to_name(werr)).c_str());
            return;
        }
        this->ota.bytesWritten += (uint32_t)fragmentLen;
        this->currentChunkReceivedBytes += (uint32_t)fragmentLen;
    }

    if (this->ota.totalSize > 0)
    {
        int pct = (int)(((float)this->ota.bytesWritten / (float)this->ota.totalSize) * 100.0f);
        if (pct < 0)
            pct = 0;
        if (pct > 100)
            pct = 100;

        if (pct == 100 || this->ota.lastReportedPercent < 0 || pct - this->ota.lastReportedPercent >= 5)
        {
            this->ota.lastReportedPercent = pct;
            this->updateFirmwareProgress(pct);
        }
    }
    else
    {
        this->logger.error("For some reason, ota.totalsize is 0");
    }

    // When a full WS message (one requested chunk) is finished, request next chunk
    if (messageOffset + fragmentLen < messageTotal)
    {
        // still more fragments for this WS message; wait for next callback
        return;
    }
    // Full message completed
    this->currentChunkReceivedBytes = 0;
    this->currentChunkExpectedBytes = 0;

    if (this->ota.bytesWritten < this->ota.totalSize)
    {
        this->logger.debug("firmware update last chunk written, ready for next one");
        this->readyForNextFirmwareChunk = true;
        return;
    }

    esp_err_t endErr = esp_ota_end(this->ota.otaHandle);
    if (endErr != ESP_OK)
    {
        this->abortFirmwareUpdate((std::string("esp_ota_end failed: ") + esp_err_to_name(endErr)).c_str());
        return;
    }
    esp_err_t setBootErr = esp_ota_set_boot_partition(this->ota.updatePartition);
    if (setBootErr != ESP_OK)
    {
        this->abortFirmwareUpdate((std::string("esp_ota_set_boot_partition failed: ") + esp_err_to_name(setBootErr)).c_str());
        return;
    }

    this->updateFirmwareProgress(100);
    this->logger.info("Firmware update complete, restarting...");
    delay(250);
    esp_restart();
}

void OtaUpdater::tick()
{
    if (this->lastFirmwareChunkRequestTimeMs != 0 && this->firmwareUpdateFailedTimeMs == 0)
    {
        uint32_t now = millis();
        if (now - this->lastFirmwareChunkRequestTimeMs > this->FIRMWARE_CHUNK_REQUEST_RESPONSE_TIMEOUT_MS)
        {
            this->logger.error("Firmware chunk request timeout reached");
            this->abortFirmwareUpdate("Firmware chunk request timeout");
            return;
        }
    }

    if (this->firmwareUpdateFailedTimeMs != 0)
    {
        uint32_t now = millis();
        if (now - this->firmwareUpdateFailedTimeMs > 3000)
        {
            esp_restart();
            return;
        }
    }

    if (this->readyForNextFirmwareChunk)
    {
        this->requestNextFirmwareChunk();
        return;
    }
}

void OtaUpdater::abortFirmwareUpdate(const char *reason)
{
    this->logger.error((std::string("OTA aborted: ") + reason).c_str());
    if (this->ota.otaHandle)
    {
        esp_ota_abort(this->ota.otaHandle);
    }

    if (this->errorCallback)
    {
        this->errorCallback("Firmware update failed", reason);
    }

    this->firmwareUpdateFailedTimeMs = millis();
}

void OtaUpdater::updateFirmwareProgress(int percent)
{
    if (this->progressCallback)
    {
        this->logger.debugf("calling firmware update progress handler %d", percent);
        this->progressCallback(percent);
    }
    else
    {
        this->logger.error("firmware update progress callback not set");
    }
}
