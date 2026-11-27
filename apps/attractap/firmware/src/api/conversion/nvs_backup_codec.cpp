#include "nvs_backup_codec.hpp"

#include <cstring>

namespace
{
    constexpr uint8_t MAGIC[4] = {'N', 'V', 'B', '1'};

    void put32(std::vector<uint8_t> &out, uint32_t value)
    {
        for (int i = 0; i < 4; i++)
        {
            out.push_back(static_cast<uint8_t>(value >> (8 * i)));
        }
    }

    struct Reader
    {
        const uint8_t *at;
        const uint8_t *end;
        bool ok = true;

        bool need(size_t n)
        {
            if (!ok || static_cast<size_t>(end - at) < n)
            {
                ok = false;
            }
            return ok;
        }
        uint8_t u8()
        {
            return need(1) ? *at++ : 0;
        }
        uint32_t u32()
        {
            if (!need(4))
            {
                return 0;
            }
            const uint32_t value = static_cast<uint32_t>(at[0]) | (static_cast<uint32_t>(at[1]) << 8) |
                                   (static_cast<uint32_t>(at[2]) << 16) | (static_cast<uint32_t>(at[3]) << 24);
            at += 4;
            return value;
        }
        std::string text(size_t n)
        {
            if (!need(n))
            {
                return "";
            }
            std::string value(reinterpret_cast<const char *>(at), n);
            at += n;
            return value;
        }
    };

    bool validName(const std::string &name)
    {
        return !name.empty() && name.size() <= NvsBackup::MAX_NAME_LENGTH && name.find('\0') == std::string::npos;
    }

    bool validEntry(const NvsBackup::Entry &entry)
    {
        if (!validName(entry.ns) || !validName(entry.key) || !NvsBackup::knownType(entry.type))
        {
            return false;
        }
        const size_t integer = NvsBackup::integerSize(entry.type);
        return integer == 0 || entry.value.size() == integer;
    }
}

namespace NvsBackup
{
    bool isMigrated(const char *ns)
    {
        if (!ns)
        {
            return false;
        }
        for (const char *name : NAMESPACES)
        {
            if (strcmp(name, ns) == 0)
            {
                return true;
            }
        }
        return false;
    }

    size_t integerSize(uint8_t type)
    {
        switch (type)
        {
        case TYPE_U8:
        case TYPE_I8:
            return 1;
        case TYPE_U16:
        case TYPE_I16:
            return 2;
        case TYPE_U32:
        case TYPE_I32:
            return 4;
        case TYPE_U64:
        case TYPE_I64:
            return 8;
        default:
            return 0;
        }
    }

    bool knownType(uint8_t type)
    {
        return integerSize(type) != 0 || type == TYPE_STR || type == TYPE_BLOB;
    }

    bool encode(const std::vector<Entry> &entries, std::vector<uint8_t> &out, size_t maxBytes)
    {
        std::vector<uint8_t> buffer(MAGIC, MAGIC + sizeof(MAGIC));
        put32(buffer, static_cast<uint32_t>(entries.size()));
        for (const Entry &entry : entries)
        {
            if (!validEntry(entry))
            {
                return false;
            }
            buffer.push_back(static_cast<uint8_t>(entry.ns.size()));
            buffer.insert(buffer.end(), entry.ns.begin(), entry.ns.end());
            buffer.push_back(static_cast<uint8_t>(entry.key.size()));
            buffer.insert(buffer.end(), entry.key.begin(), entry.key.end());
            buffer.push_back(entry.type);
            put32(buffer, static_cast<uint32_t>(entry.value.size()));
            buffer.insert(buffer.end(), entry.value.begin(), entry.value.end());
            if (buffer.size() > maxBytes)
            {
                return false;
            }
        }
        if (buffer.size() > maxBytes)
        {
            return false;
        }
        out.swap(buffer);
        return true;
    }

    bool decode(const uint8_t *data, size_t length, std::vector<Entry> &out)
    {
        if (!data || length < 8 || memcmp(data, MAGIC, sizeof(MAGIC)) != 0)
        {
            return false;
        }
        Reader r{data + sizeof(MAGIC), data + length};
        const uint32_t count = r.u32();
        std::vector<Entry> entries;
        for (uint32_t i = 0; i < count && r.ok; i++)
        {
            Entry entry;
            entry.ns = r.text(r.u8());
            entry.key = r.text(r.u8());
            entry.type = r.u8();
            const uint32_t size = r.u32();
            if (!r.need(size))
            {
                break;
            }
            entry.value.assign(r.at, r.at + size);
            r.at += size;
            if (!validEntry(entry))
            {
                return false;
            }
            entries.push_back(std::move(entry));
        }
        // Trailing bytes mean the length does not belong to this backup.
        if (!r.ok || r.at != r.end)
        {
            return false;
        }
        out.swap(entries);
        return true;
    }

    bool same(const std::vector<Entry> &a, const std::vector<Entry> &b)
    {
        if (a.size() != b.size())
        {
            return false;
        }
        for (size_t i = 0; i < a.size(); i++)
        {
            if (a[i].ns != b[i].ns || a[i].key != b[i].key || a[i].type != b[i].type || a[i].value != b[i].value)
            {
                return false;
            }
        }
        return true;
    }
}
