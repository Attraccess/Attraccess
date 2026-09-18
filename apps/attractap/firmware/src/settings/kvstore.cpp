#include "kvstore.hpp"
#include <string>

#include <vector>

#ifdef ATTRACTAP_HOST
#include <cstring>
#include <mutex>
#include <unordered_map>
#include "profile_store.hpp"

namespace {
std::mutex storeMutex;
std::unordered_map<std::string, std::vector<uint8_t>> store;
ProfileStore *hostProfile = nullptr;

std::string keyFor(const std::string &nameSpace, const char *key)
{
    return nameSpace + ":" + key;
}

std::string encodeBytes(const uint8_t *bytes, size_t length)
{
    static constexpr char hex[] = "0123456789abcdef";
    std::string encoded = "@";
    encoded.reserve(length * 2 + 1);
    for (size_t index = 0; index < length; ++index)
    {
        encoded += hex[bytes[index] >> 4];
        encoded += hex[bytes[index] & 0x0F];
    }
    return encoded;
}

bool decodeBytes(const std::string &encoded, std::vector<uint8_t> &bytes)
{
    if (encoded.empty() || encoded[0] != '@' || (encoded.size() - 1) % 2 != 0)
        return false;
    bytes.clear();
    bytes.reserve((encoded.size() - 1) / 2);
    const auto nibble = [](char character) -> int {
        if (character >= '0' && character <= '9') return character - '0';
        if (character >= 'a' && character <= 'f') return character - 'a' + 10;
        return -1;
    };
    for (size_t index = 1; index < encoded.size(); index += 2)
    {
        const int high = nibble(encoded[index]);
        const int low = nibble(encoded[index + 1]);
        if (high < 0 || low < 0) return false;
        bytes.push_back(static_cast<uint8_t>((high << 4) | low));
    }
    return true;
}

std::vector<uint8_t> readBytes(const std::string &nameSpace, const char *key)
{
    if (hostProfile)
    {
        std::vector<uint8_t> bytes;
        if (decodeBytes(hostProfile->get("kv." + keyFor(nameSpace, key)), bytes))
            return bytes;
    }
    const auto found = store.find(keyFor(nameSpace, key));
    return found == store.end() ? std::vector<uint8_t>{} : found->second;
}

void writeBytes(const std::string &nameSpace, const char *key, const uint8_t *bytes, size_t length)
{
    store[keyFor(nameSpace, key)] = std::vector<uint8_t>(bytes, bytes + length);
    if (hostProfile)
        hostProfile->put("kv." + keyFor(nameSpace, key), encodeBytes(bytes, length));
}

template <typename T> T getValue(const std::string &nameSpace, const char *key, T defaultValue)
{
    std::lock_guard lock(storeMutex);
    const auto bytes = readBytes(nameSpace, key);
    if (bytes.size() != sizeof(T))
        return defaultValue;
    T value;
    std::memcpy(&value, bytes.data(), sizeof(value));
    return value;
}

template <typename T> size_t putValue(const std::string &nameSpace, const char *key, T value)
{
    std::lock_guard lock(storeMutex);
    writeBytes(nameSpace, key, reinterpret_cast<const uint8_t *>(&value), sizeof(value));
    return sizeof(value);
}
}

void KVStore::setHostProfile(ProfileStore *profile)
{
    std::lock_guard lock(storeMutex);
    hostProfile = profile;
}

bool KVStore::begin(const char *name, bool isReadOnly)
{
    end();
    namespaceName = name;
    readOnly = isReadOnly;
    opened = true;
    return true;
}

void KVStore::end() { opened = false; namespaceName.clear(); }
bool KVStore::commit() { return opened; }

std::string KVStore::getString(const char *key, const std::string &defaultValue)
{
    if (!opened) return defaultValue;
    std::lock_guard lock(storeMutex);
    const auto bytes = readBytes(namespaceName, key);
    return bytes.empty() ? defaultValue : std::string(bytes.begin(), bytes.end());
}
bool KVStore::getBool(const char *key, bool defaultValue) { return getUChar(key, defaultValue ? 1 : 0) != 0; }
uint8_t KVStore::getUChar(const char *key, uint8_t defaultValue) { return opened ? getValue(namespaceName, key, defaultValue) : defaultValue; }
uint16_t KVStore::getUShort(const char *key, uint16_t defaultValue) { return opened ? getValue(namespaceName, key, defaultValue) : defaultValue; }
uint32_t KVStore::getUInt(const char *key, uint32_t defaultValue) { return opened ? getValue(namespaceName, key, defaultValue) : defaultValue; }
int32_t KVStore::getInt(const char *key, int32_t defaultValue) { return opened ? getValue(namespaceName, key, defaultValue) : defaultValue; }
size_t KVStore::getBytes(const char *key, void *buf, size_t maxLen)
{
    if (!opened || !buf) return 0;
    std::lock_guard lock(storeMutex);
    const auto bytes = readBytes(namespaceName, key);
    if (bytes.empty()) return 0;
    const auto length = std::min(maxLen, bytes.size());
    std::memcpy(buf, bytes.data(), length);
    return length;
}
size_t KVStore::putString(const char *key, const std::string &value)
{
    if (!opened || readOnly) return 0;
    std::lock_guard lock(storeMutex);
    writeBytes(namespaceName, key, reinterpret_cast<const uint8_t *>(value.data()), value.size());
    return value.size();
}
size_t KVStore::putBool(const char *key, bool value) { return putUChar(key, value ? 1 : 0); }
size_t KVStore::putUChar(const char *key, uint8_t value) { return !opened || readOnly ? 0 : putValue(namespaceName, key, value); }
size_t KVStore::putUShort(const char *key, uint16_t value) { return !opened || readOnly ? 0 : putValue(namespaceName, key, value); }
size_t KVStore::putUInt(const char *key, uint32_t value) { return !opened || readOnly ? 0 : putValue(namespaceName, key, value); }
size_t KVStore::putInt(const char *key, int32_t value) { return !opened || readOnly ? 0 : putValue(namespaceName, key, value); }
size_t KVStore::putBytes(const char *key, const void *value, size_t len)
{
    if (!opened || readOnly || !value) return 0;
    std::lock_guard lock(storeMutex);
    writeBytes(namespaceName, key, static_cast<const uint8_t *>(value), len);
    return len;
}
bool KVStore::remove(const char *key)
{
    if (!opened || readOnly) return false;
    std::lock_guard lock(storeMutex);
    const bool removed = store.erase(keyFor(namespaceName, key)) > 0;
    if (hostProfile)
        hostProfile->remove("kv." + keyFor(namespaceName, key));
    return removed;
}

#else

bool KVStore::begin(const char *namespaceName, bool readOnly)
{
    end();
    esp_err_t err = nvs_open(namespaceName, readOnly ? NVS_READONLY : NVS_READWRITE, &handle);
    if (err != ESP_OK)
    {
        // Read-only open of a namespace no put ever created: Preferences::begin
        // also failed here and gets subsequently returned their defaults.
        handle = 0;
        opened = false;
        return false;
    }
    opened = true;
    return true;
}

void KVStore::end()
{
    if (opened)
    {
        nvs_close(handle);
        handle = 0;
        opened = false;
    }
}

bool KVStore::commit()
{
    return opened && nvs_commit(handle) == ESP_OK;
}

std::string KVStore::getString(const char *key, const std::string &defaultValue)
{
    if (!opened)
        return defaultValue;
    size_t len = 0;
    if (nvs_get_str(handle, key, nullptr, &len) != ESP_OK || len == 0)
        return defaultValue;
    std::vector<char> buf(len);
    if (nvs_get_str(handle, key, buf.data(), &len) != ESP_OK)
        return defaultValue;
    return std::string(buf.data());
}

bool KVStore::getBool(const char *key, bool defaultValue)
{
    return getUChar(key, defaultValue ? 1 : 0) != 0;
}

uint8_t KVStore::getUChar(const char *key, uint8_t defaultValue)
{
    if (!opened)
        return defaultValue;
    uint8_t value = defaultValue;
    if (nvs_get_u8(handle, key, &value) != ESP_OK)
        return defaultValue;
    return value;
}

uint16_t KVStore::getUShort(const char *key, uint16_t defaultValue)
{
    if (!opened)
        return defaultValue;
    uint16_t value = defaultValue;
    if (nvs_get_u16(handle, key, &value) != ESP_OK)
        return defaultValue;
    return value;
}

uint32_t KVStore::getUInt(const char *key, uint32_t defaultValue)
{
    if (!opened)
        return defaultValue;
    uint32_t value = defaultValue;
    if (nvs_get_u32(handle, key, &value) != ESP_OK)
        return defaultValue;
    return value;
}

int32_t KVStore::getInt(const char *key, int32_t defaultValue)
{
    if (!opened)
        return defaultValue;
    int32_t value = defaultValue;
    if (nvs_get_i32(handle, key, &value) != ESP_OK)
        return defaultValue;
    return value;
}

size_t KVStore::getBytes(const char *key, void *buf, size_t maxLen)
{
    if (!opened || buf == nullptr || maxLen == 0)
        return 0;
    size_t len = maxLen;
    if (nvs_get_blob(handle, key, buf, &len) != ESP_OK)
        return 0;
    return len;
}

size_t KVStore::putString(const char *key, const std::string &value)
{
    if (!opened)
        return 0;
    if (nvs_set_str(handle, key, value.c_str()) != ESP_OK || !commit())
        return 0;
    return value.length();
}

size_t KVStore::putBool(const char *key, bool value)
{
    return putUChar(key, value ? 1 : 0);
}

size_t KVStore::putUChar(const char *key, uint8_t value)
{
    if (!opened)
        return 0;
    if (nvs_set_u8(handle, key, value) != ESP_OK || !commit())
        return 0;
    return sizeof(value);
}

size_t KVStore::putUShort(const char *key, uint16_t value)
{
    if (!opened)
        return 0;
    if (nvs_set_u16(handle, key, value) != ESP_OK || !commit())
        return 0;
    return sizeof(value);
}

size_t KVStore::putUInt(const char *key, uint32_t value)
{
    if (!opened)
        return 0;
    if (nvs_set_u32(handle, key, value) != ESP_OK || !commit())
        return 0;
    return sizeof(value);
}

size_t KVStore::putInt(const char *key, int32_t value)
{
    if (!opened)
        return 0;
    if (nvs_set_i32(handle, key, value) != ESP_OK || !commit())
        return 0;
    return sizeof(value);
}

size_t KVStore::putBytes(const char *key, const void *value, size_t len)
{
    if (!opened || value == nullptr)
        return 0;
    if (nvs_set_blob(handle, key, value, len) != ESP_OK || !commit())
        return 0;
    return len;
}

bool KVStore::remove(const char *key)
{
    if (!opened)
        return false;
    if (nvs_erase_key(handle, key) != ESP_OK)
        return false;
    return commit();
}
#endif
