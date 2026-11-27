#pragma once

#include <cstddef>
#include <cstdint>

#include "staging_format.hpp"

// Flash access to the staging region (staging_format.hpp). Device only; on the host every call fails and `pending()`
// is false. Used by the plain app (steps 2-6) and by the secure app's first boot (step 8) and NVS erase gate.
namespace StagingFlash
{
    // The region exists: a `spiffs` partition at the layout of partitions.csv (not on the 4 MB bridge layout).
    bool available();
    bool read(uint32_t offset, void *out, size_t length);
    bool write(uint32_t offset, const void *data, size_t length);
    bool erase(uint32_t offset, size_t length);

    bool readHeader(Staging::Header &out);
    // Writes a new header after wiping the whole region. A cut during the wipe leaves the old header (another
    // conversion, so the next offer starts over); a cut after it leaves no header.
    bool startTransfer(const Staging::Header &header);
    // Erases the region in Staging::WIPE_ORDER, the header sector last: a wipe cut short still counts as pending, so
    // the plaintext NVS backup is never left behind without a header.
    bool wipe();

    // Progress bitmaps (staging_format.hpp): chunks done in a row, and marking one more done.
    uint32_t appChunksDone(const Staging::Header &header);
    uint32_t bootloaderChunksDone(const Staging::Header &header);
    bool markAppChunkDone(uint32_t chunk);
    bool markBootloaderChunkDone(uint32_t chunk);

    bool readNvsRecord(Staging::NvsRecord &out);
    bool writeNvsRecord(const Staging::NvsRecord &record);
    bool verifiedFor(uint32_t conversionId);
    bool markVerified(uint32_t conversionId);

    // A conversion's data waits in the region: a valid header. While true nothing may erase NVS (main.cpp, bridge).
    bool pending();
}
