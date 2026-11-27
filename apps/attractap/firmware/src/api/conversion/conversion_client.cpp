// ConversionLink: the plain app's conversion client (transfer, dispatch, status) or, on other builds, the secure app's
// migration status and no-ops. See conversion_client.hpp and the README section "Secure this reader".
#include "conversion_link.hpp"

#include "conversion_build.hpp"
#include "conversion_migration.hpp"

#if defined(ESP_PLATFORM) && defined(ATTRACTAP_CONVERSION_CLIENT)

#include <cstring>

#include "../../logger/logger.hpp"
#include "../../platform.hpp"
#include "conversion_client.hpp"
#include "conversion_efuse.hpp"
#include "conversion_ui.hpp"
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "staging_flash.hpp"

namespace
{
    Logger logger("Conversion");
    constexpr uint32_t SEND_RETRY_MS = 200;

    using ConversionClient::state;

    uint32_t appChunks()
    {
        return Staging::chunkCount(state().header.appSize);
    }

    uint32_t bootloaderChunks()
    {
        return Staging::chunkCount(state().header.bootloaderSize);
    }

    int percentDone(uint32_t appDone, uint32_t bootloaderDone)
    {
        const uint32_t total = appChunks() + bootloaderChunks();
        return total == 0 ? 0 : static_cast<int>((uint64_t)(appDone + bootloaderDone) * 100 / total);
    }

    const esp_partition_t *slotAt(uint32_t address)
    {
        esp_partition_iterator_t it = esp_partition_find(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_ANY, nullptr);
        const esp_partition_t *found = nullptr;
        for (; it && !found; it = esp_partition_next(it))
        {
            const esp_partition_t *p = esp_partition_get(it);
            if (p->address == address)
            {
                found = p;
            }
        }
        esp_partition_iterator_release(it);
        return found;
    }

    // Sends the next chunk request, or moves on once both images are in.
    void requestNext()
    {
        ConversionClient::State &s = state();
        const uint32_t appDone = StagingFlash::appChunksDone(s.header);
        const uint32_t bootloaderDone = StagingFlash::bootloaderChunksDone(s.header);
        ConversionClient::showPhase(static_cast<int>(ConversionUi::Phase::Transfer), percentDone(appDone, bootloaderDone));
        if (appDone >= appChunks() && bootloaderDone >= bootloaderChunks())
        {
            s.transferring = false;
            if (ConversionClient::stageNvs())
            {
                ConversionClient::verifyStaged();
            }
            else
            {
                logger.error("Could not stage the NVS backup");
                ConversionClient::sendControl(ConversionMessages::verified(s.header.conversionId, {"staging"}));
                ConversionClient::finish("staging failed");
            }
            return;
        }
        s.item = appDone >= appChunks();
        s.chunk = s.item ? bootloaderDone : appDone;
        const uint32_t size = s.item ? s.header.bootloaderSize : s.header.appSize;
        const uint32_t offset = s.chunk * Staging::CHUNK;
        s.expected = size - offset < Staging::CHUNK ? size - offset : Staging::CHUNK;
        s.received = 0;
        const std::string request = ConversionMessages::chunkRequest(
            s.header.conversionId, s.item ? ConversionMessages::ITEM_BOOTLOADER : ConversionMessages::ITEM_APP, offset,
            s.expected);
        // A refused request (full send queue) is sent again from loop() a little later.
        s.waiting = s.ports.sendApp && s.ports.sendApp(request);
        s.requestedAtMs = millis();
    }

    // Writes one complete chunk where it belongs and marks it done.
    bool storeChunk()
    {
        ConversionClient::State &s = state();
        const uint32_t offset = s.chunk * Staging::CHUNK;
        if (!s.item)
        {
            const esp_partition_t *slot = slotAt(s.header.appSlotOffset);
            return slot && esp_partition_erase_range(slot, offset, Staging::CHUNK) == ESP_OK &&
                   esp_partition_write(slot, offset, s.buffer.get(), s.expected) == ESP_OK &&
                   StagingFlash::markAppChunkDone(s.chunk);
        }
        // A sector may hold a half write from before a power cut: erase it again.
        return StagingFlash::erase(Staging::BOOTLOADER_OFFSET + offset, Staging::CHUNK) &&
               StagingFlash::write(Staging::BOOTLOADER_OFFSET + offset, s.buffer.get(), s.expected) &&
               StagingFlash::markBootloaderChunkDone(s.chunk);
    }

    Staging::Header headerFor(const ConversionMessages::Offer &offer, uint32_t slotAddress)
    {
        Staging::Header header;
        header.conversionId = offer.id;
        header.digest0 = offer.digest0;
        header.digest1 = offer.digest1;
        header.appSize = offer.appSize;
        header.appSha256 = offer.appSha256;
        header.bootloaderSize = offer.bootloaderSize;
        header.bootloaderSha256 = offer.bootloaderSha256;
        header.appSlotOffset = slotAddress;
        return header;
    }

    void onOffer(JsonVariantConst message)
    {
        ConversionClient::State &s = state();
        ConversionMessages::Offer offer;
        if (!ConversionMessages::parseOffer(message, offer))
        {
            logger.error("Ignoring a malformed conversion offer");
            return;
        }
        const esp_partition_t *slot = esp_ota_get_next_update_partition(nullptr);
        if (!slot || slot->size < offer.appSize || !StagingFlash::available())
        {
            logger.error("No app slot or staging region for the conversion");
            ConversionClient::sendControl(ConversionMessages::verified(offer.id, {"staging"}));
            return;
        }
        const Staging::Header wanted = headerFor(offer, slot->address);
        Staging::Header stored;
        if (!(StagingFlash::readHeader(stored) && Staging::sameTransfer(stored, wanted)))
        {
            logger.info("Starting the conversion transfer");
            if (!StagingFlash::startTransfer(wanted))
            {
                ConversionClient::sendControl(ConversionMessages::verified(offer.id, {"staging"}));
                return;
            }
        }
        else
        {
            logger.info("Resuming the conversion transfer");
        }
        s.offer = offer;
        s.haveOffer = true;
        s.header = wanted;
        if (!s.buffer)
        {
            s.buffer.reset(new (std::nothrow) uint8_t[Staging::CHUNK]);
        }
        if (!s.buffer)
        {
            logger.error("No memory for the conversion transfer");
            return;
        }
        s.transferring = true;
        s.waiting = false;
        requestNext();
    }

    void onCancel(JsonVariantConst message)
    {
        ConversionClient::State &s = state();
        const uint32_t id = ConversionMessages::commandId(message);
        Staging::Header stored;
        const bool haveHeader = StagingFlash::readHeader(stored);
        // After the burn the region stays: the next write-bootloader still needs it.
        const ConversionMessages::KeySlot key0 = ConversionEfuse::keySlot(0);
        if (haveHeader && (id == 0 || id != stored.conversionId || (key0.digestPurpose && key0.value == stored.digest0)))
        {
            // Not this conversion, or past the burn: nothing is wiped; the server gets the reader's view again.
            ConversionClient::sendControl(ConversionLink::statusMessage());
            return;
        }
        logger.info("Conversion cancelled by the server");
        s.transferring = false;
        s.waiting = false;
        StagingFlash::wipe();
        ConversionClient::sendControl(ConversionLink::statusMessage());
        ConversionClient::finish("cancelled");
    }

    void onPreflight(JsonVariantConst message)
    {
        ConversionMessages::PreflightFacts facts = ConversionEfuse::preflightFacts();
        facts.variant = FIRMWARE_VARIANT;
        facts.version = FIRMWARE_VERSION;
        facts.profile = "plain";
        ConversionClient::sendControl(ConversionMessages::preflightReport(ConversionMessages::commandId(message), facts));
    }
}

namespace ConversionClient
{
    State &state()
    {
        static State instance;
        return instance;
    }

    bool sendControl(const std::string &json)
    {
        return state().ports.sendControl && state().ports.sendControl(json);
    }

    void showPhase(int phase, int percent)
    {
        state().tookScreen = state().tookScreen || phase != static_cast<int>(ConversionUi::Phase::None);
        ConversionUi::set(static_cast<ConversionUi::Phase>(phase), percent);
    }

    void finish(const char *reason)
    {
        State &s = state();
        s.transferring = false;
        s.waiting = false;
        if (ConversionUi::phase() == ConversionUi::Phase::Bootloader)
        {
            return; // the reboot into the secure bootloader follows; nothing to give back
        }
        if (s.tookScreen && s.restartAtMs == 0)
        {
            logger.infof("Conversion stopped (%s); restarting", reason);
            s.restartAtMs = millis() + RESTART_DELAY_MS;
            return;
        }
        ConversionUi::set(ConversionUi::Phase::None);
    }

    void yieldBriefly()
    {
        vTaskDelay(1);
    }
}

namespace ConversionLink
{
    void setPorts(Ports ports)
    {
        state().ports = std::move(ports);
    }

    void onSessionOpened()
    {
        state().sessionOpen = true;
        state().lastCommandMs = millis();
    }

    void onSessionClosed()
    {
        ConversionClient::State &s = state();
        s.sessionOpen = false;
        // A chunk answer carries no offset: nothing is requested again until the next session's offer.
        s.transferring = false;
        s.waiting = false;
    }

    std::string statusMessage()
    {
        ConversionMessages::Status status;
        Staging::Header header;
        if (!StagingFlash::readHeader(header))
        {
            return ConversionMessages::status(status);
        }
        status.id = header.conversionId;
        const uint32_t appDone = StagingFlash::appChunksDone(header);
        const uint32_t bootloaderDone = StagingFlash::bootloaderChunksDone(header);
        const uint32_t appBytes = appDone * Staging::CHUNK < header.appSize ? appDone * Staging::CHUNK : header.appSize;
        const uint32_t bootloaderBytes = bootloaderDone * Staging::CHUNK < header.bootloaderSize
                                             ? bootloaderDone * Staging::CHUNK
                                             : header.bootloaderSize;
        Staging::NvsRecord record;
        const bool complete = appBytes == header.appSize && bootloaderBytes == header.bootloaderSize &&
                              StagingFlash::readNvsRecord(record);
        const ConversionMessages::KeySlot key0 = ConversionEfuse::keySlot(0);
        const ConversionMessages::KeySlot key1 = ConversionEfuse::keySlot(1);
        if (complete && StagingFlash::verifiedFor(header.conversionId))
        {
            const bool burned = key0.digestPurpose && key0.value == header.digest0 && key1.digestPurpose &&
                                key1.value == header.digest1;
            status.stage = burned ? ConversionMessages::STAGE_BURNED : ConversionMessages::STAGE_VERIFIED;
        }
        else
        {
            status.stage = ConversionMessages::STAGE_TRANSFERRING;
            status.hasProgress = true;
            status.bytes = appBytes + bootloaderBytes;
            status.total = header.appSize + header.bootloaderSize;
        }
        return ConversionMessages::status(status);
    }

    void onControl(const char *type, JsonVariantConst message)
    {
        state().lastCommandMs = millis();
        if (strcmp(type, "conversion.preflight") == 0)
            onPreflight(message);
        else if (strcmp(type, "conversion.offer") == 0)
            onOffer(message);
        else if (strcmp(type, "conversion.burn") == 0)
            ConversionClient::onBurn(message);
        else if (strcmp(type, "conversion.write-bootloader") == 0)
            ConversionClient::onWriteBootloader(message);
        else if (strcmp(type, "conversion.cancel") == 0)
            onCancel(message);
        else
            logger.warn("Unknown conversion message ignored");
    }

    bool onBinary(const uint8_t *data, size_t length)
    {
        ConversionClient::State &s = state();
        if (!s.transferring || !s.waiting)
        {
            return false;
        }
        if (s.received + length > s.expected)
        {
            logger.error("Conversion chunk larger than requested; reconnecting");
            s.waiting = false;
            if (s.ports.reconnect)
                s.ports.reconnect("conversion chunk size");
            return true;
        }
        memcpy(s.buffer.get() + s.received, data, length);
        s.received += length;
        if (s.received < s.expected)
        {
            return true;
        }
        s.waiting = false;
        if (!storeChunk())
        {
            logger.error("Could not write a conversion chunk");
            ConversionClient::sendControl(ConversionMessages::verified(s.header.conversionId, {"staging"}));
            ConversionClient::finish("flash write failed");
            return true;
        }
        s.lastCommandMs = millis();
        requestNext();
        return true;
    }

    void loop()
    {
        ConversionClient::State &s = state();
        const uint32_t now = millis();
        if (s.restartAtMs != 0 && static_cast<int32_t>(now - s.restartAtMs) >= 0)
        {
            esp_restart();
        }
        if (s.transferring && s.sessionOpen && !s.waiting && now - s.requestedAtMs > SEND_RETRY_MS)
        {
            requestNext(); // a request the send queue refused earlier
            return;
        }
        if (s.transferring && s.waiting && now - s.requestedAtMs > ConversionClient::CHUNK_TIMEOUT_MS)
        {
            logger.error("Conversion chunk timed out; reconnecting");
            s.waiting = false;
            s.transferring = false;
            if (s.ports.reconnect)
                s.ports.reconnect("conversion chunk timeout");
            return;
        }
        const ConversionUi::Phase phase = ConversionUi::phase();
        if (!s.transferring && phase != ConversionUi::Phase::None && phase != ConversionUi::Phase::Bootloader &&
            now - s.lastCommandMs > ConversionClient::IDLE_TIMEOUT_MS)
        {
            ConversionClient::finish("no command from the server");
        }
    }

    bool advertised()
    {
        return true;
    }
}

#else // builds without a conversion client

namespace ConversionLink
{
    void setPorts(Ports) {}
    void onSessionOpened() {}
    void onSessionClosed() {}
    std::string statusMessage()
    {
        // A secure app reports the outcome of its first-boot migration; other builds report nothing.
        return ConversionMigration::statusMessage();
    }
    void onControl(const char *, JsonVariantConst) {}
    bool onBinary(const uint8_t *, size_t) { return false; }
    void loop() {}
    bool advertised() { return false; }
}

#endif
