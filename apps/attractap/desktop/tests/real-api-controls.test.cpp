// Keep this test bound to the actual JSON-command implementation.
#define main original_probe_main
#include "real_api.cpp"
#undef main
#include <cassert>

namespace
{
int clicks = 0;
int changes = 0;

void countEvent(lv_event_t *event)
{
    if (lv_event_get_code(event) == LV_EVENT_CLICKED) ++clicks;
    if (lv_event_get_code(event) == LV_EVENT_VALUE_CHANGED) ++changes;
}

void label(lv_obj_t *parent, const char *text)
{
    lv_label_set_text(lv_label_create(parent), text);
}
}

int main()
{
    const auto profile = std::filesystem::temp_directory_path() /
        ("attractap-controls-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    struct Cleanup
    {
        std::filesystem::path path;
        ~Cleanup() { std::filesystem::remove_all(path); }
    } cleanup{profile};
    DesktopSimulator simulator("http://127.0.0.1:9", 0, profile);
    auto *screen = lv_obj_create(nullptr);
    lv_screen_load(screen);
    auto *button = lv_button_create(screen);
    label(button, "Probe control");
    lv_obj_add_event_cb(button, countEvent, LV_EVENT_ALL, nullptr);
    JsonDocument command;
    command["action"] = "click";
    command["text"] = "Probe control";
    assert(execute(command, simulator, profile));
    assert(clicks == 1);

    auto *normal = lv_button_create(screen);
    lv_obj_add_flag(normal, LV_OBJ_FLAG_CHECKABLE);
    lv_obj_add_event_cb(normal, countEvent, LV_EVENT_ALL, nullptr);
    clicks = changes = 0;
    lv_obj_send_event(normal, LV_EVENT_PRESSED, nullptr);
    lv_obj_send_event(normal, LV_EVENT_RELEASED, nullptr);
    lv_obj_send_event(normal, LV_EVENT_CLICKED, nullptr);
    assert(clicks == 1 && changes == 1 && lv_obj_has_state(normal, LV_STATE_CHECKED));

    lv_obj_add_flag(button, LV_OBJ_FLAG_CHECKABLE);
    clicks = changes = 0;
    assert(execute(command, simulator, profile));
    assert(clicks == 1 && changes == 1 && lv_obj_has_state(button, LV_STATE_CHECKED));
    std::cout << "PASS probe selection matches normal LVGL: one click, one change, checked\n";
    clicks = changes = 0;
    assert(execute(command, simulator, profile));
    assert(clicks == 1 && changes == 1 && !lv_obj_has_state(button, LV_STATE_CHECKED));
    std::cout << "PASS second click deselects once\n";

    auto *duplicate = lv_button_create(screen);
    label(duplicate, "Probe control");
    assert(findText("Probe control") == nullptr);
    auto *hidden = lv_obj_create(screen);
    label(hidden, "Hidden control");
    lv_obj_add_flag(hidden, LV_OBJ_FLAG_HIDDEN);
    assert(findText("Hidden control") == nullptr);
    auto *disabled = lv_obj_create(screen);
    label(lv_button_create(disabled), "Disabled control");
    lv_obj_add_state(disabled, LV_STATE_DISABLED);
    assert(findText("Disabled control") == nullptr);
    std::cout << "PASS duplicate, hidden and disabled targets rejected\n";

    command["action"] = "snapshot";
    command["text"] = "capture";
    const auto capture = profile / "capture.png";
    const auto refused = [&] {
        std::filesystem::remove(capture);
        assert(!execute(command, simulator, profile));
        assert(!std::filesystem::exists(capture));
    };
    const auto accepted = [&] {
        assert(execute(command, simulator, profile));
        assert(std::filesystem::file_size(capture) > 0);
    };
    accepted();
    auto *content = lv_obj_create(screen);
    for (int i = 0; i < 70; ++i) label(content, "Safe label");
    auto *secret = lv_label_create(content);
    lv_label_set_text(secret, "password: hidden-secret");
    // Direct capture must inspect the full tree/text, including disabled widgets.
    lv_obj_add_state(content, LV_STATE_DISABLED);
    refused();
    lv_obj_add_flag(content, LV_OBJ_FLAG_HIDDEN);
    accepted();
    lv_obj_delete(content);
    secret = lv_label_create(screen);
    std::string longText;
    for (int i = 0; i < 40; ++i) longText += "Safe text ";
    lv_label_set_text(secret, (longText + "password: hidden-secret").c_str());
    refused();
    lv_obj_delete(secret);
    secret = lv_label_create(lv_layer_top());
    lv_label_set_text(secret, "Authorization: bearer-secret");
    refused();
    lv_obj_delete(secret);
    auto *input = lv_textarea_create(screen);
    lv_textarea_set_password_mode(input, true);
    lv_textarea_set_text(input, "masked-secret");
    refused();
    lv_obj_delete(input);
    secret = lv_label_create(screen);
    lv_label_set_text(secret, Settings::getDeviceConfig().passCode.c_str());
    refused();
    lv_obj_delete(secret);
    Display::setPinScreen.init();
    lv_screen_load(Display::setPinScreen.getScreen());
    refused();
    assert(screenName() == "set-pin");
    Display::connectionConfigurationScreen.init();
    lv_screen_load(Display::connectionConfigurationScreen.getScreen());
    refused();
    assert(screenName() == "settings");
    lv_screen_load(screen);
    accepted();
    std::cout << "PASS direct captures reject sensitive screens and untruncated visible content\n";

}
