#include "api/demo/websocket.hpp"
#include "display/fixtures.hpp"
#include "profile_store.hpp"
#include "state/state.hpp"
#include "display/demoFormOptions.hpp"

#include <cassert>
#include <filesystem>
#include <string>
#include <unistd.h>

int main(int argc, char **argv)
{
    const std::filesystem::path screenshots = argc > 1 ? argv[1] : "";
    if (!screenshots.empty()) std::filesystem::create_directories(screenshots);
    const auto root = std::filesystem::temp_directory_path() /
                      ("attractap-demo-protocol-" + std::to_string(getpid()));
    ProfileStore profile("https://demo-protocol.test", 1, root);
    KVStore::setHostProfile(&profile);
    DemoStore::setup();
    State::setUserLanguage(false);
    State::setDefaultLanguage("de");
    Display::setDemoDeviceName();
    SdlDisplay display;
    Display::setup(display);
    assert(findLabel(lv_layer_top(), "Demo Gerät"));
    int windowCount = 0;
    SDL_Window **windows = SDL_GetWindows(&windowCount);
    assert(windows && windowCount == 1);
    window = windows[0];
    SDL_free(windows);
    renderer = SDL_GetRenderer(window);
    DemoWebsocket transport;
    JsonDocument received;
    JsonDocument authenticated;
    JsonDocument resourceList;
    transport.setMessageCallbackRaw([&](const char *message, size_t length) {
        assert(deserializeJson(received, message, length) == DeserializationError::Ok);
        if (received["data"]["type"] == "RESOURCE_LIST") resourceList.set(received);
        if (received["data"]["type"] == "READER_AUTHENTICATED") {
            authenticated.set(received);
            State::setDefaultLanguage(received["data"]["payload"]["language"].as<std::string>());
            Display::setDemoDeviceName();
        }
    });
    transport.loop(); // Consume the initial authentication request before form traffic.
    auto exchange = [&](const char *message) {
        transport.sendMessage(std::string(message));
        transport.loop();
    };
    exchange(R"({"data":{"type":"READER_AUTHENTICATE","payload":{}}})");
    assert(received["data"]["payload"]["readerName"] == "Demo Device");
    assert(received["data"]["payload"]["resources"][0]["name"] == "CNC Router");
    assert(authenticated["data"]["payload"]["language"] == "en");
    assert(authenticated["data"]["payload"]["name"] == "Demo Device");
    Display::loop(); lv_timer_handler();
    assert(findLabel(lv_layer_top(), "Demo Device"));
    // Refresh the existing overlay without a new response or name setter.
    State::setDefaultLanguage("de");
    Display::loop(); lv_timer_handler();
    assert(findLabel(lv_layer_top(), "Demo Gerät"));
    lv_obj_update_layout(lv_layer_top());
    lv_refr_now(nullptr);
    screenshot(screenshots, "demo-name-de.png");
    State::setDefaultLanguage("en");
    Display::loop(); lv_timer_handler();
    assert(findLabel(lv_layer_top(), "Demo Device"));
    lv_refr_now(nullptr);
    screenshot(screenshots, "demo-name-en.png");
    State::setUserLanguage(true, "de");
    Display::loop(); lv_timer_handler();
    assert(findLabel(lv_layer_top(), "Demo Gerät"));
    State::setUserLanguage(false);
    Display::loop(); lv_timer_handler();
    assert(findLabel(lv_layer_top(), "Demo Device"));
    for (const char *language : {"de", "en"}) {
        State::setDefaultLanguage(language);
        exchange(R"({"data":{"type":"REQUEST_RESOURCE_LIST","payload":{}}})");
        const char *expectedName = std::string(language) == "en" ? "Demo Device" : "Demo Gerät";
        assert(received["data"]["payload"]["readerName"] == expectedName);
        Display::setDemoDeviceName();
        Display::loop(); lv_timer_handler();
        assert(findLabel(lv_layer_top(), expectedName));
    }
    State::setDefaultLanguage("de");
    constexpr const char *getFields = R"({"data":{"type":"RESOURCE_USAGE_FORM_GET_FIELDS","payload":{"resourceId":1,"action":"start","formId":10,"offset":0}}})";
    constexpr const char *submit = R"({"data":{"type":"RESOURCE_USAGE_FORM_SUBMIT_PAGE","payload":{"resourceId":1,"action":"start","formId":10,"offset":0,"answers":[{"fieldId":101,"value":"Holz"}]}}})";

    exchange(getFields);
    assert(received["data"]["type"] == "RESOURCE_USAGE_FORM_FIELDS");
    auto field = received["data"]["payload"]["fields"][0];
    std::string initialOptions;
    serializeJson(field["options"], initialOptions);
    assert(field["options"][1] == "Holz");
    exchange(submit);
    assert(received["data"]["payload"]["valid"] == true);

    // Re-fetching an edited form after a locale change must retain a valid,
    // identical wire value, even though authored field captions translate.
    State::setDefaultLanguage("en");
    exchange(getFields);
    auto refreshedField = received["data"]["payload"]["fields"][0];
    std::string refreshedOptions;
    serializeJson(refreshedField["options"], refreshedOptions);
    assert(refreshedOptions == initialOptions);
    assert(refreshedField["value"] == "Holz");
    assert(refreshedField["description"] == "Workpiece material");
    const char *captions[] = {"Aluminium", "Wood", "Plastic", "Brass", "Steel"};
    assert(refreshedField["options"].size() == 5);
    for (uint8_t i = 0; i < 5; ++i) {
        const auto caption = FirmwareI18n::demoMaterialCaption(
            received["data"]["payload"]["resourceId"].as<uint32_t>(),
            received["data"]["payload"]["formId"].as<uint32_t>(),
            refreshedField["id"].as<uint32_t>(), refreshedField["options"][i].as<std::string>());
        assert(caption && FirmwareI18n::Text(*caption).render("en") == captions[i]);
    }
    exchange(submit);
    assert(received["data"]["payload"]["valid"] == true);
    exchange(getFields);
    assert(received["data"]["payload"]["fields"][0]["value"] == "Holz");

    // The first card response is queued while the previous default is still active.
    State::setDefaultLanguage("de");
    assert(DemoStore::addCard("11223344", DemoStore::UserRole::INTRODUCED, "Literal Müller"));
    exchange(R"({"data":{"type":"CARD_DETECTED","payload":{"purpose":"tap","uid":"11223344","resourceId":1}}})");
    assert(received["data"]["payload"]["language"] == "en");
    assert(resourceList["data"]["payload"]["readerName"] == "Demo Device");
    assert(resourceList["data"]["payload"]["resources"][0]["name"] == "CNC Router");
    assert(resourceList["data"]["payload"]["authenticatedUsername"] == "Literal Müller");
    Display::setDeviceName("Operator Gerät");
    State::setDefaultLanguage("de"); Display::loop(); lv_timer_handler();
    State::setDefaultLanguage("en"); Display::loop(); lv_timer_handler();
    assert(findLabel(lv_layer_top(), "Operator Gerät"));
    // Even identical operator-supplied words must never imply demo ownership.
    for (const char *name : {"Demo Device", "Demo Gerät"}) {
        Display::setDeviceName(name);
        for (const char *language : {"de", "en"}) {
            State::setDefaultLanguage(language); Display::loop(); lv_timer_handler();
            assert(findLabel(lv_layer_top(), name));
        }
    }
    KVStore::setHostProfile(nullptr);
    std::filesystem::remove_all(root);
}
