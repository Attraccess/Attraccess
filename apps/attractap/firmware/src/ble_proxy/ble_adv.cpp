#include "ble_adv.hpp"

#include <algorithm>

namespace ble
{
    namespace
    {
        // AD types (Bluetooth Assigned Numbers, "Common Data Types").
        constexpr uint8_t AD_UUID16_INCOMPLETE = 0x02;
        constexpr uint8_t AD_UUID16_COMPLETE = 0x03;
        constexpr uint8_t AD_UUID32_INCOMPLETE = 0x04;
        constexpr uint8_t AD_UUID32_COMPLETE = 0x05;
        constexpr uint8_t AD_UUID128_INCOMPLETE = 0x06;
        constexpr uint8_t AD_UUID128_COMPLETE = 0x07;
        constexpr uint8_t AD_NAME_SHORT = 0x08;
        constexpr uint8_t AD_NAME_COMPLETE = 0x09;
        constexpr uint8_t AD_MANUFACTURER = 0xff;
        constexpr size_t MAX_UUIDS_PER_AD = 16;
        constexpr size_t MAX_MANUFACTURERS_PER_AD = 4;
        constexpr size_t MAX_NAME_LENGTH = 31;

        void addUuid(Advertisement &ad, const Uuid &uuid)
        {
            if (ad.serviceUuids.size() >= MAX_UUIDS_PER_AD) return;
            if (std::find(ad.serviceUuids.begin(), ad.serviceUuids.end(), uuid) == ad.serviceUuids.end())
                ad.serviceUuids.push_back(uuid);
        }
    }

    Uuid uuidFromShort(uint32_t value)
    {
        // 0000xxxx-0000-1000-8000-00805f9b34fb
        static const uint8_t BASE[16] = {0, 0, 0, 0, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0x80, 0x5f, 0x9b, 0x34, 0xfb};
        Uuid uuid;
        std::memcpy(uuid.b, BASE, sizeof BASE);
        uuid.b[0] = static_cast<uint8_t>(value >> 24);
        uuid.b[1] = static_cast<uint8_t>(value >> 16);
        uuid.b[2] = static_cast<uint8_t>(value >> 8);
        uuid.b[3] = static_cast<uint8_t>(value);
        return uuid;
    }

    void mergeAdvertisingData(const uint8_t *data, size_t length, Advertisement &into)
    {
        size_t pos = 0;
        while (pos < length)
        {
            const uint8_t fieldLength = data[pos];
            if (fieldLength == 0) break; // early terminator / padding
            if (pos + 1 + fieldLength > length) break;
            const uint8_t type = data[pos + 1];
            const uint8_t *value = data + pos + 2;
            const size_t valueLength = fieldLength - 1;
            switch (type)
            {
            case AD_UUID16_INCOMPLETE:
            case AD_UUID16_COMPLETE:
                for (size_t i = 0; i + 2 <= valueLength; i += 2)
                    addUuid(into, uuidFromShort(uint32_t(value[i]) | uint32_t(value[i + 1]) << 8));
                break;
            case AD_UUID32_INCOMPLETE:
            case AD_UUID32_COMPLETE:
                for (size_t i = 0; i + 4 <= valueLength; i += 4)
                    addUuid(into, uuidFromShort(uint32_t(value[i]) | uint32_t(value[i + 1]) << 8 |
                                                uint32_t(value[i + 2]) << 16 | uint32_t(value[i + 3]) << 24));
                break;
            case AD_UUID128_INCOMPLETE:
            case AD_UUID128_COMPLETE:
                for (size_t i = 0; i + 16 <= valueLength; i += 16)
                {
                    // On air little-endian; the textual form is big-endian.
                    Uuid uuid;
                    for (size_t k = 0; k < 16; k++) uuid.b[k] = value[i + 15 - k];
                    addUuid(into, uuid);
                }
                break;
            case AD_NAME_SHORT:
            case AD_NAME_COMPLETE:
            {
                const size_t n = std::min(valueLength, MAX_NAME_LENGTH);
                // A complete name wins over a shortened one; otherwise keep the longer one.
                if (type == AD_NAME_COMPLETE || n > into.name.size())
                    into.name.assign(reinterpret_cast<const char *>(value), n);
                break;
            }
            case AD_MANUFACTURER:
            {
                if (valueLength < 2) break;
                const uint16_t company = static_cast<uint16_t>(value[0] | value[1] << 8);
                auto existing = std::find_if(into.manufacturers.begin(), into.manufacturers.end(),
                                             [&](const Advertisement::Manufacturer &m) { return m.companyId == company; });
                if (existing != into.manufacturers.end())
                {
                    existing->data.assign(value + 2, value + valueLength);
                }
                else if (into.manufacturers.size() < MAX_MANUFACTURERS_PER_AD)
                {
                    Advertisement::Manufacturer m;
                    m.companyId = company;
                    m.data.assign(value + 2, value + valueLength);
                    into.manufacturers.push_back(std::move(m));
                }
                break;
            }
            default:
                break;
            }
            pos += 1 + fieldLength;
        }
    }

    namespace
    {
        bool matches(const Advertisement &ad, const PsVector<Uuid> &services, const PsVector<uint16_t> &manufacturers,
                     bool hasNamePrefix, const char *namePrefix)
        {
            if (services.empty() && manufacturers.empty() && !hasNamePrefix) return false;
            if (!services.empty())
            {
                bool any = false;
                for (const Uuid &uuid : ad.serviceUuids)
                    any = any || std::find(services.begin(), services.end(), uuid) != services.end();
                if (!any) return false;
            }
            if (!manufacturers.empty())
            {
                bool any = false;
                for (const auto &m : ad.manufacturers)
                    any = any || std::find(manufacturers.begin(), manufacturers.end(), m.companyId) != manufacturers.end();
                if (!any) return false;
            }
            if (hasNamePrefix && ad.name.compare(0, std::strlen(namePrefix), namePrefix) != 0) return false;
            return true;
        }
    }

    bool matchesFilter(const Advertisement &ad, const Command &scan)
    {
        return matches(ad, scan.filterServices, scan.filterManufacturers, scan.hasNamePrefix, scan.namePrefix);
    }

    bool matchesFilter(const Advertisement &ad, const WatchFilter &filter)
    {
        return matches(ad, filter.services, filter.manufacturers, filter.hasNamePrefix, filter.namePrefix);
    }
}
