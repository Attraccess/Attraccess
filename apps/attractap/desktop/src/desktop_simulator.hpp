#pragma once

#include "application/application.hpp"
#include "api/api.hpp"
#include "host_runtime.hpp"
#include "host_websocket.hpp"
#include "profile_store.hpp"
#include "sdl_display.hpp"
#include "virtual_nfc.hpp"

#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>

// Desktop-only composition of the production application. Keeping this separate
// from main lets the real-API probe exercise the same runtime as the app.
class DesktopSimulator
{
public:
    DesktopSimulator(const std::string &endpoint, uint32_t readerId,
                     std::filesystem::path profileRoot = ProfileStore::defaultRoot());

    void tick();
    void reconnect();
    bool authenticated() const;
    VirtualNfc &nfc() { return virtualNfc; }
    SdlDisplay &display() { return sdlDisplay; }

private:
    ProfileStore profile;
    HostRuntime runtime;
    VirtualNfc virtualNfc;
    SdlDisplay sdlDisplay;
    std::optional<HostWebsocket> websocket;
    std::optional<API> api;
    std::optional<Application> application;
};
