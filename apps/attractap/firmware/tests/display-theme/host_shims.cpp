#include "fixtures.hpp"
#include "logger/logger.hpp"
#include "esp_timer.h"

// No production visual code is stubbed. SDK calls not listed here fail to link.
Logger::Logger(const char *name) : name(name) {}
int64_t esp_timer_get_time() { return static_cast<int64_t>(Fixtures::nowMs) * 1000; }
State::NetworkState State::getNetworkState() { return Fixtures::network; }
State::WebsocketState State::getWebsocketState() { return Fixtures::websocket; }
State::ApiState State::getApiState() { return Fixtures::api; }

// Deterministic clock formatting for resource detail fixtures.
std::string timeToTimeString(time_t, int) { return "12:00"; }
std::string millisToTimeString(double) { return "00:01:00"; }

void Logger::error(const char *) {}
void trimString(std::string &value) {
    const auto start = value.find_first_not_of(" \t\r\n");
    value = start == std::string::npos ? "" : value.substr(start, value.find_last_not_of(" \t\r\n") - start + 1);
}
