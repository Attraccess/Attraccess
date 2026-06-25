#pragma once

// Minimal stub — mock_settings.cpp provides the real in-memory implementation.
class Preferences {
public:
    bool begin(const char*, bool = false) { return true; }
    void end() {}
    bool getBool(const char*, bool d = false) { return d; }
    void putBool(const char*, bool) {}
    unsigned char getUChar(const char*, unsigned char d = 0) { return d; }
    void putUChar(const char*, unsigned char) {}
    unsigned int getUInt(const char*, unsigned int d = 0) { return d; }
    void putUInt(const char*, unsigned int) {}
    int getInt(const char*, int d = 0) { return d; }
    void putInt(const char*, int) {}
    // getString returns const char* default; Settings.cpp is excluded from native build
    const char* getString(const char*, const char* d = "") { return d ? d : ""; }
    void putString(const char*, const char*) {}
};
