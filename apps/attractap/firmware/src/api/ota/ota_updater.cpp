// ESP OTA firmware update state machine streaming image chunks over websocket
// FEATURE: firmware-ota

#include "ota_updater.hpp"
#include "esp_app_format.h"
#include "platform.hpp"
#include <string>

void OtaUpdater::begin(JsonObject firmwareMeta)
{
    std::string availableVersion = firmwareMeta["version"].as<std::string>();
    uint32_t offeredSize = firmwareMeta["totalSize"].is<uint32_t>() ? firmwareMeta["totalSize"].as<uint32_t>() : 0;

    if (this->ota.inProgress)
    {
        if (this->firmwareUpdateFailedTimeMs != 0)
        {
            return; // update already failed, reboot pending
        }
        // totalSize must match too: the binary can change under the same version
        // string (nightly rebuilds); splicing two different binaries would only
        // fail at esp_ota_end after transferring the whole rest of the image.
        if (availableVersion == this->ota.version && offeredSize == this->ota.totalSize)
        {
            // Server re-offered the same update, e.g. after a websocket reconnect.
            // Chunk reads are stateless on the server, so resume at bytesWritten
            // instead of aborting and restarting the whole transfer from 0.
            // consecutiveChunkFailures is intentionally NOT reset here - only real
            // chunk data (onChunk) counts as progress, so reconnect cycles that
            // never deliver a byte still hit the abort backstop.
            this->logger.errorf("Resuming OTA update at %u/%u bytes", this->ota.bytesWritten, this->ota.totalSize);
            this->lastChunkRequestSendFailed = false;
            this->readyForNextFirmwareChunk = true;
            return;
        }
        this->abortFirmwareUpdate("Different firmware offered mid-update");
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
    this->ota.version = availableVersion;
    this->consecutiveChunkFailures = 0;
    this->lastChunkRequestSendFailed = false;

    if (this->metaCallback)
    {
        this->logger.debugf("Firmware update available: %s > %s", FIRMWARE_VERSION, availableVersion.c_str());
        this->metaCallback(availableVersion.c_str());
    }

    this->updateFirmwareProgress(0);

    this->readyForNextFirmwareChunk = true;
}


void OtaUpdater::tick()
{
    if (this->firmwareUpdateFailedTimeMs != 0)
    {
        if (millis() - this->firmwareUpdateFailedTimeMs > 3000)
        {
            esp_restart();
        }
        return;
    }

    if (this->readyForNextFirmwareChunk)
    {
        // consecutiveChunkFailures is NOT reset here: onChunk() already clears it
        // per fragment, and the resume-accepted path must keep counting so reconnect
        // cycles that never deliver a byte still hit the abort backstop.
        this->requestNextFirmwareChunk();
        return;
    }

    if (this->lastFirmwareChunkRequestTimeMs != 0)
    {
        const uint32_t waitMs = this->lastChunkRequestSendFailed
                                    ? this->FIRMWARE_CHUNK_SEND_RETRY_DELAY_MS
                                    : this->FIRMWARE_CHUNK_REQUEST_RESPONSE_TIMEOUT_MS;
        if (millis() - this->lastFirmwareChunkRequestTimeMs > waitMs)
        {
            if (this->consecutiveChunkFailures >= MAX_CONSECUTIVE_CHUNK_FAILURES)
            {
                this->abortFirmwareUpdate("Firmware chunk request timeout");
                return;
            }
            this->consecutiveChunkFailures++;
            if (this->lastChunkRequestSendFailed)
            {
                // TX failed (queue full/alloc): re-request on the same socket
                this->logger.errorf("Firmware chunk send failed at offset %u, retry %u/%u",
                                    (unsigned)this->ota.bytesWritten,
                                    (unsigned)this->consecutiveChunkFailures,
                                    (unsigned)MAX_CONSECUTIVE_CHUNK_FAILURES);
                this->requestNextFirmwareChunk();
            }
            else
            {
                // Response timeout: force a fresh socket so any stale in-flight
                // response from the previous request cannot arrive and be written
                // out-of-sequence. begin() resumes from bytesWritten after re-auth.
                this->logger.errorf("Firmware chunk timeout at offset %u, reconnecting (retry %u/%u)",
                                    (unsigned)this->ota.bytesWritten,
                                    (unsigned)this->consecutiveChunkFailures,
                                    (unsigned)MAX_CONSECUTIVE_CHUNK_FAILURES);
                this->lastFirmwareChunkRequestTimeMs = millis(); // give reconnect time to complete
                this->forceReconnect("OTA chunk timeout");
            }
        }
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
