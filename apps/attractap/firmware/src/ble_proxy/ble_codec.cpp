#include "ble_codec.hpp"

#include <cctype>
#include <cstdio>

namespace ble
{
    namespace
    {
        constexpr char B64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

        int b64Value(char c)
        {
            if (c >= 'A' && c <= 'Z') return c - 'A';
            if (c >= 'a' && c <= 'z') return c - 'a' + 26;
            if (c >= '0' && c <= '9') return c - '0' + 52;
            if (c == '+') return 62;
            if (c == '/') return 63;
            return -1;
        }

        int hexValue(char c)
        {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'a' && c <= 'f') return c - 'a' + 10;
            if (c >= 'A' && c <= 'F') return c - 'A' + 10;
            return -1;
        }

        bool readUint(JsonVariantConst value, uint32_t min, uint32_t max, uint32_t &out)
        {
            if (!value.is<uint32_t>()) return false;
            const uint32_t v = value.as<uint32_t>();
            if (v < min || v > max) return false;
            out = v;
            return true;
        }

        bool readSessionId(JsonVariantConst value, char out[MAX_SESSION_ID_LENGTH + 1])
        {
            const char *text = value.as<const char *>();
            if (!text) return false;
            const size_t length = std::strlen(text);
            if (length == 0 || length > MAX_SESSION_ID_LENGTH) return false;
            for (size_t i = 0; i < length; i++)
            {
                const char c = text[i];
                if (!std::isalnum(static_cast<unsigned char>(c)) && c != '-' && c != '_') return false;
            }
            std::memcpy(out, text, length + 1);
            return true;
        }

        bool readTarget(JsonObjectConst payload, Command &command)
        {
            return parseUuid(payload["s"].as<const char *>(), command.service) &&
                   parseUuid(payload["c"].as<const char *>(), command.characteristic) &&
                   readUint(payload["timeoutMs"], 1, MAX_OP_TIMEOUT_MS, command.timeoutMs);
        }

        bool readBool(JsonVariantConst value, bool &out)
        {
            if (value.isNull())
            {
                out = false;
                return true;
            }
            if (!value.is<bool>()) return false;
            out = value.as<bool>();
            return true;
        }

        bool parseScan(JsonObjectConst payload, Command &command)
        {
            uint32_t maxResults = MAX_SCAN_RESULTS;
            if (!readUint(payload["durationMs"], 1, MAX_SCAN_MS, command.durationMs)) return false;
            if (!payload["maxResults"].isNull() && !readUint(payload["maxResults"], 1, MAX_SCAN_RESULTS, maxResults))
                return false;
            command.maxResults = static_cast<uint8_t>(maxResults);
            JsonObjectConst filter = payload["filter"].as<JsonObjectConst>();
            if (filter.isNull()) return false;
            JsonArrayConst services = filter["serviceUuids"].as<JsonArrayConst>();
            JsonArrayConst manufacturers = filter["manufacturerIds"].as<JsonArrayConst>();
            if (services.size() > MAX_FILTER_UUIDS || manufacturers.size() > MAX_FILTER_MANUFACTURERS) return false;
            for (JsonVariantConst entry : services)
            {
                Uuid uuid;
                if (!parseUuid(entry.as<const char *>(), uuid)) return false;
                command.filterServices.push_back(uuid);
            }
            for (JsonVariantConst entry : manufacturers)
            {
                uint32_t id = 0;
                if (!readUint(entry, 0, 0xffff, id)) return false;
                command.filterManufacturers.push_back(static_cast<uint16_t>(id));
            }
            JsonVariantConst prefix = filter["namePrefix"];
            if (!prefix.isNull())
            {
                const char *text = prefix.as<const char *>();
                const size_t length = text ? std::strlen(text) : 0;
                if (length == 0 || length > MAX_NAME_PREFIX) return false;
                std::memcpy(command.namePrefix, text, length + 1);
                command.hasNamePrefix = true;
            }
            return true;
        }

        bool parseOpen(JsonObjectConst payload, Command &command)
        {
            if (!parseAddress(payload["address"].as<const char *>(), command.address)) return false;
            const char *type = payload["addressType"].as<const char *>();
            if (!type || (std::strcmp(type, "public") != 0 && std::strcmp(type, "random") != 0)) return false;
            command.address.random = std::strcmp(type, "random") == 0;
            if (!readUint(payload["connectTimeoutMs"], 1, MAX_CONNECT_TIMEOUT_MS, command.connectTimeoutMs) ||
                !readUint(payload["leaseMs"], 1, MAX_LEASE_MS, command.leaseMs))
                return false;
            JsonArrayConst allowlist = payload["allowlist"].as<JsonArrayConst>();
            if (allowlist.isNull() || allowlist.size() == 0 || allowlist.size() > MAX_ALLOWLIST_ENTRIES) return false;
            for (JsonObjectConst raw : allowlist)
            {
                AllowEntry entry;
                uint32_t ops = 0, r = 0, w = 0, n = 0;
                if (!parseUuid(raw["s"].as<const char *>(), entry.service) ||
                    !parseUuid(raw["c"].as<const char *>(), entry.characteristic) || !readUint(raw["ops"], 1, 31, ops) ||
                    !readUint(raw["r"], 0, MAX_PAYLOAD_BYTES, r) || !readUint(raw["w"], 0, MAX_PAYLOAD_BYTES, w) ||
                    !readUint(raw["n"], 0, MAX_PAYLOAD_BYTES, n))
                    return false;
                entry.ops = static_cast<uint8_t>(ops);
                entry.maxRead = static_cast<uint16_t>(r);
                entry.maxWrite = static_cast<uint16_t>(w);
                entry.maxNotification = static_cast<uint16_t>(n);
                command.allowlist.push_back(entry);
            }
            return true;
        }

        bool parseBody(Command &command, JsonObjectConst payload, Error &error)
        {
            switch (command.type)
            {
            case CommandType::Scan:
                return parseScan(payload, command);
            case CommandType::Open:
                return parseOpen(payload, command);
            case CommandType::Read:
            case CommandType::Unsubscribe:
                return readTarget(payload, command);
            case CommandType::Subscribe:
                return readTarget(payload, command) && readBool(payload["indicate"], command.indicate);
            case CommandType::Write:
            {
                if (!readTarget(payload, command) || !readBool(payload["withoutResponse"], command.withoutResponse))
                    return false;
                const char *value = payload["value"].as<const char *>();
                if (!value) return false;
                if (!base64Decode(value, std::strlen(value), MAX_PAYLOAD_BYTES, command.value))
                {
                    // An over-long value is a size problem, not a syntax one.
                    if (std::strlen(value) > (MAX_PAYLOAD_BYTES + 2) / 3 * 4) error = Error(Code::PayloadTooLarge, "value");
                    return false;
                }
                return !command.value.empty();
            }
            case CommandType::Cancel:
            case CommandType::Close:
            default:
                return true;
            }
        }

        bool typeOf(const char *type, CommandType &out)
        {
            static const struct
            {
                const char *name;
                CommandType type;
            } TYPES[] = {
                {"BLE_SCAN", CommandType::Scan},
                {"BLE_SESSION_OPEN", CommandType::Open},
                {"BLE_READ", CommandType::Read},
                {"BLE_WRITE", CommandType::Write},
                {"BLE_SUBSCRIBE", CommandType::Subscribe},
                {"BLE_UNSUBSCRIBE", CommandType::Unsubscribe},
                {"BLE_CANCEL", CommandType::Cancel},
                {"BLE_SESSION_CLOSE", CommandType::Close},
            };
            if (!type) return false;
            for (const auto &entry : TYPES)
            {
                if (std::strcmp(entry.name, type) == 0)
                {
                    out = entry.type;
                    return true;
                }
            }
            return false;
        }

        void putError(JsonObject payload, const Error &error)
        {
            JsonObject e = payload["error"].to<JsonObject>();
            e["code"] = codeName(error.code);
            if (error.detail[0]) e["detail"] = error.detail;
        }

        JsonObject envelope(JsonDocument &doc, const char *type, const char *sessionId)
        {
            doc["event"] = "EVENT";
            JsonObject data = doc["data"].to<JsonObject>();
            data["type"] = type;
            JsonObject payload = data["payload"].to<JsonObject>();
            payload["v"] = PROTOCOL_VERSION;
            payload["sessionId"] = sessionId;
            return payload;
        }

        std::string serialize(const JsonDocument &doc)
        {
            std::string out;
            serializeJson(doc, out);
            return out;
        }
    }

    bool base64Decode(const char *text, size_t length, size_t maxBytes, Bytes &out)
    {
        out.clear();
        if (!text || length % 4 != 0) return false;
        if (length > (maxBytes + 2) / 3 * 4) return false;
        out.reserve(length / 4 * 3);
        for (size_t i = 0; i < length; i += 4)
        {
            int v[4];
            for (int k = 0; k < 4; k++)
            {
                const char c = text[i + k];
                // Padding only in the last group, only at its end.
                if (c == '=' && i + 4 == length && k >= 2) v[k] = -2;
                else v[k] = b64Value(c);
                if (v[k] == -1) return false;
            }
            if (v[2] == -2 && v[3] != -2) return false;
            out.push_back(static_cast<uint8_t>((v[0] << 2) | (v[1] >> 4)));
            if (v[2] >= 0) out.push_back(static_cast<uint8_t>(((v[1] & 0xf) << 4) | (v[2] >> 2)));
            if (v[3] >= 0) out.push_back(static_cast<uint8_t>(((v[2] & 0x3) << 6) | v[3]));
        }
        return out.size() <= maxBytes;
    }

    void base64Encode(const uint8_t *data, size_t length, std::string &out)
    {
        out.clear();
        out.reserve((length + 2) / 3 * 4);
        for (size_t i = 0; i < length; i += 3)
        {
            const uint32_t n = (uint32_t(data[i]) << 16) | (i + 1 < length ? uint32_t(data[i + 1]) << 8 : 0) |
                               (i + 2 < length ? uint32_t(data[i + 2]) : 0);
            out.push_back(B64[(n >> 18) & 63]);
            out.push_back(B64[(n >> 12) & 63]);
            out.push_back(i + 1 < length ? B64[(n >> 6) & 63] : '=');
            out.push_back(i + 2 < length ? B64[n & 63] : '=');
        }
    }

    bool parseUuid(const char *text, Uuid &out)
    {
        if (!text || std::strlen(text) != 36) return false;
        size_t byte = 0;
        for (size_t i = 0; i < 36;)
        {
            if (i == 8 || i == 13 || i == 18 || i == 23)
            {
                if (text[i] != '-') return false;
                i++;
                continue;
            }
            // Lowercase only: the API normalizes, anything else is not from it.
            if (std::isupper(static_cast<unsigned char>(text[i])) || std::isupper(static_cast<unsigned char>(text[i + 1])))
                return false;
            const int hi = hexValue(text[i]);
            const int lo = hexValue(text[i + 1]);
            if (hi < 0 || lo < 0) return false;
            out.b[byte++] = static_cast<uint8_t>(hi << 4 | lo);
            i += 2;
        }
        return byte == 16;
    }

    void formatUuid(const Uuid &uuid, char out[37])
    {
        std::snprintf(out, 37, "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x", uuid.b[0],
                      uuid.b[1], uuid.b[2], uuid.b[3], uuid.b[4], uuid.b[5], uuid.b[6], uuid.b[7], uuid.b[8], uuid.b[9],
                      uuid.b[10], uuid.b[11], uuid.b[12], uuid.b[13], uuid.b[14], uuid.b[15]);
    }

    bool parseAddress(const char *text, Address &out)
    {
        if (!text || std::strlen(text) != 17) return false;
        for (size_t i = 0; i < 6; i++)
        {
            const char *p = text + i * 3;
            if (i < 5 && p[2] != ':') return false;
            const int hi = hexValue(p[0]);
            const int lo = hexValue(p[1]);
            if (hi < 0 || lo < 0) return false;
            out.b[i] = static_cast<uint8_t>(hi << 4 | lo);
        }
        return true;
    }

    void formatAddress(const Address &address, char out[18])
    {
        std::snprintf(out, 18, "%02X:%02X:%02X:%02X:%02X:%02X", address.b[0], address.b[1], address.b[2], address.b[3],
                      address.b[4], address.b[5]);
    }

    bool isRequestType(const char *type)
    {
        CommandType ignored;
        return typeOf(type, ignored);
    }

    bool parseCommand(const char *type, JsonObjectConst payload, Command &command, Error &error)
    {
        error = Error(Code::InvalidArgument, "malformed");
        if (!typeOf(type, command.type) || payload.isNull()) return false;
        uint32_t id = 0;
        // BLE_CANCEL names the request to cancel and gets no answer of its own.
        if (readUint(payload["requestId"], 1, UINT32_MAX, id))
        {
            if (command.type == CommandType::Cancel) command.targetRequestId = id;
            else command.requestId = id;
        }
        const bool hasSession = readSessionId(payload["sessionId"], command.sessionId);
        if (!payload["v"].is<int>() || payload["v"].as<int>() != PROTOCOL_VERSION)
        {
            error = Error(Code::InvalidArgument, "protocol-version");
            return false;
        }
        if (!id || !hasSession) return false;
        if (!parseBody(command, payload, error)) return false;
        error = Error();
        return true;
    }

    std::string resultMessage(const char *sessionId, uint32_t requestId, const Error &error, const Bytes *value,
                              uint16_t mtu)
    {
        JsonDocument doc;
        JsonObject payload = envelope(doc, "BLE_RESULT", sessionId);
        payload["requestId"] = requestId;
        payload["ok"] = error.ok();
        if (!error.ok())
        {
            putError(payload, error);
            return serialize(doc);
        }
        if (value)
        {
            std::string encoded;
            base64Encode(value->data(), value->size(), encoded);
            payload["value"] = encoded;
        }
        if (mtu) payload["mtu"] = mtu;
        return serialize(doc);
    }

    std::string scanResultMessage(const char *sessionId, uint32_t requestId, const Error &error,
                                  const PsVector<Advertisement> *advertisements)
    {
        JsonDocument doc;
        JsonObject payload = envelope(doc, "BLE_SCAN_RESULT", sessionId);
        payload["requestId"] = requestId;
        payload["ok"] = error.ok();
        if (!error.ok())
        {
            putError(payload, error);
            return serialize(doc);
        }
        JsonArray list = payload["advertisements"].to<JsonArray>();
        if (!advertisements) return serialize(doc);
        for (const Advertisement &ad : *advertisements)
        {
            JsonObject entry = list.add<JsonObject>();
            char address[18];
            formatAddress(ad.address, address);
            entry["address"] = address;
            entry["addressType"] = ad.address.random ? "random" : "public";
            if (ad.hasRssi) entry["rssi"] = ad.rssi;
            if (!ad.name.empty()) entry["name"] = ad.name;
            JsonArray uuids = entry["serviceUuids"].to<JsonArray>();
            for (const Uuid &uuid : ad.serviceUuids)
            {
                char text[37];
                formatUuid(uuid, text);
                uuids.add(text);
            }
            JsonArray manufacturers = entry["manufacturerData"].to<JsonArray>();
            for (const auto &m : ad.manufacturers)
            {
                JsonObject item = manufacturers.add<JsonObject>();
                item["companyId"] = m.companyId;
                std::string encoded;
                base64Encode(m.data.data(), m.data.size(), encoded);
                item["data"] = encoded;
            }
        }
        return serialize(doc);
    }

    std::string notificationMessage(const char *sessionId, uint32_t subscriptionId, uint32_t seq, const Error &error,
                                    const uint8_t *value, size_t length)
    {
        JsonDocument doc;
        JsonObject payload = envelope(doc, "BLE_NOTIFICATION", sessionId);
        payload["subscriptionId"] = subscriptionId;
        payload["seq"] = seq;
        if (!error.ok())
        {
            putError(payload, error);
            return serialize(doc);
        }
        std::string encoded;
        base64Encode(value, length, encoded);
        payload["value"] = encoded;
        return serialize(doc);
    }

    std::string sessionEndedMessage(const char *sessionId, const char *reason, const char *detail)
    {
        JsonDocument doc;
        JsonObject payload = envelope(doc, "BLE_SESSION_ENDED", sessionId);
        payload["reason"] = reason;
        if (detail && detail[0]) payload["detail"] = detail;
        return serialize(doc);
    }
}
