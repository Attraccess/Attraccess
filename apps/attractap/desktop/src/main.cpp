#include "application/application.hpp"
#include "api_endpoint.hpp"
#include "api/api.hpp"
#include "display/display.hpp"
#include "host_runtime.hpp"
#include "host_websocket.hpp"
#include "profile_store.hpp"
#include "sdl_display.hpp"
#include "settings/settings.hpp"
#include "state/state.hpp"
#include "virtual_nfc.hpp"

#include <chrono>
#include <limits>
#include <stdexcept>
#include <thread>

namespace
{
uint32_t parseReaderId(const char *value)
{
    size_t parsed = 0;
    const auto readerId = std::stoull(value, &parsed);
    if (value[parsed] != '\0' || readerId > std::numeric_limits<uint32_t>::max())
        throw std::invalid_argument("Reader ID must be an unsigned 32-bit integer");
    return static_cast<uint32_t>(readerId);
}

}

int main(int argc, char **argv)
{
    const std::string endpoint = argc > 1 ? argv[1] : "https://localhost";
    const uint32_t readerId = argc > 2 ? parseReaderId(argv[2]) : 0;
    ProfileStore profile(endpoint, readerId);
    if (profile.get("api.host").empty())
        profile.put("api.host", endpoint);
    if (profile.get("api.readerId").empty())
        profile.put("api.readerId", std::to_string(readerId));

    KVStore::setHostProfile(&profile);
    Settings::setup();
    if (Settings::getAttraccessApiConfig().port == 0)
    {
        const auto apiEndpoint = parseApiEndpoint(profile.get("api.host"));
        Settings::saveAttraccessApiConfig(apiEndpoint.hostname, apiEndpoint.port, apiEndpoint.useSSL);
    }
    if (readerId != 0 || Settings::getAttraccessAuthConfig().readerId == 0)
        Settings::saveAttraccessAuthConfig(Settings::getAttraccessAuthConfig().apiKey, readerId);

    HostRuntime runtime;
    HostWebsocket websocket(runtime, profile.get("api.host"));
    const auto apiConfig = Settings::getAttraccessApiConfig();
    State::setWifiState(true, {}, "Desktop");
    State::setWebsocketState(false, apiConfig.hostname, apiConfig.port, apiConfig.useSSL);
    websocket.setStateCallback([](HostWebsocket::State state) {
        const auto apiConfig = Settings::getAttraccessApiConfig();
        const bool connected = state == HostWebsocket::State::Connected;
        State::setWebsocketState(connected, apiConfig.hostname, apiConfig.port, apiConfig.useSSL);
        State::setWebsocketPhase(state == HostWebsocket::State::Connected ? State::WS_CONNECTED
                                 : state == HostWebsocket::State::Connecting ? State::WS_CONNECTING
                                                                               : State::WS_INIT);
    });
    VirtualNfc nfc(profile);
    API api(websocket);
    Application application(nfc, api);
    SdlDisplay display;
    display.setKeyCallback([&nfc](SDL_Keycode key) {
        // Keep simulator input outside the application UI; N presents/removes the virtual card.
        if (key == SDLK_N)
            nfc.setPresent(!nfc.card().present);
    });

    Display::setup(display);
    application.setup();

    while (display.pollEvents())
    {
        runtime.dispatch();
        application.loop();
        lv_timer_handler();
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    return 0;
}
