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

    // A pre-2025 preset survives setup and drives the display, authentication
    // sample and session timestamps on the same timeline.
    TestClock::set(1704067200); // 2024-01-01T00:00:00Z
    demo.setup();
    assert(time(nullptr) == 1704067200);
    demo.sendMessage(R"({"event":"EVENT","data":{"type":"READER_AUTHENTICATE"}})");
    demo.loop();
    const auto presetAuth = last("READER_AUTHENTICATED");
    const auto presetSample = presetAuth["data"]["payload"]["serverTime"];
    assert(presetSample["epochMs"].as<int64_t>() == 1704067200000);
    WallClock::onServerTime(presetSample["epochMs"].as<int64_t>(), 0);
    const auto preset = WallClock::now();
    assert(preset.valid && preset.year == 2024 && preset.month == 1 && preset.day == 1);
    assert(preset.hour == 0 && preset.minute == 0);
    demo.sendMessage(R"({"event":"EVENT","data":{"type":"START_RESOURCE_USAGE_SESSION","payload":{"resourceId":2}}})");
    demo.loop();
    const auto presetList = last("RESOURCE_LIST");
    const auto presetSession = presetList["data"]["payload"]["resources"][1]["activeUsageSession"];
    assert(presetSession["startTime"].as<std::string>() == "2024-01-01T00:00:00");
    TestClock::set(1704067260);
    assert(WallClock::now().minute == 1);
    demo.sendMessage(R"({"event":"EVENT","data":{"type":"STOP_RESOURCE_USAGE_SESSION","payload":{"resourceId":2}}})");
    demo.loop();
    assert(last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["durationSeconds"].as<int>() == 60);

    // Derive demo offsets from the original instant, including both sides of
    // DST transitions, repeated local hours, and year rollover.
    const struct
    {
        const char *timezone;
        time_t instant;
        int offset;
    } presets[] = {
        {"America/New_York", 1772953199, -300}, // Before spring forward
        {"America/New_York", 1772953200, -240}, // After spring forward
        {"America/New_York", 1793512799, -240}, // Before fall back
        {"America/New_York", 1793512800, -300}, // After fall back
        {"Europe/Berlin", 1774745999, 60},
        {"Europe/Berlin", 1774746000, 120},
        {"Europe/Berlin", 1792889999, 120},
        {"Europe/Berlin", 1792890000, 60},
        {"America/New_York", 1767225600, -300}, // Local date is in previous year
        {"Asia/Kathmandu", 1767222000, 345},    // Local date is in next year
        {"UTC", 1767225600, 0},
    };
    for (const auto &preset : presets)
    {
        setenv("TZ", preset.timezone, 1);
        tzset();
        TestClock::set(preset.instant);
        tm expected{};
        assert(localtime_r(&preset.instant, &expected));
        const auto assertLocalClock = [&]()
        {
            const auto local = WallClock::now();
            assert(local.valid && local.year == expected.tm_year + 1900);
            assert(local.month == expected.tm_mon + 1 && local.day == expected.tm_mday);
            assert(local.weekday == expected.tm_wday);
            assert(local.hour == expected.tm_hour && local.minute == expected.tm_min);
        };
        demo.setup();
        assert(time(nullptr) == preset.instant);
        assertLocalClock();
        demo.sendMessage(R"({"event":"EVENT","data":{"type":"READER_AUTHENTICATE"}})");
        demo.loop();
        const auto auth = last("READER_AUTHENTICATED");
        const auto sample = auth["data"]["payload"]["serverTime"];
        assert(sample["epochMs"].as<int64_t>() == preset.instant * 1000);
        assert(sample["utcOffsetMinutes"].as<int>() == preset.offset);
        WallClock::onServerTime(sample["epochMs"].as<int64_t>(), sample["utcOffsetMinutes"].as<int>());
        assertLocalClock();
    }
}
