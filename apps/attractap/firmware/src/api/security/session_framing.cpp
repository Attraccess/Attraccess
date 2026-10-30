#include "session_framing.hpp"

namespace SessionFraming
{
    namespace
    {
        bool knownType(uint8_t type)
        {
            return type >= static_cast<uint8_t>(FrameType::JSON) && type <= static_cast<uint8_t>(FrameType::CONTROL);
        }
    }

    bool encode(FrameType type, const uint8_t *payload, size_t length, std::vector<uint8_t> &out)
    {
        if (length > MAX_MESSAGE_BYTES)
        {
            return false;
        }
        out.resize(HEADER_BYTES + length);
        out[0] = static_cast<uint8_t>(type);
        out[1] = static_cast<uint8_t>(length >> 24);
        out[2] = static_cast<uint8_t>(length >> 16);
        out[3] = static_cast<uint8_t>(length >> 8);
        out[4] = static_cast<uint8_t>(length);
        for (size_t i = 0; i < length; i++)
        {
            out[HEADER_BYTES + i] = payload[i];
        }
        return true;
    }

    bool Decoder::push(const uint8_t *data, size_t length, const FrameCallback &onFrame)
    {
        buffered.insert(buffered.end(), data, data + length);
        size_t offset = 0;
        while (buffered.size() - offset >= HEADER_BYTES)
        {
            const uint8_t *header = buffered.data() + offset;
            const size_t payloadLength = (static_cast<size_t>(header[1]) << 24) | (static_cast<size_t>(header[2]) << 16) |
                                         (static_cast<size_t>(header[3]) << 8) | header[4];
            if (!knownType(header[0]) || payloadLength > MAX_MESSAGE_BYTES)
            {
                buffered.clear();
                return false;
            }
            if (buffered.size() - offset < HEADER_BYTES + payloadLength)
            {
                break;
            }
            onFrame(static_cast<FrameType>(header[0]), header + HEADER_BYTES, payloadLength);
            offset += HEADER_BYTES + payloadLength;
        }
        buffered.erase(buffered.begin(), buffered.begin() + static_cast<std::ptrdiff_t>(offset));
        if (buffered.empty())
        {
            // Give back the capacity a large message (OTA chunk) needed.
            std::vector<uint8_t>().swap(buffered);
        }
        return true;
    }
}
