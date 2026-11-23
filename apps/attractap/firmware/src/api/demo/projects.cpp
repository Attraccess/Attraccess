#include "../../demo/demo_localization.hpp"
#ifdef DEMO_MODE

#include "websocket.hpp"
#include "../../state/state.hpp"
#include <ArduinoJson.h>
#include <cctype>
#include <cstring>
#include <cstdio>
#include <string>
#include <vector>

#include "fixtures.hpp"

// ---------------------------------------------------------------------------
// Stateful demo handlers: resource lookup and the project picker
// ---------------------------------------------------------------------------

int DemoWebsocket::sessionIndexForResource(uint32_t resourceId)
{
    for (uint8_t i = 0; i < DemoStore::getResourceCount(); i++)
    {
        if (DemoStore::getResource(i).id == resourceId)
            return i;
    }
    return -1;
}

static bool demoProjectMatches(const char *name, const std::string &search)
{
    std::string haystack(name);
    std::string needle(search);
    for (auto *text : {&haystack, &needle})
        for (char &c : *text)
            c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return haystack.find(needle) != std::string::npos;
}

void DemoWebsocket::respondProjects(uint32_t page, const std::string &search)
{
    if (page == 0)
        page = 1;

    const bool english = State::getActiveLanguage() == "en";
    std::vector<uint32_t> matches;
    for (uint32_t i = 0; i < DEMO_PROJECT_COUNT; i++)
    {
        if (demoProjectMatches(DemoLocalization::projectName(i, english), search))
            matches.push_back(i);
    }

    StaticJsonDocument<1024> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "PROJECTS_OF_USER";
    doc["data"]["payload"]["page"] = page;
    doc["data"]["payload"]["limit"] = DEMO_PROJECT_PAGE_SIZE;
    doc["data"]["payload"]["total"] = matches.size();
    doc["data"]["payload"]["search"] = search;

    JsonArray projects = doc["data"]["payload"]["projects"].to<JsonArray>();
    uint32_t start = (page - 1) * DEMO_PROJECT_PAGE_SIZE;
    for (uint32_t i = start; i < start + DEMO_PROJECT_PAGE_SIZE && i < matches.size(); i++)
    {
        JsonObject obj = projects.createNestedObject();
        obj["id"] = matches[i] + 1;
        obj["name"] = DemoLocalization::projectName(matches[i], english);
    }

    char buf[1024];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));
}

#endif
