#include "ds_params.hpp"

#include <cstring>

namespace
{
    constexpr size_t N = DsParams::KEY_WORDS;
    constexpr size_t BYTES = N * 4;

    void bigEndianToWords(const uint8_t *in, uint32_t *words)
    {
        for (size_t i = 0; i < N; i++)
        {
            const uint8_t *p = in + BYTES - 4 * (i + 1);
            words[i] = (uint32_t(p[0]) << 24) | (uint32_t(p[1]) << 16) | (uint32_t(p[2]) << 8) | p[3];
        }
    }

    bool atLeast(const uint32_t *a, const uint32_t *m)
    {
        for (size_t i = N; i-- > 0;)
        {
            if (a[i] != m[i])
            {
                return a[i] > m[i];
            }
        }
        return true;
    }

    void subtract(uint32_t *a, const uint32_t *m)
    {
        uint64_t borrow = 0;
        for (size_t i = 0; i < N; i++)
        {
            const uint64_t diff = uint64_t(a[i]) - m[i] - borrow;
            a[i] = static_cast<uint32_t>(diff);
            borrow = (diff >> 32) & 1;
        }
    }
}

namespace DsParams
{
    bool compute(const uint8_t *modulus, const uint8_t *privateExponent, Operands &out)
    {
        if (!modulus || !privateExponent || !(modulus[0] & 0x80) || !(modulus[BYTES - 1] & 1))
        {
            return false;
        }
        memset(&out, 0, sizeof(out));
        bigEndianToWords(modulus, out.M);
        bigEndianToWords(privateExponent, out.Y);

        // Rb = 2^(2*3072) mod M by repeated doubling from 1: x < M stays below 2^3073, so one
        // conditional subtraction (with the carry out of the shift) reduces it.
        uint32_t x[N] = {1};
        for (size_t step = 0; step < 2 * RSA_BITS; step++)
        {
            uint32_t carry = 0;
            for (size_t i = 0; i < N; i++)
            {
                const uint32_t next = x[i] >> 31;
                x[i] = (x[i] << 1) | carry;
                carry = next;
            }
            if (carry || atLeast(x, out.M))
            {
                subtract(x, out.M);
            }
        }
        memcpy(out.Rb, x, sizeof(x));

        // Newton iteration for the inverse of the odd low word modulo 2^32.
        const uint32_t m0 = out.M[0];
        uint32_t inverse = m0;
        for (int i = 0; i < 5; i++)
        {
            inverse *= 2 - m0 * inverse;
        }
        out.M_prime = 0u - inverse;
        out.length = LENGTH_FIELD;
        return true;
    }
}
