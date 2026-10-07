#include "render_harness.hpp"

template <typename CardScreen>
void testCard(Renderer &renderer, const std::string &name, const char *writing, const char *success)
{
    CardScreen card;
    card.setUserName(Fixtures::userName);
    if constexpr (std::is_same_v<CardScreen, EnrollmentScreen>) card.setEnrollmentTimeoutTime(Fixtures::nowMs + 30000);
    else card.setTimeoutTime(Fixtures::nowMs + 30000);
    card.init();
    ScreenGuard screen(card.getScreen(), &card);
    requireObject(screen.root, &lv_label_class, Fixtures::userName);
    auto *cancel = lv_obj_get_parent(requireObject(screen.root, &lv_label_class, "Abbrechen"));
    auto *bar = requireObject(screen.root, &lv_bar_class);
    bool canceled = false;
    card.setOnCancelCallback([&] { canceled = true; });
    lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
    expect(canceled, name + ": production cancel event callback");
    const std::array<typename CardScreen::Status, 4> states = {CardScreen::STATUS_WAITING, CardScreen::STATUS_WRITING,
        CardScreen::STATUS_SUCCESS, CardScreen::STATUS_ERROR};
    const char *suffix[] = {"waiting", "writing", "success", "error"};
    const char *text[] = {"Karte an den Leser halten", writing, success, Fixtures::errorMessage};
    const lv_color_t colors[] = {DisplayTheme::text(), DisplayTheme::warning(), DisplayTheme::success(), DisplayTheme::danger()};
    for (size_t i = 0; i < states.size(); ++i) {
        card.setStatus(states[i]);
        if (states[i] == CardScreen::STATUS_ERROR) card.setStatusMessage(Fixtures::errorMessage);
        auto *status = requireObject(screen.root, &lv_label_class, text[i]);
        expectColor(lv_obj_get_style_text_color(status, LV_PART_MAIN), colors[i], name + ": status color");
        expect(lv_obj_get_style_text_font(status, LV_PART_MAIN) == &attractap_font_montserrat_latin1_32,
               name + ": server-derived status uses a Latin-1 font");
        expect(lv_obj_has_flag(cancel, LV_OBJ_FLAG_HIDDEN) == (states[i] == CardScreen::STATUS_SUCCESS), name + ": cancel visibility");
        renderer.capture(name + "-" + suffix[i]);
        expect(lv_bar_get_value(bar) == 30, name + ": fixed 30-second countdown");
    }
    Fixtures::nowMs += 5000;
    card.loop();
    settle();
    expect(lv_bar_get_value(bar) == 25, name + ": countdown advances only with fixture clock");
    Fixtures::nowMs += 30000;
    card.loop();
    settle();
    expect(lv_bar_get_value(bar) == 0, name + ": expired countdown clamps to zero");
}

void testSupervision(Renderer &renderer)
{
    SupervisionScreen supervision;
    SupervisionScreen::View view{Fixtures::nowMs + 30000, Fixtures::userName, Fixtures::errorMessage, Fixtures::supervisorHint};
    supervision.render(view);
    supervision.init();
    ScreenGuard screen(supervision.getScreen(), &supervision);
    requireObject(screen.root, &lv_label_class, Fixtures::userName);
    auto *hint = requireObject(screen.root, &lv_label_class, Fixtures::supervisorHint);
    expect(lv_obj_get_style_text_font(hint, LV_PART_MAIN) == &attractap_font_montserrat_latin1_18,
           "Supervision hint uses a Latin-1 font");
    auto *cancel = lv_obj_get_parent(requireObject(screen.root, &lv_label_class, "Abbrechen"));
    const std::array<SupervisionScreen::Status, 4> states = {SupervisionScreen::STATUS_WAITING, SupervisionScreen::STATUS_VERIFYING,
        SupervisionScreen::STATUS_SUCCESS, SupervisionScreen::STATUS_ERROR};
    const char *suffix[] = {"waiting", "verifying", "success", "error"};
    const char *text[] = {"Aufsichts-Karte auflegen", "Karte gelesen...\nbitte nicht bewegen", "Freigegeben!", Fixtures::errorMessage};
    const lv_color_t colors[] = {DisplayTheme::text(), DisplayTheme::warning(), DisplayTheme::success(), DisplayTheme::danger()};
    for (size_t i = 0; i < states.size(); ++i) {
        view.status = states[i];
        supervision.render(view);
        auto *status = requireObject(screen.root, &lv_label_class, text[i]);
        expectColor(lv_obj_get_style_text_color(status, LV_PART_MAIN), colors[i], "Supervision status color");
        expect(lv_obj_get_style_text_font(status, LV_PART_MAIN) == &attractap_font_montserrat_latin1_28,
               "Supervision server-derived status uses a Latin-1 font");
        expect(lv_obj_has_flag(cancel, LV_OBJ_FLAG_HIDDEN) == (view.status == SupervisionScreen::STATUS_SUCCESS), "Supervision cancel visibility");
        renderer.capture(std::string("supervision-") + suffix[i]);
    }
    unsigned canceled = 0;
    supervision.setOnCancelCallback([&] { ++canceled; });
    supervision.armCancelGuard();
    lv_obj_send_event(cancel, LV_EVENT_PRESSED, nullptr);
    lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
    expect(canceled == 0, "Supervision rejects an early cancel press");
    Fixtures::nowMs += 1001;
    lv_obj_send_event(cancel, LV_EVENT_PRESSED, nullptr);
    lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
    expect(canceled == 1, "Supervision accepts a deliberate cancel press after guard");
}

void testPin(Renderer &renderer)
{
    PinInputPage pin;
    ScreenGuard screen(pin.init("Geräte-PIN"));
    auto *field = requireObject(screen.root, &lv_textarea_class);
    auto *keyboard = requireObject(screen.root, &lv_keyboard_class);
    auto *title = requireObject(screen.root, &lv_label_class, "Geräte-PIN");
    expect(lv_obj_get_style_text_font(title, LV_PART_MAIN) == &attractap_font_montserrat_latin1_32,
           "Device PIN title preserves its original 32px size");
    lv_font_glyph_dsc_t titleGlyph{};
    expect(lv_font_get_glyph_dsc(lv_obj_get_style_text_font(title, LV_PART_MAIN), &titleGlyph, 0xE4, 0)
               && !titleGlyph.is_placeholder,
           "Device PIN title renders its umlaut without a placeholder");
    expect(lv_keyboard_get_textarea(keyboard) == field, "Production PIN keyboard is bound to field");
    setState(field, LV_STATE_FOCUSED);
    renderer.capture("pin-empty");
    // Drive the real LVGL keyboard callback with its real key map.
    for (char digit : std::string(Fixtures::pin)) {
        uint32_t id = 0;
        while (const char *text = lv_buttonmatrix_get_button_text(keyboard, id)) {
            if (text[0] == digit && text[1] == '\0') break;
            ++id;
        }
        expect(lv_buttonmatrix_get_button_text(keyboard, id) != nullptr, "Numeric key exists");
        lv_buttonmatrix_set_selected_button(keyboard, id);
        lv_obj_send_event(keyboard, LV_EVENT_VALUE_CHANGED, nullptr);
    }
    expect(std::strcmp(lv_textarea_get_text(field), Fixtures::pin) == 0, "Real keyboard enters deterministic PIN");
    expectColor(lv_obj_get_style_text_color(title, LV_PART_MAIN), DisplayTheme::text(), "Valid PIN color");
    renderer.capture("pin-valid");
    lv_buttonmatrix_set_selected_button(keyboard, 0);
    lv_buttonmatrix_set_button_ctrl(keyboard, 1, LV_BUTTONMATRIX_CTRL_DISABLED);
    lv_buttonmatrix_set_button_ctrl(keyboard, 2, LV_BUTTONMATRIX_CTRL_CHECKED);
    setState(keyboard, LV_STATE_PRESSED);
    renderer.capture("pin-key-states");
    setState(keyboard, LV_STATE_DEFAULT);
    lv_buttonmatrix_clear_button_ctrl(keyboard, 1, LV_BUTTONMATRIX_CTRL_DISABLED);
    lv_buttonmatrix_clear_button_ctrl(keyboard, 2, LV_BUTTONMATRIX_CTRL_CHECKED);
    unsigned confirmed = 0;
    std::string confirmedPin;
    pin.setOnConfirmCallback([&](const std::string &value) {
        confirmedPin = value;
        ++confirmed;
        return false;
    });
    lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
    expect(confirmedPin == Fixtures::pin, "Production confirm callback receives PIN");
    expect(confirmed == 1 && std::strlen(lv_textarea_get_text(field)) == 0, "PIN confirm clears field");
    expectColor(lv_obj_get_style_text_color(title, LV_PART_MAIN), DisplayTheme::danger(), "Rejected PIN color");
    renderer.capture("pin-rejected");
    lv_textarea_set_text(field, "123");
    lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
    expect(confirmed == 1, "Short PIN cannot confirm");
    bool canceled = false;
    pin.setOnCancelCallback([&] { canceled = true; });
    lv_obj_send_event(keyboard, LV_EVENT_CANCEL, nullptr);
    expect(canceled && std::strlen(lv_textarea_get_text(field)) == 0, "PIN cancel callback clears field");
}

template void testCard<EnrollmentScreen>(Renderer &, const std::string &, const char *, const char *);
template void testCard<ResetScreen>(Renderer &, const std::string &, const char *, const char *);
