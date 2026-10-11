#include "api/demo/websocket.hpp"
#include "profile_store.hpp"
#include "state/state.hpp"

#include <cassert>
#include <filesystem>
#include <string>
#include <unistd.h>

int main()
{
    const auto root = std::filesystem::temp_directory_path() /
                      ("attractap-demo-protocol-" + std::to_string(getpid()));
    ProfileStore profile("https://demo-protocol.test", 1, root);
    KVStore::setHostProfile(&profile);
    DemoStore::setup();
    State::setUserLanguage(false);
    State::setDefaultLanguage("de");
    DemoWebsocket transport;
    JsonDocument received;
    transport.setMessageCallbackRaw([&](const char *message, size_t length) {
        assert(deserializeJson(received, message, length) == DeserializationError::Ok);
    });
    transport.loop(); // Consume the initial authentication request before form traffic.
    auto exchange = [&](const char *message) {
        transport.sendMessage(std::string(message));
        transport.loop();
    };
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
    exchange(submit);
    assert(received["data"]["payload"]["valid"] == true);
    exchange(getFields);
    assert(received["data"]["payload"]["fields"][0]["value"] == "Holz");

    KVStore::setHostProfile(nullptr);
    std::filesystem::remove_all(root);
}
