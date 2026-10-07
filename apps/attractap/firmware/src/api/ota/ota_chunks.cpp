#include "ota_updater.hpp"
#include "esp_app_format.h"
#include "platform.hpp"
#include <string>

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
    this->lastChunkRequestSendFailed = !this->send("FIRMWARE_REQUEST_CHUNK", payload);
    if (this->lastChunkRequestSendFailed)
    {
        // Request never left the device (tx queue full / alloc failure); tick()
        // retries after a short delay instead of waiting out the response timeout.
        this->logger.error("Failed to enqueue firmware chunk request, will retry");
    }
}

void OtaUpdater::onChunk(esp_websocket_event_data_t data)
{
    if (!this->ota.inProgress)
    {
        return; // ignore unexpected binary frames
    }

    // Fragment arrival is real progress: re-arm the response watchdog so a
    // slowly trickling chunk is never interrupted mid-delivery, and clear the
    // failure streak.
    this->lastFirmwareChunkRequestTimeMs = millis();
    this->consecutiveChunkFailures = 0;

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
