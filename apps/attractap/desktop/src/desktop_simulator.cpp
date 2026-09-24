#include "desktop_simulator.hpp"

#include "api_endpoint.hpp"
#include "display/display.hpp"
#include "settings/settings.hpp"
#include "state/state.hpp"

DesktopSimulator::DesktopSimulator(const std::string &endpoint, uint32_t readerId, std::filesystem::path profileRoot)
    : profile(endpoint, readerId, std::move(profileRoot)), virtualNfc(profile)
{
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

    const auto apiConfig = Settings::getAttraccessApiConfig();
    State::setWifiState(true, {}, "Desktop");
    State::setWebsocketState(false, apiConfig.hostname, apiConfig.port, apiConfig.useSSL);
    websocket.emplace(runtime);
    websocket->setStateCallback([](HostWebsocket::State state) {
        const auto config = Settings::getAttraccessApiConfig();
        const bool connected = state == HostWebsocket::State::Connected;
        State::setWebsocketState(connected, config.hostname, config.port, config.useSSL);
        State::setWebsocketPhase(state == HostWebsocket::State::Connected ? State::WS_CONNECTED
                                 : state == HostWebsocket::State::Connecting ? State::WS_CONNECTING
                                                                               : State::WS_INIT);
    });
    sdlDisplay.setCardPresenceCallback([this](size_t index, bool present) {
        virtualNfc.setPresent(index, present);
    });
    sdlDisplay.setClearCardCallback([this](size_t index) { virtualNfc.clearCardData(index); });

    Display::setup(sdlDisplay);
    api.emplace(*websocket);
    application.emplace(virtualNfc, *api);
    application->setup();
}

void DesktopSimulator::tick()
{
    runtime.dispatch();
    application->loop();
    lv_timer_handler();
}

void DesktopSimulator::reconnect()
{
    api->enableConnectionAttempts();
}

bool DesktopSimulator::authenticated() const
{
    return State::getApiState().authenticated;
}

uint32_t DesktopSimulator::authenticationGeneration() const
{
    return api->authenticationGeneration();
}
