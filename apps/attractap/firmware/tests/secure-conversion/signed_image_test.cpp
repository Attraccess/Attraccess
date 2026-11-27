// The plain reader's check of a Secure Boot v2 signed image (ATT-1208, step 3) against espsecure's own output: the
// API's signer fixture (apps/api/src/attractap/secure-boot/fixtures, see its README). The digest below is what
// `espsecure digest-sbv2-public-key` prints for the fixture's throwaway key, i.e. what KEY0 would hold.
#include <cstring>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include "api/conversion/signed_image.hpp"
#include "check.hpp"

namespace
{
    const char *KEY_DIGEST = "247299cee1b5d78f6bd72ad92cc4e2b148ec077b68bf8725f71381f4df144ddc";
    const char *SIGNED_SHA256 = "ae150b1aef73cb9b25751e1241497c7a705e223ee86fc51d761ce40829e75406";

    std::vector<uint8_t> load(const char *name)
    {
        std::ifstream in(std::string(SIGNER_FIXTURES) + "/" + name, std::ios::binary);
        return std::vector<uint8_t>(std::istreambuf_iterator<char>(in), {});
    }

    SignedImage::Read reader(const std::vector<uint8_t> &image)
    {
        return [&image](uint32_t offset, uint8_t *out, size_t length) {
            if (offset > image.size() || length > image.size() - offset)
                return false;
            memcpy(out, image.data() + offset, length);
            return true;
        };
    }

    std::string hex(const Staging::Digest &digest)
    {
        return Staging::hex(digest.data(), digest.size());
    }
}

void runSignedImageTests()
{
    const std::vector<uint8_t> image = load("image.signed.bin");
    CHECK(image.size() == 12288, "the espsecure fixture is there");
    if (image.size() != 12288)
        return;

    int yields = 0;
    SignedImage::Result result = SignedImage::verify(reader(image), image.size(), [&yields] { yields++; });
    CHECK(result.signatureValid, "espsecure's signature verifies");
    CHECK(hex(result.keyDigest) == KEY_DIGEST, "key digest equals espsecure's eFuse digest");
    CHECK(hex(result.imageSha256) == SIGNED_SHA256, "hash of the whole signed image");
    CHECK(yields == 3, "yields once per 4 KiB sector");

    std::vector<uint8_t> tampered = image;
    tampered[100] ^= 0x01;
    result = SignedImage::verify(reader(tampered), tampered.size());
    CHECK(!result.signatureValid, "a changed content byte fails");
    CHECK(hex(result.imageSha256) != SIGNED_SHA256, "and changes the image hash");

    tampered = image;
    tampered[image.size() - 4096 + 36 + 776 + 10] ^= 0x01; // inside the RSA signature, CRC fixed below
    {
        uint8_t *block = tampered.data() + image.size() - 4096;
        const uint32_t crc = Staging::crc32(block, 1196);
        for (int i = 0; i < 4; i++)
            block[1196 + i] = static_cast<uint8_t>(crc >> (8 * i));
    }
    CHECK(!SignedImage::verify(reader(tampered), tampered.size()).signatureValid, "a changed signature fails");

    tampered = image;
    tampered[image.size() - 4096 + 50] ^= 0x01; // inside the key, CRC left broken
    CHECK(!SignedImage::verify(reader(tampered), tampered.size()).signatureValid, "a broken block CRC fails");

    CHECK(!SignedImage::verify(reader(image), image.size() - 1).signatureValid, "an unaligned size fails");
    CHECK(!SignedImage::verify(reader(image), 4096).signatureValid, "a lone signature sector fails");
    SignedImage::Read failing = [](uint32_t, uint8_t *, size_t) { return false; };
    result = SignedImage::verify(failing, image.size());
    CHECK(!result.signatureValid && result.readFailed, "a flash read error fails");

    // Marker search, also across a 4 KiB boundary.
    std::vector<uint8_t> app(3 * 4096, 0);
    const std::string marker = "attractap-secure-profile-v1";
    memcpy(app.data() + 4096 - 10, marker.data(), marker.size());
    CHECK(SignedImage::contains(reader(app), app.size(), marker), "marker across a sector boundary is found");
    CHECK(!SignedImage::contains(reader(app), app.size(), "attractap-secure-profile-v2"), "another marker is not");
    std::string name = std::string("attractap_touch_v2") + '\0';
    memcpy(app.data() + 9000, name.data(), name.size());
    CHECK(SignedImage::contains(reader(app), app.size(), name), "firmware name with its terminator");
    CHECK(!SignedImage::contains(reader(app), app.size(), std::string("attractap_touch") + '\0'),
          "a shorter firmware name (Touch V1) does not match a V2 image");

    // esp_app_desc_t right after the image and first segment headers.
    std::vector<uint8_t> head(64, 0);
    head[0] = SignedImage::IMAGE_MAGIC;
    const uint8_t descMagic[4] = {0x32, 0x54, 0xcd, 0xab};
    memcpy(head.data() + 32, descMagic, 4);
    head[36] = 3;
    SignedImage::AppInfo info = SignedImage::appInfo(reader(head), head.size());
    CHECK(info.valid && info.secureVersion == 3, "secure_version from the app description");
    head[32] = 0;
    CHECK(!SignedImage::appInfo(reader(head), head.size()).valid, "no app description, no version");
}
