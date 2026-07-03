#include "kvstore.hpp"

#include <vector>

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
