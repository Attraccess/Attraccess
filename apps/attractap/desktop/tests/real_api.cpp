#include "desktop_simulator.hpp"

#include <chrono>
#include <filesystem>
#include <functional>
#include <fstream>
#include <iostream>
#include <string>
#include <thread>

namespace
{
bool waitFor(const std::function<bool()> &condition, DesktopSimulator &simulator, std::chrono::seconds timeout)
{
    const auto deadline = std::chrono::steady_clock::now() + timeout;
    while (std::chrono::steady_clock::now() < deadline)
    {
        simulator.display().pollEvents();
        simulator.tick();
        if (condition()) return true;
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    return false;
}

void pumpFor(DesktopSimulator &simulator, std::chrono::seconds duration)
{
    const auto deadline = std::chrono::steady_clock::now() + duration;
    while (std::chrono::steady_clock::now() < deadline)
    {
        simulator.display().pollEvents();
        simulator.tick();
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
}

}

int main(int argc, char **argv)
{
    if (argc != 5)
    {
        std::cerr << "usage: attractap-desktop-real-api ENDPOINT READY RELEASE SCREENSHOTS\n";
        return 2;
    }

    const std::filesystem::path ready = argv[2];
    const std::filesystem::path release = argv[3];
    const std::filesystem::path screenshots = argv[4];
    std::filesystem::create_directories(screenshots);

    DesktopSimulator simulator(argv[1], 0, screenshots / "profile");
    if (!waitFor([&] { return simulator.authenticated(); }, simulator, std::chrono::seconds(15)))
    {
        std::cerr << "desktop simulator did not authenticate\n";
        return 1;
    }

    std::ofstream(ready) << "authenticated\n";
    if (!waitFor([&] { return std::filesystem::exists(release); }, simulator, std::chrono::seconds(15)))
    {
        std::cerr << "fixture did not release desktop simulator\n";
        return 1;
    }

    // Allow the fixture's resource-list push to reach LVGL before capturing it.
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    simulator.tick();
    if (!simulator.display().saveScreenshot(screenshots / "resource-list.png")) return 1;

    const auto initialAuthentication = simulator.authenticationGeneration();
    simulator.reconnect();
    // The authenticated flag may remain true while the transport restarts. Require
    // a new READER_AUTHENTICATED response from the server instead.
    if (!waitFor([&] { return simulator.authenticationGeneration() > initialAuthentication && simulator.authenticated(); },
                 simulator, std::chrono::seconds(15)))
    {
        std::cerr << "desktop simulator did not reconnect\n";
        return 1;
    }
    // The server serializes authenticated/resource-list messages until each ACK
    // arrives. Keep pumping the real client through that acknowledgement window.
    pumpFor(simulator, std::chrono::seconds(5));
    if (!simulator.display().saveScreenshot(screenshots / "reconnected.png")) return 1;
}
