#include "desktop_simulator.hpp"
#include "settings/settings.hpp"
#include "display/display.hpp"
#include "state/state.hpp"

#include <ArduinoJson.h>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <thread>
#include <vector>
#include <algorithm>
#include <cctype>
#include <cstdio>

namespace
{
void pump(DesktopSimulator &simulator)
{
    simulator.display().pollEvents();
    simulator.tick();
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
}

bool waitFor(const std::function<bool()> &condition, DesktopSimulator &simulator, int timeoutMs = 10000)
{
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeoutMs);
    do
    {
        pump(simulator);
        if (condition()) return true;
    } while (std::chrono::steady_clock::now() < deadline);
    return false;
}

// Look only at the active LVGL tree and top layer, excluding hidden ancestors.
// These are real widgets built by the production screens, not fixture values.
void findObjects(lv_obj_t *root, const std::function<bool(lv_obj_t *)> &matches, std::vector<lv_obj_t *> &found)
{
    if (!root || lv_obj_has_flag(root, LV_OBJ_FLAG_HIDDEN) || lv_obj_has_state(root, LV_STATE_DISABLED)) return;
    if (matches(root)) found.push_back(root);
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        findObjects(lv_obj_get_child(root, i), matches, found);
}

lv_obj_t *findVisible(const std::function<bool(lv_obj_t *)> &matches)
{
    std::vector<lv_obj_t *> found;
    findObjects(lv_layer_top(), matches, found);
    // The persistent status bar also lives on the top layer. Only a visible
    // full-display overlay blocks the underlying screen.
    bool modal = false;
    for (uint32_t i = 0; i < lv_obj_get_child_count(lv_layer_top()); ++i)
    {
        auto *child = lv_obj_get_child(lv_layer_top(), i);
        if (!lv_obj_has_flag(child, LV_OBJ_FLAG_HIDDEN) && lv_obj_get_width(child) >= 480 && lv_obj_get_height(child) >= 480)
            modal = true;
    }
    if (!modal) findObjects(lv_screen_active(), matches, found);
    return found.size() == 1 ? found.front() : nullptr;
}

lv_obj_t *findText(const std::string &text)
{
    return findVisible([&](lv_obj_t *object) {
        return lv_obj_check_type(object, &lv_label_class) && text == lv_label_get_text(object);
    });
}

std::string screenName()
{
    if (lv_screen_active() == Display::lockscreen.getScreen()) return "locked";
    if (lv_screen_active() == Display::resourceListScreen.getScreen()) return "resources";
    if (lv_screen_active() == Display::resourceDetailsScreen.getScreen()) return "details";
    if (lv_screen_active() == Display::enrollmentScreen.getScreen()) return "enrollment";
    if (lv_screen_active() == Display::supervisionScreen.getScreen()) return "supervision";
    return "other";
}

bool validCommand(JsonDocument &command)
{
    if (!command.is<JsonObject>() || !command["action"].is<const char *>()) return false;
    const std::string action = command["action"].as<std::string>();
    const std::vector<std::string> actions = {"wait-text", "wait-screen", "click", "edit", "present", "remove", "faults", "corrupt-key", "snapshot", "reconnect", "inspect", "set-pin", "quit"};
    if (std::find(actions.begin(), actions.end(), action) == actions.end()) return false;
    for (JsonPair field : command.as<JsonObject>())
    {
        const std::string key = field.key().c_str();
        if (key == "action") continue;
        if (key == "text" && (action == "wait-text" || action == "wait-screen" || action == "click" || action == "edit" || action == "snapshot" || action == "set-pin"))
        {
            if (!field.value().is<const char *>() || field.value().as<std::string>().size() > 512) return false;
        }
        else if (key == "card" && (action == "present" || action == "remove" || action == "faults" || action == "corrupt-key" || action == "inspect"))
        {
            if (!field.value().is<unsigned>() || field.value().as<unsigned>() >= VirtualNfc::CardCount) return false;
        }
        else if (key == "slot" && action == "corrupt-key")
        {
            if (!field.value().is<unsigned>() || field.value().as<unsigned>() >= VirtualNfc::KeySlotCount) return false;
        }
        else if ((key == "write" || key == "authentication" || key == "removeOnWrite") && action == "faults")
        {
            if (!field.value().is<bool>()) return false;
        }
        else return false;
    }
    if (action == "wait-text" || action == "wait-screen" || action == "click" || action == "edit" || action == "snapshot")
        if (!command["text"].is<const char *>()) return false;
    if (action == "snapshot")
    {
        const std::string name = command["text"].as<std::string>();
        if (name.empty() || name.size() > 80 || !std::all_of(name.begin(), name.end(), [](unsigned char c) { return std::isalnum(c) || c == '-' || c == '_'; })) return false;
    }
    return true;
}

void collectLabels(lv_obj_t *root, JsonArray labels)
{
    if (!root || labels.size() >= 64 || lv_obj_has_flag(root, LV_OBJ_FLAG_HIDDEN)) return;
    if (lv_obj_check_type(root, &lv_label_class))
    {
        const std::string text = lv_label_get_text(root);
        labels.add(text.substr(0, 256));
    }
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        collectLabels(lv_obj_get_child(root, i), labels);
}

bool execute(JsonDocument &command, DesktopSimulator &simulator, const std::filesystem::path &screenshots)
{
    const std::string action = command["action"] | "";
    const std::string text = command["text"] | "";
    const size_t cardIndex = command["card"] | 0;
    if (action == "wait-text") return waitFor([&] { return findText(text) != nullptr; }, simulator);
    if (action == "wait-screen")
    {
        IScreen *screen = nullptr;
        if (text == "locked") screen = &Display::lockscreen;
        else if (text == "resources") screen = &Display::resourceListScreen;
        else if (text == "details") screen = &Display::resourceDetailsScreen;
        else if (text == "enrollment") screen = &Display::enrollmentScreen;
        else if (text == "supervision") screen = &Display::supervisionScreen;
        if (!screen) return false;
        return waitFor([&] { return screen->getScreen() && lv_screen_active() == screen->getScreen(); }, simulator);
    }
    if (action == "click")
    {
        if (!waitFor([&] { return findText(text) != nullptr; }, simulator)) return false;
        auto *object = findText(text);
        while (object && !lv_obj_has_flag(object, LV_OBJ_FLAG_CLICKABLE)) object = lv_obj_get_parent(object);
        if (!object || lv_obj_has_state(object, LV_STATE_DISABLED)) return false;
        // LVGL's normal event callbacks perform the application action. Checkable
        // widgets need the state toggle normally performed by the input device.
        if (lv_obj_has_flag(object, LV_OBJ_FLAG_CHECKABLE))
        {
            if (lv_obj_has_state(object, LV_STATE_CHECKED)) lv_obj_remove_state(object, LV_STATE_CHECKED);
            else lv_obj_add_state(object, LV_STATE_CHECKED);
            lv_obj_send_event(object, LV_EVENT_VALUE_CHANGED, nullptr);
        }
        lv_obj_send_event(object, LV_EVENT_PRESSED, nullptr);
        lv_obj_send_event(object, LV_EVENT_RELEASED, nullptr);
        lv_obj_send_event(object, LV_EVENT_CLICKED, nullptr);
    }
    else if (action == "edit")
    {
        auto *input = findVisible([](lv_obj_t *obj) { return lv_obj_check_type(obj, &lv_textarea_class); });
        auto *keyboard = findVisible([](lv_obj_t *obj) { return lv_obj_check_type(obj, &lv_keyboard_class); });
        if (!input || !keyboard) return false;
        lv_textarea_set_text(input, text.c_str());
        lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
    }
    else if (action == "present") simulator.nfc().setPresent(cardIndex, true);
    else if (action == "remove") simulator.nfc().setPresent(cardIndex, false);
    else if (action == "faults")
    {
        auto card = simulator.nfc().card(cardIndex);
        card.failWrite = command["write"] | false;
        simulator.nfc().setRemoveOnWrite(command["removeOnWrite"] | false);
        card.failAuthentication = command["authentication"] | false;
        simulator.nfc().setCard(cardIndex, card);
    }
    else if (action == "corrupt-key")
    {
        auto card = simulator.nfc().card(cardIndex);
        const size_t slot = command["slot"] | 1;
        card.keys.at(slot)[0] ^= 0xff;
        simulator.nfc().setCard(cardIndex, card);
    }
    else if (action == "set-pin")
    {
        if (text.size() != 4 || !std::all_of(text.begin(), text.end(), [](unsigned char c) { return std::isdigit(c); })) return false;
        Settings::setDevicePin(text);
    }
    else if (action == "snapshot")
    {
        lv_refr_now(nullptr);
        return simulator.display().saveDisplayScreenshot(screenshots / (text + ".png"));
    }
    else if (action == "reconnect")
    {
        const auto generation = simulator.authenticationGeneration();
        simulator.reconnect();
        return waitFor([&] { return simulator.authenticated() && simulator.authenticationGeneration() > generation; }, simulator);
    }
    else if (action != "inspect" && action != "quit") return false;
    pump(simulator);
    return true;
}
}

int main(int argc, char **argv)
{
    std::setvbuf(stdout, nullptr, _IONBF, 0);
    if (argc != 4)
    {
        std::cerr << "usage: attractap-desktop-real-api ENDPOINT CONTROL_DIRECTORY PROFILE_DIRECTORY\n";
        return 2;
    }
    const std::filesystem::path control = argv[2];
    const auto screenshots = control / "screenshots";
    std::filesystem::create_directories(screenshots);
    DesktopSimulator simulator(argv[1], 0, argv[3]);
    if (!waitFor([&] { return simulator.authenticated(); }, simulator, 15000)) return 1;
    std::ofstream(control / "ready") << "authenticated\n";

    // Numbered files avoid blocking stdin while the real websocket and LVGL
    // runtime continue pumping. The harness publishes requests atomically.
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::minutes(5);
    for (unsigned sequence = 1; std::chrono::steady_clock::now() < deadline;)
    {
        pump(simulator);
        auto request = control / (std::to_string(sequence) + ".json");
        if (!std::filesystem::exists(request)) continue;
        JsonDocument command;
        std::ifstream input(request);
        const bool sizeOk = std::filesystem::file_size(request) <= 4096;
        const auto parseError = sizeOk ? deserializeJson(command, input) : DeserializationError::TooDeep;
        const bool valid = sizeOk && !parseError && validCommand(command);
        bool ok = false;
        try { ok = valid && execute(command, simulator, screenshots); }
        catch (const std::exception &) { ok = false; }
        JsonDocument result;
        result["ok"] = ok;
        result["screen"] = screenName();
        result["devicePin"] = Settings::getDeviceConfig().passCode;
        result["readerId"] = Settings::getAttraccessAuthConfig().readerId;
        result["authenticationGeneration"] = simulator.authenticationGeneration();
        result["authenticated"] = simulator.authenticated();
        result["networkAvailable"] = State::getNetworkQualityState().quality != State::NETWORK_QUALITY_OFFLINE;
        result["removedOnWrite"] = simulator.nfc().removedOnWrite();
        auto labels = result["labels"].to<JsonArray>();
        collectLabels(lv_screen_active(), labels);
        collectLabels(lv_layer_top(), labels);
        auto versions = result["keyVersions"].to<JsonArray>();
        for (auto version : simulator.nfc().card(valid ? (command["card"] | 0) : 0).keyVersions) versions.add(version);
        const auto temporary = control / "result.tmp";
        { std::ofstream output(temporary); serializeJson(result, output); }
        std::filesystem::rename(temporary, control / (std::to_string(sequence) + ".result.json"));
        ++sequence;
        if (valid && command["action"] == "quit") return ok ? 0 : 1;
    }
    std::cerr << "fixture did not stop desktop simulator within five minutes\n";
    return 1;
}
