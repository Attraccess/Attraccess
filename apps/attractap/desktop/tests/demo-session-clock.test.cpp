#include "api/demo/websocket.hpp"
#include "clock/wall_clock.hpp"
#include "controlled-clock.hpp"
#include <cassert>
#include <cstdlib>
#include <vector>

int main()
{
    setenv("TZ", "UTC", 1);
    tzset();
    TestClock::set(0);
    DemoWebsocket demo;
    std::vector<std::string> messages;
    demo.setMessageCallbackRaw([&](const char *data, size_t size) { messages.emplace_back(data, size); });
    demo.setup();
    const auto demoUtc = time(nullptr);
    assert(demoUtc == 1767268800);
    const auto last = [&](const char *type)
    {
        for (auto it = messages.rbegin(); it != messages.rend(); ++it)
        {
            JsonDocument doc;
            assert(!deserializeJson(doc, *it));
            if (doc["data"]["type"].as<std::string>() == type) return doc;
        }
        assert(false && "Missing demo response");
        return JsonDocument{};
    };
    demo.sendMessage(R"({"event":"EVENT","data":{"type":"READER_AUTHENTICATE"}})");
    demo.loop();
    auto auth = last("READER_AUTHENTICATED");
    auto sample = auth["data"]["payload"]["serverTime"];
    assert(sample["epochMs"].as<int64_t>() == demoUtc * 1000);
    assert(sample["utcOffsetMinutes"].as<int>() == 0);
    WallClock::onServerTime(sample["epochMs"].as<int64_t>(), 0);
    const auto clock = WallClock::now();
    assert(clock.valid && clock.year == 2026 && clock.day == 1 && clock.hour == 12);

    // The production demo session uses the same initialized system timeline.
    demo.sendMessage(R"({"event":"EVENT","data":{"type":"START_RESOURCE_USAGE_SESSION","payload":{"resourceId":2}}})");
    demo.loop();
    auto list = last("RESOURCE_LIST");
    auto session = list["data"]["payload"]["resources"][1]["activeUsageSession"];
    assert(session["startTime"].as<std::string>() == "2026-01-01T12:00:00");
    assert(session["startTimeUtcOffsetMinutes"].as<int>() == 0);
    TestClock::set(demoUtc + 60);
    assert(WallClock::now().minute == 1);
    demo.sendMessage(R"({"event":"EVENT","data":{"type":"STOP_RESOURCE_USAGE_SESSION","payload":{"resourceId":2}}})");
    demo.loop();
    assert(last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["durationSeconds"].as<int>() == 60);

    // A backwards system-time correction never produces a negative demo summary.
    demo.sendMessage(R"({"event":"EVENT","data":{"type":"START_RESOURCE_USAGE_SESSION","payload":{"resourceId":2}}})");
    demo.loop();
    TestClock::set(demoUtc);
    demo.sendMessage(R"({"event":"EVENT","data":{"type":"STOP_RESOURCE_USAGE_SESSION","payload":{"resourceId":2}}})");
    demo.loop();
    assert(last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["durationSeconds"].as<int>() == 0);
}
