#pragma once

// AES-128 (FIPS 197), AES-CBC without padding, AES-CMAC (RFC 4493) and CRC-32 for the simulated
// cards. Compact and dependency free so the simulator and the host tests build everywhere; it is
// not meant for anything but simulated cards.

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <vector>

namespace VirtualCardCrypto
{
using Block = std::array<uint8_t, 16>;

// ---- AES-128 (FIPS 197), compact table-free-ish implementation for the simulator -------------
struct AesTables
{
    uint8_t sbox[256];
    uint8_t inv[256];
    AesTables()
    {
        uint8_t p = 1, q = 1;
        do
        {
            p = p ^ (p << 1) ^ ((p & 0x80) ? 0x1B : 0);
            q ^= q << 1;
            q ^= q << 2;
            q ^= q << 4;
            if (q & 0x80) q ^= 0x09;
            const uint8_t x = q ^ (q << 1 | q >> 7) ^ (q << 2 | q >> 6) ^ (q << 3 | q >> 5) ^ (q << 4 | q >> 4);
            sbox[p] = x ^ 0x63;
        } while (p != 1);
        sbox[0] = 0x63;
        for (int i = 0; i < 256; ++i) inv[sbox[i]] = static_cast<uint8_t>(i);
    }
};
inline const AesTables &tables()
{
    static const AesTables instance;
    return instance;
}

inline uint8_t xtime(uint8_t x) { return static_cast<uint8_t>((x << 1) ^ ((x & 0x80) ? 0x1B : 0)); }
inline uint8_t mul(uint8_t a, uint8_t b)
{
    uint8_t result = 0;
    while (b)
    {
        if (b & 1) result ^= a;
        a = xtime(a);
        b >>= 1;
    }
    return result;
}

struct Aes128
{
    uint8_t round[11][16];
    explicit Aes128(const uint8_t *key)
    {
        memcpy(round[0], key, 16);
        uint8_t rcon = 1;
        for (int i = 1; i < 11; ++i)
        {
            uint8_t *previous = round[i - 1];
            uint8_t *current = round[i];
            current[0] = previous[0] ^ tables().sbox[previous[13]] ^ rcon;
            current[1] = previous[1] ^ tables().sbox[previous[14]];
            current[2] = previous[2] ^ tables().sbox[previous[15]];
            current[3] = previous[3] ^ tables().sbox[previous[12]];
            for (int j = 4; j < 16; ++j) current[j] = previous[j] ^ current[j - 4];
            rcon = xtime(rcon);
        }
    }
    void encrypt(const uint8_t *in, uint8_t *out) const
    {
        uint8_t s[16];
        for (int i = 0; i < 16; ++i) s[i] = in[i] ^ round[0][i];
        for (int r = 1; r <= 10; ++r)
        {
            uint8_t t[16];
            for (int i = 0; i < 16; ++i) t[i] = tables().sbox[s[i]];
            // ShiftRows
            for (int c = 0; c < 4; ++c)
                for (int row = 0; row < 4; ++row) s[c * 4 + row] = t[((c + row) % 4) * 4 + row];
            if (r != 10)
                for (int c = 0; c < 4; ++c)
                {
                    uint8_t *col = s + c * 4;
                    const uint8_t a0 = col[0], a1 = col[1], a2 = col[2], a3 = col[3];
                    col[0] = xtime(a0) ^ (xtime(a1) ^ a1) ^ a2 ^ a3;
                    col[1] = a0 ^ xtime(a1) ^ (xtime(a2) ^ a2) ^ a3;
                    col[2] = a0 ^ a1 ^ xtime(a2) ^ (xtime(a3) ^ a3);
                    col[3] = (xtime(a0) ^ a0) ^ a1 ^ a2 ^ xtime(a3);
                }
            for (int i = 0; i < 16; ++i) s[i] ^= round[r][i];
        }
        memcpy(out, s, 16);
    }
    void decrypt(const uint8_t *in, uint8_t *out) const
    {
        uint8_t s[16];
        for (int i = 0; i < 16; ++i) s[i] = in[i] ^ round[10][i];
        for (int r = 9; r >= 0; --r)
        {
            uint8_t t[16];
            // InvShiftRows
            for (int c = 0; c < 4; ++c)
                for (int row = 0; row < 4; ++row) t[((c + row) % 4) * 4 + row] = s[c * 4 + row];
            for (int i = 0; i < 16; ++i) s[i] = tables().inv[t[i]] ^ round[r][i];
            if (r != 0)
                for (int c = 0; c < 4; ++c)
                {
                    uint8_t *col = s + c * 4;
                    const uint8_t a0 = col[0], a1 = col[1], a2 = col[2], a3 = col[3];
                    col[0] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
                    col[1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
                    col[2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
                    col[3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
                }
        }
        memcpy(out, s, 16);
    }
};

inline std::vector<uint8_t> cbcEncrypt(const uint8_t *key, const Block &iv, const uint8_t *data, size_t length)
{
    Aes128 aes(key);
    std::vector<uint8_t> out(length);
    Block chain = iv;
    for (size_t offset = 0; offset < length; offset += 16)
    {
        uint8_t block[16];
        for (int i = 0; i < 16; ++i) block[i] = data[offset + i] ^ chain[i];
        aes.encrypt(block, out.data() + offset);
        memcpy(chain.data(), out.data() + offset, 16);
    }
    return out;
}

inline std::vector<uint8_t> cbcDecrypt(const uint8_t *key, const Block &iv, const uint8_t *data, size_t length)
{
    Aes128 aes(key);
    std::vector<uint8_t> out(length);
    Block chain = iv;
    for (size_t offset = 0; offset < length; offset += 16)
    {
        uint8_t block[16];
        aes.decrypt(data + offset, block);
        for (int i = 0; i < 16; ++i) out[offset + i] = block[i] ^ chain[i];
        memcpy(chain.data(), data + offset, 16);
    }
    return out;
}

inline void doubleBlock(Block &block)
{
    const bool carry = block[0] & 0x80;
    for (int i = 0; i < 15; ++i) block[i] = static_cast<uint8_t>((block[i] << 1) | (block[i + 1] >> 7));
    block[15] = static_cast<uint8_t>(block[15] << 1);
    if (carry) block[15] ^= 0x87;
}

// ---- AES-CMAC (RFC 4493) ----------------------------------------------------------------------
inline Block cmac(const uint8_t *key, const std::vector<uint8_t> &message)
{
    Aes128 aes(key);
    Block l{};
    aes.encrypt(l.data(), l.data());
    Block k1 = l;
    doubleBlock(k1);
    Block k2 = k1;
    doubleBlock(k2);

    const size_t blocks = message.empty() ? 1 : (message.size() + 15) / 16;
    const bool complete = !message.empty() && message.size() % 16 == 0;
    Block x{};
    for (size_t i = 0; i < blocks; ++i)
    {
        Block block{};
        const size_t start = i * 16;
        const size_t count = std::min<size_t>(16, message.size() - std::min(message.size(), start));
        if (count) memcpy(block.data(), message.data() + start, count);
        if (i == blocks - 1)
        {
            if (complete)
            {
                for (int j = 0; j < 16; ++j) block[j] ^= k1[j];
            }
            else
            {
                block[count] = 0x80;
                for (int j = 0; j < 16; ++j) block[j] ^= k2[j];
            }
        }
        for (int j = 0; j < 16; ++j) x[j] ^= block[j];
        aes.encrypt(x.data(), x.data());
    }
    return x;
}

/** MACt: bytes 1, 3, ..., 15 of the full CMAC. */
inline std::array<uint8_t, 8> truncatedMac(const uint8_t *key, const std::vector<uint8_t> &message)
{
    const Block full = cmac(key, message);
    std::array<uint8_t, 8> mac{};
    for (int i = 0; i < 8; ++i) mac[i] = full[1 + 2 * i];
    return mac;
}

inline uint32_t crc32(const uint8_t *data, size_t length)
{
    uint32_t crc = 0xFFFFFFFF;
    for (size_t i = 0; i < length; ++i)
    {
        crc ^= data[i];
        for (int bit = 0; bit < 8; ++bit) crc = (crc >> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
    return ~crc;
}
}
