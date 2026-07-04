#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include "nvs.h"

/**
 * Thin NVS wrapper with Arduino-Preferences-compatible semantics, so devices
 * provisioned under the old Arduino firmware keep their data after OTA:
 * - identical namespace/key naming (caller-supplied, unchanged)
 * - identical NVS value types (Bool/UChar -> u8, UShort -> u16, UInt -> u32,
 *   Int -> i32, String -> str, Bytes -> blob)
 * - begin(ns, true) on a namespace that was never written returns false and
 *   every get falls back to its default (first-boot path)
 * - every put commits immediately (Preferences committed per put)
 * - put* return the number of bytes written, 0 on failure
 */
class KVStore
{
public:
    ~KVStore() { end(); }

    bool begin(const char *namespaceName, bool readOnly = false);
    void end();

    std::string getString(const char *key, const std::string &defaultValue = "");
    bool getBool(const char *key, bool defaultValue = false);
    uint8_t getUChar(const char *key, uint8_t defaultValue = 0);
    uint16_t getUShort(const char *key, uint16_t defaultValue = 0);
    uint32_t getUInt(const char *key, uint32_t defaultValue = 0);
    int32_t getInt(const char *key, int32_t defaultValue = 0);
    size_t getBytes(const char *key, void *buf, size_t maxLen);

    size_t putString(const char *key, const std::string &value);
    size_t putBool(const char *key, bool value);
    size_t putUChar(const char *key, uint8_t value);
    size_t putUShort(const char *key, uint16_t value);
    size_t putUInt(const char *key, uint32_t value);
    size_t putInt(const char *key, int32_t value);
    size_t putBytes(const char *key, const void *value, size_t len);

    bool remove(const char *key);

private:
    nvs_handle_t handle = 0;
    bool opened = false;

    bool commit();
};
