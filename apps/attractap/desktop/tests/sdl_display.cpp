#include "sdl_display.hpp"
#include "display/display.hpp"

#include <cassert>
#include <cmath>
#include <cstring>
#include <filesystem>
#include <utility>
#include <vector>

namespace
{
SDL_Window *window = nullptr;
SDL_Renderer *renderer = nullptr;

void pointer(SdlDisplay &display, SDL_EventType type, float x, float y, Uint8 button = SDL_BUTTON_LEFT)
{
    float windowX, windowY;
    assert(SDL_RenderCoordinatesToWindow(renderer, x, y, &windowX, &windowY));
    SDL_Event event{};
    event.type = type;
    if (type == SDL_EVENT_MOUSE_MOTION)
    {
        event.motion.windowID = SDL_GetWindowID(window);
        event.motion.x = windowX;
        event.motion.y = windowY;
    }
    else
    {
        event.button.windowID = SDL_GetWindowID(window);
        event.button.button = button;
        event.button.x = windowX;
        event.button.y = windowY;
    }
    assert(SDL_PushEvent(&event));
    assert(display.pollEvents());
}

void click(SdlDisplay &display, float x, float y)
{
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, x, y);
    pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, x, y);
}

bool signal(SdlDisplay &display, SDL_EventType type)
{
    SDL_Event event{};
    event.type = type;
    if (type == SDL_EVENT_KEY_DOWN)
        event.key.key = SDLK_ESCAPE;
    else
        event.window.windowID = SDL_GetWindowID(window);
    assert(SDL_PushEvent(&event));
    return display.pollEvents();
}

void screenshot(const std::filesystem::path &directory, const char *name)
{
    if (directory.empty()) return;
    // CTest uses SDL's software renderer, whose presented frame remains readable.
    SDL_Surface *frame = SDL_RenderReadPixels(renderer, nullptr);
    assert(frame);
    assert(SDL_SavePNG(frame, (directory / name).c_str()));
    SDL_DestroySurface(frame);
}

lv_obj_t *findLabel(lv_obj_t *root, const char *text)
{
    if (lv_obj_check_type(root, &lv_label_class) && std::strcmp(lv_label_get_text(root), text) == 0)
        return root;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (auto *label = findLabel(lv_obj_get_child(root, i), text)) return label;
    return nullptr;
}

void expectUmlaut(lv_obj_t *label)
{
    assert(label);
    lv_font_glyph_dsc_t glyph{};
    assert(lv_font_get_glyph_dsc(lv_obj_get_style_text_font(label, LV_PART_MAIN), &glyph, 0xFC, 'n'));
    assert(!glyph.is_placeholder);
    assert(glyph.box_w > 0 && glyph.box_h > 0);
}

lv_obj_t *findWidget(lv_obj_t *root, const lv_obj_class_t *type)
{
    if (lv_obj_check_type(root, type)) return root;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (auto *widget = findWidget(lv_obj_get_child(root, i), type)) return widget;
    return nullptr;
}

void expectReadableOption(lv_obj_t *label)
{
    const auto luminance = [](lv_color_t color) {
        const auto linear = [](uint8_t channel) {
            const double value = channel / 255.0;
            return value <= 0.04045 ? value / 12.92 : std::pow((value + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * linear(color.red) + 0.7152 * linear(color.green) + 0.0722 * linear(color.blue);
    };
    const double foreground = luminance(lv_obj_get_style_text_color(label, LV_PART_MAIN));
    const double background = luminance(lv_obj_get_style_bg_color(lv_obj_get_parent(label), LV_PART_MAIN));
    const double ratio = foreground > background ? (foreground + 0.05) / (background + 0.05)
                                               : (background + 0.05) / (foreground + 0.05);
    assert(ratio >= 4.5);
}

void testFormDrafts()
{
    auto &screen = Display::resourceDetailsScreen;
    Display::transitionToScreen(&screen);
    Display::loop();
    API::ResourceUsageFormRequest request{};
    request.resourceId = 1;
    request.formCount = 1;
    request.forms[0].id = 1;
    request.forms[0].name = "Draft";
    request.forms[0].fieldCount = 1;
    API::ResourceUsageFormFieldsPage page{};
    page.resourceId = 1;
    page.formId = 1;
    page.fieldCount = 1;
    page.totalFieldCount = 1;
    auto &field = page.fields[0];
    field.id = 1;
    field.name = "Note";
    field.type = API::ResourceUsageFormFieldType::TEXT;
    field.hasValue = true;
    field.options.text.multiline = true;
    field.value = "Size™\n“München” — Größe";
    constexpr char displayValue[] = "SizeTM\n\"München\" - Größe";
    std::string submitted;
    screen.setFormPageNextCallback([&](const API::FormPageSubmission &submission) {
        assert(submission.answerCount == 1);
        submitted = submission.answers[0].stringValue;
    });
    for (const bool edit : {false, true}) {
        screen.showFormsModal(request);
        screen.renderFormField(page, false, true, 1, 1);
        auto *preview = findLabel(lv_layer_top(), displayValue);
        assert(preview);
        lv_obj_send_event(lv_obj_get_parent(preview), LV_EVENT_CLICKED, nullptr);
        auto *textarea = findWidget(lv_layer_top(), &lv_textarea_class);
        auto *keyboard = findWidget(lv_layer_top(), &lv_keyboard_class);
        assert(textarea && keyboard);
        assert(std::strcmp(lv_textarea_get_text(textarea), displayValue) == 0);
        if (edit) lv_textarea_set_text(textarea, "Geändert\nGröße");
        lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
        auto *submit = findLabel(lv_layer_top(), "Absenden");
        assert(submit);
        lv_obj_send_event(lv_obj_get_parent(submit), LV_EVENT_CLICKED, nullptr);
        assert(submitted == (edit ? "Geändert\nGröße" : field.value));
    }
    field = API::ResourceUsageFormField{};
    field.id = 1;
    field.name = "Size";
    field.type = API::ResourceUsageFormFieldType::SELECT;
    field.options.select.count = 2;
    field.options.select.values[0] = "Size™";
    field.options.select.values[1] = "Größe";
    screen.showFormsModal(request);
    screen.renderFormField(page, false, true, 1, 1);
    auto *option = findLabel(lv_layer_top(), "SizeTM");
    auto *otherOption = findLabel(lv_layer_top(), "Größe");
    assert(option && otherOption);
    expectReadableOption(option);
    const auto unselectedBackground = lv_obj_get_style_bg_color(lv_obj_get_parent(option), LV_PART_MAIN);
    for (auto *selected : {option, otherOption, option}) {
        lv_obj_send_event(lv_obj_get_parent(selected), LV_EVENT_CLICKED, nullptr);
        assert(!lv_color_eq(lv_obj_get_style_bg_color(lv_obj_get_parent(selected), LV_PART_MAIN), unselectedBackground));
        expectReadableOption(option);
        expectReadableOption(otherOption);
    }
    auto *submit = findLabel(lv_layer_top(), "Absenden");
    assert(submit);
    lv_obj_send_event(lv_obj_get_parent(submit), LV_EVENT_CLICKED, nullptr);
    assert(submitted == "Size™");
    screen.hideFormsModal();
    screen.setFormPageNextCallback({});
    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
}

void testPaymentPopup()
{
    uint32_t amount = 0;
    Display::showInsufficientBalancePopup([&](uint32_t cents) { amount = cents; }, {});
    auto *input = findWidget(lv_layer_top(), &lv_textarea_class);
    auto *start = findLabel(lv_layer_top(), "Aufladen");
    assert(input && start);
    lv_textarea_set_text(input, "5");
    lv_obj_send_event(lv_obj_get_parent(start), LV_EVENT_CLICKED, nullptr);
    assert(amount == 500);
    auto *message = findLabel(lv_layer_top(), "Bitte am Zahlungsterminal fortfahren ...");
    assert(message);
    lv_font_glyph_dsc_t glyph{};
    assert(lv_font_get_glyph_dsc(lv_obj_get_style_text_font(message, LV_PART_MAIN), &glyph, '.', '.'));
    assert(!glyph.is_placeholder && glyph.box_w > 0 && glyph.box_h > 0);
    Display::hidePopup();
}

void testLockscreen(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    // Exercise selection -> lockscreen with the simulator's production theme,
    // router and SDL renderer, rather than just inspecting a font asset.
    constexpr char resourceName[] = "Jappys Dingalüng";
    API::ResourceList resources{};
    resources.count = 1;
    resources.items[0].id = 1;
    std::strcpy(resources.items[0].name, resourceName);
    Display::resourceListScreen.setResourceList(resources);
    Display::resourceListScreen.setResourceSelectionCallback([](const API::ResourceBrief &resource) {
        Display::lockscreen.setResourceName(resource.name);
        Display::lockscreen.setUsageInfo(false, "", false);
        Display::transitionToScreen(&Display::lockscreen);
    });
    Display::transitionToScreen(&Display::resourceListScreen);
    lv_refr_now(nullptr);
    auto *selectionLabel = findLabel(lv_screen_active(), resourceName);
    expectUmlaut(selectionLabel);
    lv_obj_send_event(lv_obj_get_parent(selectionLabel), LV_EVENT_CLICKED, nullptr);
    Display::loop();
    lv_refr_now(nullptr);
    assert(lv_screen_active() == Display::lockscreen.getScreen());
    expectUmlaut(findLabel(lv_screen_active(), resourceName));
    expectUmlaut(findLabel(lv_screen_active(), "Verfügbar"));
    assert(display.pollEvents());
    screenshot(screenshots, "lockscreen-umlaut.png");
    Display::resourceListScreen.setResourceSelectionCallback({});
    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
    lv_refr_now(nullptr);
}
}

int main(int argc, char **argv)
{
    const std::filesystem::path screenshots = argc > 1 ? argv[1] : "";
    std::vector<std::pair<size_t, bool>> presence;
    std::vector<size_t> cleared;
    SdlDisplay display;
    display.setCardPresenceCallback([&](size_t card, bool present) { presence.emplace_back(card, present); });
    display.setClearCardCallback([&](size_t card) { cleared.push_back(card); });
    Display::setup(display);
    Display::transitionToScreen(&Display::initScreen);
    lv_refr_now(nullptr);

    int windowCount = 0;
    SDL_Window **windows = SDL_GetWindows(&windowCount);
    assert(windowCount == 1);
    window = windows[0];
    SDL_free(windows);
    renderer = SDL_GetRenderer(window);
    assert(renderer);
    // Native window changes are asynchronous; wait before injecting coordinates.
    assert(SDL_SetWindowSize(window, 500, 901));
    assert(SDL_SyncWindow(window));
    assert(display.pollEvents());
    screenshot(screenshots, "device.png");
    testLockscreen(display, screenshots);
    testFormDrafts();
    testPaymentPopup();

    TouchPoint touch{};
    // The firmware still sees a 480 x 480 screen, offset inside the CAD face.
    assert(display.width() == 480 && display.height() == 480);
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, 250, 310);
    assert(display.readTouch(touch));
    assert(std::abs(touch.x - 240) <= 1 && std::abs(touch.y - 240) <= 1);
    pointer(display, SDL_EVENT_MOUSE_MOTION, 489, 310);
    assert(display.readTouch(touch) && std::abs(touch.x - 479) <= 1);
    pointer(display, SDL_EVENT_MOUSE_MOTION, 495, 310);
    assert(!display.readTouch(touch));
    pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 495, 310);

    for (const SDL_FPoint point : {SDL_FPoint{250, 40}, {5, 310}, {250, 560}, {11, 71}})
    {
        pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, point.x, point.y);
        assert(!display.readTouch(touch));
        pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, point.x, point.y);
    }
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, 250, 310, SDL_BUTTON_RIGHT);
    assert(!display.readTouch(touch));
    pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 250, 310, SDL_BUTTON_RIGHT);

    // Hidden cards cannot be presented. Only the physical NFC target opens the menu.
    click(display, 80, 680);
    assert(presence.empty());
    click(display, 250, 730);
    assert(presence.empty());
    assert(!display.readTouch(touch));
    screenshot(screenshots, "card-menu.png");

    for (size_t card = 0; card < SdlDisplay::CardCount; ++card)
    {
        const float x = card % 2 == 0 ? 140 : 360;
        const float y = card < 2 ? 686 : 778;
        pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, x, y);
        assert(presence.size() == card * 2 + 1);
        assert(presence.back() == std::make_pair(card, true));
        assert(!display.readTouch(touch));
        // Moving off a card while still holding does not end presentation or switch cards.
        pointer(display, SDL_EVENT_MOUSE_MOTION, 250, 570);
        SDL_Delay(30);
        assert(display.pollEvents());
        assert(presence.size() == card * 2 + 1);
        if (card == 0) screenshot(screenshots, "card-presented.png");
        pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 250, 570, SDL_BUTTON_RIGHT);
        assert(presence.size() == card * 2 + 1);
        pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 250, 570);
        assert(presence.back() == std::make_pair(card, false));
        assert(presence.size() == (card + 1) * 2);
    }

    // Clearing still requires two clicks and targets the last selected card.
    click(display, 250, 848);
    assert(cleared.empty());
    click(display, 250, 848);
    assert(cleared == std::vector<size_t>{3});
    click(display, 250, 848);
    click(display, 450, 604); // Close, then reopen: discard an armed confirmation.
    click(display, 250, 730);
    click(display, 250, 848);
    assert(cleared.size() == 1);
    click(display, 140, 686); // Selecting another card also discards confirmation.
    click(display, 250, 848);
    assert(cleared.size() == 1);
    click(display, 250, 848);
    assert(cleared == (std::vector<size_t>{3, 0}));

    // Cancel paths cannot leave a card present, even without a mouse-up event.
    for (const SDL_EventType type : {SDL_EVENT_WINDOW_MOUSE_LEAVE, SDL_EVENT_WINDOW_FOCUS_LOST,
                                    SDL_EVENT_WINDOW_HIDDEN, SDL_EVENT_KEY_DOWN})
    {
        pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, 140, 686);
        assert(presence.back() == std::make_pair(size_t{0}, true));
        const size_t before = presence.size();
        assert(signal(display, type));
        assert(presence.size() == before + 1);
        assert(presence.back() == std::make_pair(size_t{0}, false));
        pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 140, 686);
        assert(presence.size() == before + 1);
        if (type == SDL_EVENT_WINDOW_MOUSE_LEAVE)
            click(display, 450, 604);
        click(display, 250, 730);
    }

    // Clicking the screen dismisses the menu and still reaches the firmware.
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, 250, 310);
    assert(display.readTouch(touch));
    pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 250, 310);
    const size_t beforeHiddenClick = presence.size();
    click(display, 140, 686);
    assert(presence.size() == beforeHiddenClick);

    // Non-proportional resizing introduces letterboxing; both hit areas track it.
    assert(SDL_SetWindowSize(window, 700, 650));
    assert(SDL_SyncWindow(window));
    assert(display.pollEvents());
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, 250, 310);
    assert(display.readTouch(touch));
    assert(std::abs(touch.x - 240) <= 1 && std::abs(touch.y - 240) <= 1);
    pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 250, 310);
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, -50, 310);
    assert(!display.readTouch(touch));
    pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, -50, 310);
    screenshot(screenshots, "device-resized.png");
    click(display, 250, 730);
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, 360, 778);
    assert(presence.back() == std::make_pair(size_t{3}, true));
    assert(!signal(display, SDL_EVENT_QUIT));
    assert(presence.back() == std::make_pair(size_t{3}, false));
}
