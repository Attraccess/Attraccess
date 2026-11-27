#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

#include "staging_format.hpp"

// Checks a Secure Boot v2 (RSA-3072) signed image the way the ROM and the secure bootloader will (ATT-1208, step 3),
// so a plain reader never burns digests for images that would not boot: the signature sector at the end of the
// image, its CRC, the image digest it signs, the RSA-PSS signature and the digest of the public key in it (what
// KEY0 must hold). Mirrors apps/api/src/attractap/secure-boot/secure-boot-signer.ts. Pure apart from PSA crypto,
// so it runs in the host tests; flash access comes in through `Read`.
namespace SignedImage
{
    constexpr uint32_t SECTOR = 4096;
    constexpr size_t SIG_BLOCK_BYTES = 1216;

    // Reads `length` bytes at `offset` of the image; false on a flash error.
    using Read = std::function<bool(uint32_t offset, uint8_t *out, size_t length)>;

    struct Result
    {
        // Signature block 0 is well-formed, signs this image and verifies with the key it carries.
        bool signatureValid = false;
        // SHA-256 of the key fields of block 0 (N, e, R, M'): the eFuse digest of the signing key.
        Staging::Digest keyDigest{};
        // SHA-256 of the whole signed image, signature sector included (what the server's offer names).
        Staging::Digest imageSha256{};
        bool readFailed = false;
    };

    // `yield` runs between 4 KiB reads (feeds the task watchdog on the device); may be empty.
    Result verify(const Read &read, uint32_t size, const std::function<void()> &yield = {});

    // The image contains `needle` (e.g. the secure profile marker). Searches across read boundaries.
    bool contains(const Read &read, uint32_t size, const std::string &needle, const std::function<void()> &yield = {});

    struct AppInfo
    {
        bool valid = false;
        uint32_t secureVersion = 0;
    };
    // The esp_app_desc_t at the start of the first segment of an app image (magic 0xABCD5432).
    AppInfo appInfo(const Read &read, uint32_t size);

    // The first byte of every ESP image (bootloader and app).
    constexpr uint8_t IMAGE_MAGIC = 0xE9;
}
