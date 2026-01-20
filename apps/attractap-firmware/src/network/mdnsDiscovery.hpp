#pragma once

#include <Arduino.h>
#include <ESPmDNS.h>
#include "../settings/settings.hpp"
#include "../state/state.hpp"
#include "../logger/logger.hpp"

class MdnsDiscovery
{
public:
    static void setup();
    static void loop();

private:
    static bool ensureStarted();
    static bool shouldAttemptDiscovery();
    static bool parseUrl(const String &url, String &hostOut, uint16_t &portOut, bool &sslOut);
    static bool parseTxtBool(const String &value);
    static String normalizeHostname(const String &hostname);

    static Logger logger;
    static bool started;
    static bool discovered;
    static uint32_t lastQueryMs;
    static const uint32_t QUERY_INTERVAL_MS;
};
