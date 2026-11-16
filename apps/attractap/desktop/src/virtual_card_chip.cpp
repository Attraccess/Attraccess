#include "virtual_card_chip.hpp"
#include "virtual_card_crypto.hpp"

#include <algorithm>
#include <cstring>
#include <random>

using namespace VirtualCardCrypto;

namespace
{
void append(std::vector<uint8_t> &to, const uint8_t *data, size_t length) { to.insert(to.end(), data, data + length); }
}

VirtualCardChip::VirtualCardChip(std::function<void(uint8_t *, size_t)> randomSource) : random(std::move(randomSource))
{
    if (!random)
    {
        random = [](uint8_t *out, size_t length) {
            static std::random_device device;
            static std::mt19937_64 engine(device());
            for (size_t i = 0; i < length; ++i) out[i] = static_cast<uint8_t>(engine());
        };
    }
}

void VirtualCardChip::reset()
{
    applicationSelected = false;
    versionFrameIndex = 0;
    pending.reset();
    session.reset();
}

std::vector<uint8_t> VirtualCardChip::status(uint8_t sw2) { return {0x91, sw2}; }

std::vector<uint8_t> VirtualCardChip::error(uint8_t sw2)
{
    // Like a real card, an error status ends any authenticated session.
    session.reset();
    pending.reset();
    return status(sw2);
}

std::vector<uint8_t> VirtualCardChip::versionFrame(const Memory &memory, int frame, bool last)
{
    std::vector<uint8_t> body;
    if (frame == 1)
    {
        const uint8_t ntag[] = {0x04, 0x04, 0x02, 0x30, 0x00, 0x11, 0x05};
        const uint8_t desfire[] = {0x04, 0x01, 0x01, 0x12, 0x00, 0x1A, 0x05};
        if (memory.kind == Kind::Ntag424) append(body, ntag, sizeof(ntag));
        else append(body, desfire, sizeof(desfire));
    }
    else if (frame == 2)
    {
        const uint8_t sw[] = {0x04, 0x04, 0x02, 0x01, 0x02, 0x11, 0x05};
        append(body, sw, sizeof(sw));
    }
    else
    {
        const uint8_t production[] = {0x04, 0x6A, 0x15, 0x2B, 0x4C, 0x80, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08};
        append(body, production, sizeof(production));
    }
    body.push_back(0x91);
    body.push_back(last ? 0x00 : 0xAF);
    return body;
}

std::optional<std::vector<uint8_t>> VirtualCardChip::transceive(Memory &memory, const uint8_t *apdu, size_t length,
                                                                  const BeforeWriteHook &beforeWrite)
{
    if (memory.kind == Kind::Unknown || length < 5 || length > 62) return std::nullopt;
    const uint8_t cla = apdu[0];
    const uint8_t ins = apdu[1];
    const size_t dataLength = apdu[4];
    if (5 + dataLength > length) return std::nullopt;
    const uint8_t *data = apdu + 5;

    if (cla == 0x00 && ins == 0xA4)
    {
        session.reset();
        applicationSelected = memory.kind == Kind::Ntag424;
        return memory.kind == Kind::Ntag424 ? std::vector<uint8_t>{0x90, 0x00} : std::vector<uint8_t>{0x6A, 0x82};
    }
    switch (ins)
    {
    case 0x5A:
    {
        session.reset();
        static const uint8_t aid[] = {0x55, 0xCE, 0xAC};
        if (memory.kind != Kind::Desfire || !memory.applicationExists || dataLength != 3 || memcmp(data, aid, 3) != 0)
            return error(0xA0);
        applicationSelected = true;
        return status(0x00);
    }
    case 0xCA:
    {
        static const uint8_t expected[] = {0x55, 0xCE, 0xAC, 0x0F, 0x86};
        if (memory.kind != Kind::Desfire || dataLength != 5 || memcmp(data, expected, 5) != 0) return error(0x9E);
        if (memory.applicationExists) return error(0xDE);
        memory.applicationExists = true;
        return status(0x00);
    }
    case 0x64:
        if (!applicationSelected || dataLength < 1 || data[0] >= KeySlotCount) return error(0x40);
        return std::vector<uint8_t>{memory.keyVersions[data[0]], 0x91, 0x00};
    case 0x60:
        session.reset();
        versionFrameIndex = 1;
        return versionFrame(memory, 1, false);
    case 0x71:
        versionFrameIndex = 0;
        return authFirst(memory, dataLength ? data[0] : 0xFF);
    case 0xAF:
        if (versionFrameIndex > 0)
        {
            ++versionFrameIndex;
            const bool last = versionFrameIndex >= 3;
            auto frame = versionFrame(memory, versionFrameIndex, last);
            if (last) versionFrameIndex = 0;
            return frame;
        }
        return authSecond(memory, data, dataLength);
    case 0xC4:
        return changeKey(memory, apdu, length, beforeWrite);
    default:
        return error(0x1C);
    }
}

std::vector<uint8_t> VirtualCardChip::authFirst(Memory &memory, uint8_t keyNo)
{
    session.reset();
    if (memory.failAuthentication || !applicationSelected || keyNo >= KeySlotCount) return error(0x40);
    Pending next{keyNo, {}};
    random(next.rndB.data(), next.rndB.size());
    pending = next;
    const Block iv{};
    auto encrypted = cbcEncrypt(memory.keys[keyNo].data(), iv, next.rndB.data(), 16);
    encrypted.push_back(0x91);
    encrypted.push_back(0xAF);
    return encrypted;
}

std::vector<uint8_t> VirtualCardChip::authSecond(Memory &memory, const uint8_t *data, size_t length)
{
    if (!pending || length != 32) return error(0xCA);
    const Pending current = *pending;
    pending.reset();
    const Key &key = memory.keys[current.keyNo];
    const Block iv{};
    const auto plain = cbcDecrypt(key.data(), iv, data, 32);
    const uint8_t *rndA = plain.data();
    uint8_t rotB[16];
    for (int i = 0; i < 16; ++i) rotB[i] = current.rndB[(i + 1) % 16];
    if (memcmp(plain.data() + 16, rotB, 16) != 0) return error(0xAE);

    Session next;
    random(next.ti.data(), next.ti.size());
    uint8_t rotA[16];
    for (int i = 0; i < 16; ++i) rotA[i] = rndA[(i + 1) % 16];

    std::vector<uint8_t> body;
    append(body, next.ti.data(), 4);
    append(body, rotA, 16);
    body.insert(body.end(), 12, 0);
    auto encrypted = cbcEncrypt(key.data(), iv, body.data(), body.size());
    encrypted.push_back(0x91);
    encrypted.push_back(0x00);

    auto sessionVector = [&](uint8_t a, uint8_t b) {
        std::vector<uint8_t> sv = {a, b, 0, 1, 0, 0x80};
        append(sv, rndA, 2);
        for (int i = 0; i < 6; ++i) sv.push_back(rndA[2 + i] ^ current.rndB[i]);
        append(sv, current.rndB.data() + 6, 10);
        append(sv, rndA + 8, 8);
        return sv;
    };
    next.enc = cmac(key.data(), sessionVector(0xA5, 0x5A));
    next.mac = cmac(key.data(), sessionVector(0x5A, 0xA5));
    next.counter = 0;
    next.keyNo = current.keyNo;
    session = next;
    return encrypted;
}

std::vector<uint8_t> VirtualCardChip::changeKey(Memory &memory, const uint8_t *apdu, size_t length,
                                                const BeforeWriteHook &beforeWrite)
{
    if (!session) return error(0xAE);
    const size_t dataLength = apdu[4];
    const uint8_t *data = apdu + 5;
    if (dataLength < 1 + 8 + 16) return error(0x7E);
    const uint8_t keyNo = data[0];
    if (keyNo >= KeySlotCount) return error(0x40);

    const size_t encLength = dataLength - 1 - 8;
    const uint8_t *enc = data + 1;
    const uint8_t *mac = data + dataLength - 8;
    std::vector<uint8_t> macInput = {0xC4, static_cast<uint8_t>(session->counter & 0xFF),
                                     static_cast<uint8_t>(session->counter >> 8)};
    append(macInput, session->ti.data(), 4);
    macInput.push_back(keyNo);
    append(macInput, enc, encLength);
    const auto expected = truncatedMac(session->mac.data(), macInput);
    if (memcmp(expected.data(), mac, 8) != 0) return error(0x1E);

    // The key change reaches the card here: a host-only hook can pull the card out at this point.
    if (beforeWrite && beforeWrite()) return {};
    if (memory.failWrite) return error(0xEE);

    // Firmware quirk kept: the IV plaintext carries the counter's low byte only.
    Block ivPlain{};
    ivPlain[0] = 0xA5;
    ivPlain[1] = 0x5A;
    memcpy(ivPlain.data() + 2, session->ti.data(), 4);
    ivPlain[6] = static_cast<uint8_t>(session->counter & 0xFF);
    const Block zero{};
    const auto iv = cbcEncrypt(session->enc.data(), zero, ivPlain.data(), 16);
    Block ivBlock;
    memcpy(ivBlock.data(), iv.data(), 16);
    const auto plain = cbcDecrypt(session->enc.data(), ivBlock, enc, encLength);

    if (keyNo == 0)
    {
        memcpy(memory.keys[0].data(), plain.data(), 16);
        memory.keyVersions[0] = plain[16];
    }
    else
    {
        Key newKey{};
        for (int i = 0; i < 16; ++i) newKey[i] = plain[i] ^ memory.keys[keyNo][i];
        // The host sends the inverted CRC-32 of the new key, little endian.
        uint8_t expectedCrc[4];
        const uint32_t inverted = ~crc32(newKey.data(), 16);
        for (int i = 0; i < 4; ++i) expectedCrc[i] = static_cast<uint8_t>(inverted >> (8 * i));
        if (memcmp(expectedCrc, plain.data() + 17, 4) != 0) return error(0x1E);
        memory.keys[keyNo] = newKey;
        memory.keyVersions[keyNo] = plain[16];
    }

    if (keyNo == session->keyNo)
    {
        // Changing the key we authenticated with ends the session; no MAC follows.
        session.reset();
        return status(0x00);
    }
    ++session->counter;
    std::vector<uint8_t> responseInput = {0x00, static_cast<uint8_t>(session->counter & 0xFF),
                                          static_cast<uint8_t>(session->counter >> 8)};
    append(responseInput, session->ti.data(), 4);
    const auto responseMac = truncatedMac(session->mac.data(), responseInput);
    std::vector<uint8_t> response(responseMac.begin(), responseMac.end());
    response.push_back(0x91);
    response.push_back(0x00);
    return response;
}
