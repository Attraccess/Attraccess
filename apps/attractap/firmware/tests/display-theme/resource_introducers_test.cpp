#include "api/resource_introducers.hpp"
#include <iostream>

int main()
{
    JsonDocument message;
    auto names = message["introducers"].to<JsonArray>();
    std::vector<std::string> expected;
    for (int i = 1; i <= 40; ++i) {
        expected.push_back("Tutor " + std::to_string(i) + " ÄÖÜ very long name");
        names.add(expected.back());
    }
    names.add(nullptr);
    names.add(42);
    names.add("");
    std::string wire;
    serializeJson(message, wire);
    JsonDocument decoded;
    if (deserializeJson(decoded, wire) ||
        parseResourceIntroducers(decoded["introducers"].as<JsonArrayConst>()) != expected) {
        std::cerr << "Introducers lost during JSON parsing\n";
        return 1;
    }
    decoded.clear();
    if (!parseResourceIntroducers(decoded["introducers"].as<JsonArrayConst>()).empty()) return 1;
    decoded["introducers"].to<JsonArray>().add("Replacement tutor");
    if (parseResourceIntroducers(decoded["introducers"].as<JsonArrayConst>()) !=
        std::vector<std::string>{"Replacement tutor"}) return 1;
    return 0;
}
