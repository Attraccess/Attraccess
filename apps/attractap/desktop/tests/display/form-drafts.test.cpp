#include "fixtures.hpp"

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
