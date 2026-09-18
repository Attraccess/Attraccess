#include "fixtures.hpp"
#include "logger/logger.hpp"
#include "esp_timer.h"

// No production visual code is stubbed. SDK calls not listed here fail to link.
Logger::Logger(const char *name) : name(name) {}
int64_t esp_timer_get_time() { return static_cast<int64_t>(Fixtures::nowMs) * 1000; }
State::NetworkState State::getNetworkState() { return Fixtures::network; }
State::WebsocketState State::getWebsocketState() { return Fixtures::websocket; }
State::ApiState State::getApiState() { return Fixtures::api; }
