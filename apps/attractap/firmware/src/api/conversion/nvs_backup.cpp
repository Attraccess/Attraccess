#include "nvs_backup.hpp"

#if defined(ESP_PLATFORM)

#include <cstring>

#include "nvs.h"

namespace
{
    using NvsBackup::Entry;

    // The value of one entry as its little-endian bytes (integers), its characters (strings) or its bytes (blobs).
    bool readValue(nvs_handle_t handle, const char *key, uint8_t type, std::vector<uint8_t> &out)
    {
        const size_t integer = NvsBackup::integerSize(type);
        if (integer != 0)
        {
            uint64_t value = 0;
            esp_err_t err = ESP_FAIL;
            switch (type)
            {
            case NvsBackup::TYPE_U8: { uint8_t v; err = nvs_get_u8(handle, key, &v); value = v; break; }
            case NvsBackup::TYPE_I8: { int8_t v; err = nvs_get_i8(handle, key, &v); value = static_cast<uint8_t>(v); break; }
            case NvsBackup::TYPE_U16: { uint16_t v; err = nvs_get_u16(handle, key, &v); value = v; break; }
            case NvsBackup::TYPE_I16: { int16_t v; err = nvs_get_i16(handle, key, &v); value = static_cast<uint16_t>(v); break; }
            case NvsBackup::TYPE_U32: { uint32_t v; err = nvs_get_u32(handle, key, &v); value = v; break; }
            case NvsBackup::TYPE_I32: { int32_t v; err = nvs_get_i32(handle, key, &v); value = static_cast<uint32_t>(v); break; }
            case NvsBackup::TYPE_U64: { uint64_t v; err = nvs_get_u64(handle, key, &v); value = v; break; }
            case NvsBackup::TYPE_I64: { int64_t v; err = nvs_get_i64(handle, key, &v); value = static_cast<uint64_t>(v); break; }
            default: return false;
            }
            if (err != ESP_OK)
            {
                return false;
            }
            out.resize(integer);
            for (size_t i = 0; i < integer; i++)
            {
                out[i] = static_cast<uint8_t>(value >> (8 * i));
            }
            return true;
        }
        size_t length = 0;
        if (type == NvsBackup::TYPE_STR)
        {
            if (nvs_get_str(handle, key, nullptr, &length) != ESP_OK || length == 0)
            {
                return false;
            }
            std::vector<char> text(length);
            if (nvs_get_str(handle, key, text.data(), &length) != ESP_OK)
            {
                return false;
            }
            out.assign(text.begin(), text.begin() + (length - 1)); // without the NUL
            return true;
        }
        if (type == NvsBackup::TYPE_BLOB)
        {
            if (nvs_get_blob(handle, key, nullptr, &length) != ESP_OK)
            {
                return false;
            }
            out.resize(length);
            return length == 0 || nvs_get_blob(handle, key, out.data(), &length) == ESP_OK;
        }
        return false;
    }

    uint64_t integerOf(const std::vector<uint8_t> &value)
    {
        uint64_t out = 0;
        for (size_t i = 0; i < value.size(); i++)
        {
            out |= static_cast<uint64_t>(value[i]) << (8 * i);
        }
        return out;
    }

    esp_err_t writeValue(nvs_handle_t handle, const Entry &entry)
    {
        const char *key = entry.key.c_str();
        const uint64_t v = integerOf(entry.value);
        switch (entry.type)
        {
        case NvsBackup::TYPE_U8: return nvs_set_u8(handle, key, static_cast<uint8_t>(v));
        case NvsBackup::TYPE_I8: return nvs_set_i8(handle, key, static_cast<int8_t>(v));
        case NvsBackup::TYPE_U16: return nvs_set_u16(handle, key, static_cast<uint16_t>(v));
        case NvsBackup::TYPE_I16: return nvs_set_i16(handle, key, static_cast<int16_t>(v));
        case NvsBackup::TYPE_U32: return nvs_set_u32(handle, key, static_cast<uint32_t>(v));
        case NvsBackup::TYPE_I32: return nvs_set_i32(handle, key, static_cast<int32_t>(v));
        case NvsBackup::TYPE_U64: return nvs_set_u64(handle, key, v);
        case NvsBackup::TYPE_I64: return nvs_set_i64(handle, key, static_cast<int64_t>(v));
        case NvsBackup::TYPE_STR:
        {
            const std::string text(entry.value.begin(), entry.value.end());
            return nvs_set_str(handle, key, text.c_str());
        }
        case NvsBackup::TYPE_BLOB: return nvs_set_blob(handle, key, entry.value.data(), entry.value.size());
        default: return ESP_ERR_INVALID_ARG;
        }
    }

    bool collectNamespace(const char *ns, std::vector<Entry> &out)
    {
        nvs_handle_t handle;
        const esp_err_t opened = nvs_open(ns, NVS_READONLY, &handle);
        if (opened == ESP_ERR_NVS_NOT_FOUND)
        {
            return true; // nothing stored in this namespace
        }
        if (opened != ESP_OK)
        {
            return false;
        }
        bool ok = true;
        nvs_iterator_t it = nullptr;
        esp_err_t found = nvs_entry_find_in_handle(handle, NVS_TYPE_ANY, &it);
        while (ok && found == ESP_OK)
        {
            nvs_entry_info_t info;
            nvs_entry_info(it, &info);
            Entry entry;
            entry.ns = ns;
            entry.key = info.key;
            entry.type = static_cast<uint8_t>(info.type);
            ok = NvsBackup::knownType(entry.type) && readValue(handle, info.key, entry.type, entry.value);
            if (ok)
            {
                out.push_back(std::move(entry));
            }
            found = nvs_entry_next(&it);
        }
        nvs_release_iterator(it);
        nvs_close(handle);
        return ok && (found == ESP_OK || found == ESP_ERR_NVS_NOT_FOUND);
    }
}

namespace NvsBackupStore
{
    bool collect(std::vector<Entry> &out)
    {
        std::vector<Entry> entries;
        for (const char *ns : NvsBackup::NAMESPACES)
        {
            if (!collectNamespace(ns, entries))
            {
                return false;
            }
        }
        out.swap(entries);
        return true;
    }

    bool restore(const std::vector<Entry> &entries)
    {
        for (const char *ns : NvsBackup::NAMESPACES)
        {
            nvs_handle_t handle;
            bool opened = false;
            for (const Entry &entry : entries)
            {
                if (entry.ns != ns)
                {
                    continue;
                }
                if (!opened)
                {
                    if (nvs_open(ns, NVS_READWRITE, &handle) != ESP_OK)
                    {
                        return false;
                    }
                    opened = true;
                }
                if (writeValue(handle, entry) != ESP_OK)
                {
                    nvs_close(handle);
                    return false;
                }
            }
            if (opened)
            {
                const esp_err_t committed = nvs_commit(handle);
                nvs_close(handle);
                if (committed != ESP_OK)
                {
                    return false;
                }
            }
        }
        return true;
    }

    bool matches(const std::vector<Entry> &expected)
    {
        for (const Entry &entry : expected)
        {
            nvs_handle_t handle;
            if (nvs_open(entry.ns.c_str(), NVS_READONLY, &handle) != ESP_OK)
            {
                return false;
            }
            std::vector<uint8_t> value;
            const bool same = readValue(handle, entry.key.c_str(), entry.type, value) && value == entry.value;
            nvs_close(handle);
            if (!same)
            {
                return false;
            }
        }
        return true;
    }
}

#else

namespace NvsBackupStore
{
    bool collect(std::vector<NvsBackup::Entry> &) { return false; }
    bool restore(const std::vector<NvsBackup::Entry> &) { return false; }
    bool matches(const std::vector<NvsBackup::Entry> &) { return false; }
}

#endif
