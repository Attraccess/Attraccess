#include "api/handlers/resource-introducers.hpp"
#include <iostream>

namespace {
std::vector<std::string> displayNames(const JsonDocument &message)
{
    return parseIntroducerDisplayNames(message["introducers"].as<JsonArrayConst>(),
                                       message["introducerDisplayNames"].as<JsonArrayConst>());
}

// ATT-1385: display names follow the introducer usernames entry by entry, with the same skips, the
// username for a missing name, and each cut to 79 bytes in whole UTF-8 characters.
int displayNamesStayAligned()
{
    std::string longName(78, 'x');
    longName += "\xC3\x84rger"; // the cut at 79 bytes lands inside the "Ä"
    while (longName.size() < 200) longName += " \xC3\x96lm\xC3\xBCller";
    JsonDocument message;
    auto usernames = message["introducers"].to<JsonArray>();
    auto names = message["introducerDisplayNames"].to<JsonArray>();
    for (int i = 1; i <= 40; ++i) {
        usernames.add("tutor" + std::to_string(i));
        names.add("Tutor " + std::to_string(i) + " \xC3\x84\xC3\x96\xC3\x9C");
    }
    usernames.add("");       // skipped like the username list skips it
    names.add("Nobody");
    usernames.add("plain");  // no display name: the username
    names.add("");
    usernames.add("long");
    names.add(longName);
    const auto parsed = displayNames(message);
    if (parsed.size() != parseResourceIntroducers(message["introducers"].as<JsonArrayConst>()).size()) {
        std::cerr << "Display names do not line up with the introducers\n";
        return 1;
    }
    if (parsed[0] != "Tutor 1 \xC3\x84\xC3\x96\xC3\x9C" || parsed[39] != "Tutor 40 \xC3\x84\xC3\x96\xC3\x9C" ||
        parsed[40] != "plain" || parsed[41] != std::string(78, 'x')) {
        std::cerr << "Display names parsed wrongly\n";
        return 1;
    }
    names.remove(0);
    if (!displayNames(message).empty()) return 1; // another length: the screen shows the usernames
    message.remove("introducerDisplayNames");
    if (!displayNames(message).empty()) return 1; // an older server
    return 0;
}
}

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
    return displayNamesStayAligned();
}
