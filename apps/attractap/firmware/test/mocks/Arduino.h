#pragma once

#include <string>
#include <cstring>
#include <cstdio>
#include <cstdint>
#include <algorithm>

extern "C" {
    unsigned long millis();
    void delay(unsigned long ms);
}

template <class T> inline T min(T a, T b) { return a < b ? a : b; }
template <class T> inline T max(T a, T b) { return a > b ? a : b; }

class String {
public:
    String() : _s("") {}
    String(const char* s) : _s(s ? s : "") {}   // NOLINT implicit
    String(const std::string& s) : _s(s) {}      // NOLINT implicit
    explicit String(char c) : _s(1, c) {}
    explicit String(int v) : _s(std::to_string(v)) {}
    explicit String(unsigned int v) : _s(std::to_string(v)) {}
    explicit String(long v) : _s(std::to_string(v)) {}
    explicit String(unsigned long v) : _s(std::to_string(v)) {}

    String(const String&) = default;
    String(String&&) = default;
    String& operator=(const String&) = default;
    String& operator=(String&&) = default;
    String& operator=(const char* s) { _s = s ? s : ""; return *this; }

    size_t length() const { return _s.size(); }
    bool isEmpty() const { return _s.empty(); }
    void reserve(size_t n) { _s.reserve(n); }
    const char* c_str() const { return _s.c_str(); }
    char charAt(size_t i) const { return _s[i]; }
    char operator[](size_t i) const { return _s[i]; }
    char& operator[](size_t i) { return _s[i]; }

    bool operator==(const String& o) const { return _s == o._s; }
    bool operator==(const char* o) const { return _s == (o ? o : ""); }
    friend bool operator==(const char* l, const String& r) { return r == l; }
    bool operator!=(const String& o) const { return _s != o._s; }
    bool operator!=(const char* o) const { return !(*this == o); }
    bool operator<(const String& o) const { return _s < o._s; }

    String& operator+=(const String& o) { _s += o._s; return *this; }
    String& operator+=(const char* o) { if (o) _s += o; return *this; }
    String& operator+=(char c) { _s += c; return *this; }
    String& operator+=(int v) { _s += std::to_string(v); return *this; }
    String& operator+=(unsigned long v) { _s += std::to_string(v); return *this; }

    String operator+(const String& o) const { return String(_s + o._s); }
    String operator+(const char* o) const { return String(_s + (o ? o : "")); }
    String operator+(char c) const { String r(*this); r._s += c; return r; }
    friend String operator+(const char* l, const String& r) {
        return String(std::string(l ? l : "") + r._s);
    }

    int indexOf(char c) const {
        auto p = _s.find(c); return p == std::string::npos ? -1 : (int)p;
    }
    int indexOf(const char* s) const {
        if (!s) return -1;
        auto p = _s.find(s); return p == std::string::npos ? -1 : (int)p;
    }
    int indexOf(const String& s) const { return indexOf(s.c_str()); }

    String substring(size_t from) const {
        if (from >= _s.size()) return String("");
        return String(_s.substr(from));
    }
    String substring(size_t from, size_t to) const {
        if (from >= _s.size()) return String("");
        return String(_s.substr(from, to - from));
    }

    void trim() {
        auto a = _s.find_first_not_of(" \t\r\n");
        if (a == std::string::npos) { _s.clear(); return; }
        auto b = _s.find_last_not_of(" \t\r\n");
        _s = _s.substr(a, b - a + 1);
    }

    // ArduinoJson uses concat() to serialize into a String
    bool concat(const char* s) { if (s) { _s += s; return true; } return false; }
    bool concat(const char* s, size_t len) { if (s) { _s.append(s, len); return true; } return false; }

    bool startsWith(const String& pre) const { return _s.find(pre._s) == 0; }
    bool startsWith(const char* pre) const { return pre && _s.find(pre) == 0; }
    bool endsWith(const String& suf) const {
        return suf.length() <= _s.size() && _s.rfind(suf._s) == _s.size() - suf.length();
    }

    long toInt() const { return strtol(_s.c_str(), nullptr, 10); }
    float toFloat() const { return strtof(_s.c_str(), nullptr); }
    double toDouble() const { return strtod(_s.c_str(), nullptr); }

    const std::string& std_str() const { return _s; }

private:
    std::string _s;
};

class HardwareSerial {
public:
    std::string _out;
    void begin(unsigned long) {}
    void flush() {}
    int available() { return 0; }
    int read() { return -1; }
    size_t print(const char* s) { if (s) _out += s; return s ? strlen(s) : 0; }
    size_t print(const String& s) { _out += s.c_str(); return s.length(); }
    size_t print(char c) { _out += c; return 1; }
    size_t print(int v) { auto t = std::to_string(v); _out += t; return t.size(); }
    size_t print(unsigned int v) { auto t = std::to_string(v); _out += t; return t.size(); }
    size_t print(long v) { auto t = std::to_string(v); _out += t; return t.size(); }
    size_t print(unsigned long v) { auto t = std::to_string(v); _out += t; return t.size(); }
    size_t println(const char* s) { if (s) _out += s; _out += '\n'; return s ? strlen(s) + 1 : 1; }
    size_t println(const String& s) { _out += s.c_str(); _out += '\n'; return s.length() + 1; }
    size_t println(char c) { _out += c; _out += '\n'; return 2; }
    size_t println(int v) { auto t = std::to_string(v); _out += t + '\n'; return t.size() + 1; }
    size_t println() { _out += '\n'; return 1; }
    void clear() { _out.clear(); }
};

extern HardwareSerial Serial;
