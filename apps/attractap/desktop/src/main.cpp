#include "desktop_simulator.hpp"

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
    DesktopSimulator simulator(endpoint, readerId);

    while (simulator.display().pollEvents())
    {
        simulator.tick();
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    return 0;
}
