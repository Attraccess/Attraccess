#include "rsa_der.hpp"

#include <algorithm>
#include <cstring>

namespace
{
    // SEQUENCE { SEQUENCE { rsaEncryption, NULL }, BIT STRING { SEQUENCE { INTEGER n (385 bytes), INTEGER e } } }
    // up to and including the leading zero byte of the modulus integer.
    constexpr uint8_t SPKI_PREFIX[] = {0x30, 0x82, 0x01, 0xa2, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48,
                                       0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x01,
                                       0x8f, 0x00, 0x30, 0x82, 0x01, 0x8a, 0x02, 0x82, 0x01, 0x81, 0x00};
    constexpr uint8_t SPKI_SUFFIX[] = {0x02, 0x03, 0x01, 0x00, 0x01};
    constexpr size_t PREFIX_BYTES = sizeof(SPKI_PREFIX);

    struct Reader
    {
        const uint8_t *p;
        const uint8_t *end;

        // Reads one TLV with the expected tag; `value` points into the buffer.
        bool next(uint8_t tag, const uint8_t *&value, size_t &length)
        {
            if (end - p < 2 || p[0] != tag)
            {
                return false;
            }
            size_t len = p[1];
            size_t header = 2;
            if (len & 0x80)
            {
                const size_t count = len & 0x7f;
                if (count == 0 || count > 2 || static_cast<size_t>(end - p) < 2 + count)
                {
                    return false;
                }
                len = 0;
                for (size_t i = 0; i < count; i++)
                {
                    len = (len << 8) | p[2 + i];
                }
                header += count;
            }
            if (static_cast<size_t>(end - p) < header + len)
            {
                return false;
            }
            value = p + header;
            length = len;
            p += header + len;
            return true;
        }
    };

    // INTEGER value without sign padding, as a view into the DER; false for negative or non-minimal encodings.
    bool unsignedInteger(const uint8_t *&value, size_t &length)
    {
        if (length == 0 || (value[0] & 0x80))
        {
            return false;
        }
        if (length > 1 && value[0] == 0 && !(value[1] & 0x80))
        {
            return false;
        }
        if (value[0] == 0 && length > 1)
        {
            value++;
            length--;
        }
        return true;
    }

    // The next INTEGER of `seq` as an unsigned view.
    bool nextInteger(Reader &seq, const uint8_t *&value, size_t &length)
    {
        return seq.next(0x02, value, length) && unsignedInteger(value, length);
    }
}

namespace RsaDer
{
    std::vector<uint8_t> spkiFromModulus(const uint8_t *modulus, size_t length)
    {
        if (!modulus || length != MODULUS_BYTES || !(modulus[0] & 0x80) || !(modulus[length - 1] & 1))
        {
            return {};
        }
        std::vector<uint8_t> spki(SPKI_PREFIX, SPKI_PREFIX + PREFIX_BYTES);
        spki.insert(spki.end(), modulus, modulus + length);
        spki.insert(spki.end(), SPKI_SUFFIX, SPKI_SUFFIX + sizeof(SPKI_SUFFIX));
        return spki;
    }

    bool isCanonicalRsa3072Spki(const std::vector<uint8_t> &spki)
    {
        return spki.size() == SPKI_BYTES && memcmp(spki.data(), SPKI_PREFIX, PREFIX_BYTES) == 0 &&
               memcmp(spki.data() + PREFIX_BYTES + MODULUS_BYTES, SPKI_SUFFIX, sizeof(SPKI_SUFFIX)) == 0 &&
               (spki[PREFIX_BYTES] & 0x80) && (spki[PREFIX_BYTES + MODULUS_BYTES - 1] & 1);
    }

    std::vector<uint8_t> modulusFromSpki(const std::vector<uint8_t> &spki)
    {
        if (!isCanonicalRsa3072Spki(spki))
        {
            return {};
        }
        return std::vector<uint8_t>(spki.begin() + PREFIX_BYTES, spki.begin() + PREFIX_BYTES + MODULUS_BYTES);
    }

    void wipe(void *data, size_t length)
    {
        volatile uint8_t *p = static_cast<volatile uint8_t *>(data);
        while (length--)
        {
            *p++ = 0;
        }
    }

    bool parsePrivateKey(const uint8_t *der, size_t length, PrivateKeyParts &out)
    {
        // Views into `der` only: nothing secret is copied until every check has passed.
        Reader outer{der, der + length};
        const uint8_t *body = nullptr;
        size_t bodyLength = 0;
        const uint8_t *version = nullptr, *n = nullptr, *e = nullptr, *d = nullptr;
        size_t versionLength = 0, nLength = 0, eLength = 0, dLength = 0;
        static const uint8_t EXPONENT[] = {0x01, 0x00, 0x01};
        bool ok = der && outer.next(0x30, body, bodyLength) && outer.p == outer.end;
        Reader seq{body, body + bodyLength};
        ok = ok && nextInteger(seq, version, versionLength) && versionLength == 1 && version[0] == 0 &&
             nextInteger(seq, n, nLength) && nextInteger(seq, e, eLength) && nextInteger(seq, d, dLength) &&
             nLength == MODULUS_BYTES && (n[0] & 0x80) && eLength == sizeof(EXPONENT) &&
             memcmp(e, EXPONENT, sizeof(EXPONENT)) == 0 && dLength <= MODULUS_BYTES;
        out.clear();
        if (!ok)
        {
            return false;
        }
        memcpy(out.modulus.data(), n, MODULUS_BYTES);
        // Right-aligned into the fixed buffer: the zero padding is already there.
        memcpy(out.privateExponent.data() + MODULUS_BYTES - dLength, d, dLength);
        return true;
    }
}
