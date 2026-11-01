// Host test: shared fixtures give the firmware the same verdict as the server validator (Jest), and the
// READER_FIRMWARE_INFO capabilities serialize without truncation for Touch and Lite.
#include <ArduinoJson.h>

#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "ui_capabilities.hpp"
#include "ui_record.hpp"

namespace fs = std::filesystem;
static int failures = 0;

#define CHECK(cond, msg)                                                    \
    do {                                                                    \
        if (!(cond)) { std::cerr << "FAIL: " << msg << "\n"; failures++; } \
    } while (0)

static ui::SlotRecord record;

static void runFixtures()
{
    std::vector<fs::path> files;
    for (const auto &e : fs::directory_iterator(UI_FIXTURE_DIR))
        if (e.path().extension() == ".json") files.push_back(e.path());
    CHECK(files.size() > 20, "fixtures found");
    int slotFixtures = 0;
    for (const auto &path : files)
    {
        std::ifstream in(path);
        std::stringstream ss;
        ss << in.rdbuf();
        JsonDocument doc;
        if (deserializeJson(doc, ss.str(), DeserializationOption::NestingLimit(32)))
        {
            std::cerr << "FAIL: unparsable fixture " << path << "\n";
            failures++;
            continue;
        }
        const std::string kind = doc["kind"].as<std::string>();
        const std::string verdict = doc["verdict"].as<std::string>();
        if (kind != "slot-update") continue;
        slotFixtures++;
        const size_t bytes = measureJson(doc["payload"]);
        const ui::Verdict got = ui::parseSlotUpdate(doc["payload"].as<JsonObjectConst>(), bytes, record);
        const bool expectAccept = verdict == "accept";
        const bool accepted = got == ui::Verdict::Accept;
        CHECK(accepted == expectAccept,
              doc["name"].as<std::string>() << ": expected " << verdict << " got " << ui::verdictName(got));
        if (!expectAccept && verdict.rfind("reject:", 0) == 0)
        {
            CHECK(verdict.substr(7) == ui::verdictName(got),
                  doc["name"].as<std::string>() << ": reason " << ui::verdictName(got) << " != " << verdict);
        }
    }
    CHECK(slotFixtures > 20, "slot fixtures run");
}

static void runLatin1()
{
    char out[64];
    CHECK(ui::sanitizeLatin1("caf\xC3\xA9", out, sizeof out) == 4 && std::string(out) == "caf\xC3\xA9", "latin1 kept");
    CHECK(ui::sanitizeLatin1("a\xE2\x80\x94" "b", out, sizeof out) == 3 && std::string(out) == "a?b", "emdash -> ?");
    CHECK(ui::sanitizeLatin1("\xF0\x9F\x98\x80", out, sizeof out) == 1 && std::string(out) == "?", "emoji -> ?");
    CHECK(ui::sanitizeLatin1("a\nb", out, sizeof out) == 3 && std::string(out) == "a b", "control -> space");
    CHECK(ui::sanitizeLatin1("toolong", out, 4) == -1, "overflow reported");
}

static void runRemovalAndFields()
{
    JsonDocument doc;
    deserializeJson(doc, R"({"resourceId":3,"slot":"resource.details.body","revision":7,"owner":"p","key":"k",
        "serverNowMs":1000,"expiresAtMs":2000,"tree":{"t":"row","c":[{"t":"text","text":"Hi"},
        {"t":"countdown","toMs":5000}]}})");
    CHECK(ui::parseSlotUpdate(doc.as<JsonObjectConst>(), measureJson(doc), record) == ui::Verdict::Accept, "accept");
    CHECK(record.nodeCount == 3 && record.nodes[1].parent == 0 && record.nodes[2].toMs == 5000, "flat record");
    CHECK(std::string(record.text(record.nodes[1])) == "Hi", "text copied");
    CHECK(record.revision == 7 && record.expiresAtMs == 2000 && record.resourceId == 3, "meta");
    deserializeJson(doc, R"({"resourceId":3,"slot":"resource.details.body","revision":8,"owner":"p","key":"k",
        "serverNowMs":1000,"tree":null})");
    CHECK(ui::parseSlotUpdate(doc.as<JsonObjectConst>(), measureJson(doc), record) == ui::Verdict::Accept &&
              record.removal,
          "removal");
}

static void roundTrip(const char *name, const ui::VariantTraits &traits, bool expectDisplay)
{
    JsonDocument event;
    event["event"] = "EVENT";
    event["data"]["type"] = "READER_FIRMWARE_INFO";
    event["data"]["payload"]["name"] = "attractap_touch_v2";
    event["data"]["payload"]["variant"] = "wifi";
    event["data"]["payload"]["version"] = "1.9.0";
    event["data"]["payload"]["capabilities"]["resourceSelection"] = true;
    event["data"]["payload"]["capabilities"]["cardEnrollment"] = true;
    event["data"]["payload"]["capabilities"]["hasLeds"] = traits.hasLeds;
    ui::fillCapabilitiesUi(event["data"]["payload"]["capabilities"]["ui"].to<JsonObject>(), traits);
    event["data"]["payload"]["resetReason"] = "CPU_LOCKUP";
    char buf[1024];
    const size_t n = serializeJson(event, buf, sizeof buf);
    CHECK(n > 0 && n < sizeof buf && n == measureJson(event), name << ": serialized completely in 1024 B (" << n << ")");
    JsonDocument back;
    CHECK(!deserializeJson(back, buf, n), name << ": parses back");
    JsonObject uiObj = back["data"]["payload"]["capabilities"]["ui"];
    CHECK(uiObj["schemaVersion"] == 1 && back["data"]["payload"]["resetReason"] == "CPU_LOCKUP", name << ": fields");
    CHECK(uiObj["display"].isNull() != expectDisplay, name << ": display");
    CHECK(uiObj["components"].as<JsonArray>().size() == (expectDisplay ? 9u : 0u), name << ": components");
    CHECK(uiObj["slots"].as<JsonArray>().size() == (expectDisplay ? 4u : 0u), name << ": slots");
}

int main()
{
    runFixtures();
    runLatin1();
    runRemovalAndFields();
    roundTrip("touch", {true, true, false, true, false, 480, 480}, true);
    roundTrip("lite", {false, false, true, true, true, 0, 0}, false);
    JsonDocument lite;
    ui::fillCapabilitiesUi(lite.to<JsonObject>(), {false, false, true, true, true, 0, 0});
    CHECK(lite["steps"].as<JsonArray>().size() == 1 && lite["steps"][0] == "card-confirm", "lite steps");
    if (failures) { std::cerr << failures << " failure(s)\n"; return 1; }
    std::cout << "ui-schema ok\n";
    return 0;
}
