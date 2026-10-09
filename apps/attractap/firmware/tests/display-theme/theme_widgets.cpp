#include "demo/demo_localization.hpp"
#include "render_harness.hpp"

void testInputs(Renderer &renderer)
{
    std::array<lv_area_t, 4> keyAreas{};
    ScreenGuard screen(lv_obj_create(nullptr));
    auto *field = lv_textarea_create(screen.root);
    lv_textarea_set_one_line(field, true);
    lv_textarea_set_text(field, "Focused field");
    lv_obj_set_pos(field, 24, 24);
    lv_obj_set_size(field, 432, 52);
    expectColor(lv_obj_get_style_border_color(field, LV_PART_MAIN), DisplayTheme::fieldBorder(), "Automatic field border");
    expectColor(lv_obj_get_style_bg_color(field, LV_PART_SELECTED), DisplayTheme::primary(), "Automatic text selection");
    setState(field, LV_STATE_DISABLED);
    expectColor(lv_obj_get_style_bg_color(field, LV_PART_MAIN), DisplayTheme::surfaceSecondary(), "Disabled field background");
    expectColor(lv_obj_get_style_text_color(field, LV_PART_MAIN), DisplayTheme::muted(), "Disabled field text");
    setState(field, LV_STATE_DEFAULT);
    DisplayTheme::field(field);
    expectColor(lv_obj_get_style_text_color(field, LV_PART_TEXTAREA_PLACEHOLDER), DisplayTheme::muted(), "Placeholder color");
    expectColor(lv_obj_get_style_bg_color(field, LV_PART_CURSOR), DisplayTheme::primary(), "Cursor color");
    expectColor(lv_obj_get_style_bg_color(field, LV_PART_SELECTED), DisplayTheme::primarySoft(), "Helper selection background");
    expectColor(lv_obj_get_style_text_color(field, LV_PART_SELECTED), DisplayTheme::onPrimarySoft(), "Helper selection text");
    setState(field, LV_STATE_DISABLED);
    expectColor(lv_obj_get_style_bg_color(field, LV_PART_MAIN), DisplayTheme::surfaceSecondary(), "Disabled helper field background");
    expectColor(lv_obj_get_style_text_color(field, LV_PART_MAIN), DisplayTheme::muted(), "Disabled helper field text");
    setState(field, LV_STATE_FOCUSED);
    expectColor(lv_obj_get_style_border_color(field, LV_PART_MAIN), DisplayTheme::primary(), "Focused helper field border");

    auto *dropdown = lv_dropdown_create(screen.root);
    lv_dropdown_set_options(dropdown, "Option A\nOption B");
    lv_obj_set_pos(dropdown, 24, 94);
    lv_obj_set_width(dropdown, 432);
    setState(dropdown, LV_STATE_FOCUSED);
    expectColor(lv_obj_get_style_border_color(dropdown, LV_PART_MAIN), DisplayTheme::primary(), "Focused dropdown border");
    setState(dropdown, LV_STATE_DISABLED);
    expectColor(lv_obj_get_style_text_color(dropdown, LV_PART_MAIN), DisplayTheme::muted(), "Disabled dropdown text");
    setState(dropdown, LV_STATE_DEFAULT);

    auto *matrix = lv_buttonmatrix_create(screen.root);
    static const char *const map[] = {"Normal", "Press", "Check", "Disabled", ""};
    lv_buttonmatrix_set_map(matrix, map);
    lv_obj_set_pos(matrix, 24, 162);
    lv_obj_set_size(matrix, 432, 72);
    auto *keyboard = lv_keyboard_create(screen.root);
    lv_keyboard_set_mode(keyboard, LV_KEYBOARD_MODE_NUMBER);
    lv_keyboard_set_textarea(keyboard, field);
    lv_obj_set_size(keyboard, 480, 240);
    lv_obj_align(keyboard, LV_ALIGN_BOTTOM_MID, 0, 0);
    for (auto *obj : {matrix, keyboard}) {
        for (bool helper : {false, true}) {
            if (helper) DisplayTheme::keyboard(obj);
            setState(obj, LV_STATE_DEFAULT);
            expectColor(lv_obj_get_style_bg_color(obj, LV_PART_MAIN), DisplayTheme::surfaceSecondary(), "Keyboard background");
            expectColor(lv_obj_get_style_bg_color(obj, LV_PART_ITEMS), DisplayTheme::surface(), "Key background");
            expect(lv_obj_get_style_border_width(obj, LV_PART_ITEMS) == 1, "Key border");
            for (lv_state_t state : {LV_STATE_PRESSED, LV_STATE_CHECKED, LV_STATE_DISABLED}) {
                setState(obj, state);
                const auto bg = state == LV_STATE_PRESSED ? DisplayTheme::primaryPressed()
                    : state == LV_STATE_CHECKED ? DisplayTheme::primary() : DisplayTheme::surfaceSecondary();
                expectColor(lv_obj_get_style_bg_color(obj, LV_PART_ITEMS), bg, "Key state background");
                expectColor(lv_obj_get_style_text_color(obj, LV_PART_ITEMS),
                    state == LV_STATE_DISABLED ? DisplayTheme::muted() : DisplayTheme::onPrimary(), "Key state foreground");
            }
        }
        setState(obj, LV_STATE_DEFAULT);
    }
    // Real button-matrix per-key states, not a drawing made to look like a keyboard.
    lv_buttonmatrix_set_button_ctrl(matrix, 2, LV_BUTTONMATRIX_CTRL_CHECKED);
    lv_buttonmatrix_set_button_ctrl(matrix, 3, LV_BUTTONMATRIX_CTRL_DISABLED);
    lv_buttonmatrix_set_selected_button(matrix, 1);
    setState(matrix, LV_STATE_PRESSED);
    // Observe actual draw-task bounds so samples never depend on guessed key padding.
    lv_obj_add_flag(matrix, LV_OBJ_FLAG_SEND_DRAW_TASK_EVENTS);
    lv_obj_add_event_cb(matrix, [](lv_event_t *event) {
        auto *task = lv_event_get_draw_task(event);
        auto *fill = lv_draw_task_get_fill_dsc(task);
        auto &areas = *static_cast<std::array<lv_area_t, 4> *>(lv_event_get_user_data(event));
        if (fill && fill->base.part == LV_PART_ITEMS && fill->base.id1 < areas.size())
            lv_draw_task_get_area(task, &areas[fill->base.id1]);
    }, LV_EVENT_DRAW_TASK_ADDED, &keyAreas);
    renderer.capture("widgets-inputs");
    const lv_color_t keyColors[] = {DisplayTheme::surface(), DisplayTheme::primaryPressed(),
        DisplayTheme::primary(), DisplayTheme::surfaceSecondary()};
    for (int key = 0; key < 4; ++key) {
        const auto &area = keyAreas[key];
        expect(lv_area_get_width(&area) > 10 && lv_area_get_height(&area) > 20, "Real per-key fill task recorded");
        renderer.expectPixel((area.x1 + area.x2) / 2, area.y1 + 4,
                             keyColors[key], "Rendered matrix key " + std::to_string(key));
    }
}

void testDemoFixtureLocales(Renderer &renderer)
{
    auto *root = lv_obj_create(lv_screen_active());
    lv_obj_set_size(root, 400, 220);
    lv_obj_center(root);
    auto *resource = lv_label_create(root);
    lv_obj_align(resource, LV_ALIGN_TOP_MID, 0, 24);
    auto *project = lv_label_create(root);
    lv_obj_align(project, LV_ALIGN_TOP_MID, 0, 84);

    FirmwareI18n::setDynamicLabel(resource, DemoLocalization::resourceName(1, true));
    FirmwareI18n::setDynamicLabel(project, DemoLocalization::projectName(0, true));
    expect(std::string(lv_label_get_text(resource)) == "CNC Router" &&
               std::string(lv_label_get_text(project)) == "Oak Furniture",
           "English demo resource and project fixtures reach the display labels");
    renderer.capture("demo-english-fixtures");

    FirmwareI18n::setDynamicLabel(resource, DemoLocalization::resourceName(1, false));
    FirmwareI18n::setDynamicLabel(project, DemoLocalization::projectName(0, false));
    expect(std::string(lv_label_get_text(resource)) == "CNC Fraese" &&
               std::string(lv_label_get_text(project)) == "Möbelbau Eiche",
           "German demo resource and project fixtures reach the display labels");
    renderer.capture("demo-german-fixtures");
    lv_obj_delete(root);
}

void testDemoResourceListLocales(Renderer &renderer)
{
    ResourceListScreen list;
    API::ResourceList resources{};
    resources.count = 3;
    std::strcpy(resources.authenticatedUsername, "Demo User");
    for (int i = 0; i < 3; ++i) {
        resources.items[i].id = i + 1;
        resources.items[i].isHealthy = true;
        resources.items[i].accessKnown = true;
        resources.items[i].hasIntroduction = true;
        std::strcpy(resources.items[i].name, DemoLocalization::resourceName(i + 1, false));
    }
    list.setResourceList(resources);
    list.setAuthenticatedUser("Demo User");
    list.setSessionTimeoutTime(Fixtures::nowMs + 30000);
    list.init();
    ScreenGuard screen(list.getScreen(), &list);

    expect(requireObject(screen.root, &lv_label_class, "CNC Fraese") != nullptr,
           "Production demo resource list displays its German CNC fixture");
    expect(requireObject(screen.root, &lv_label_class, "3D Drucker") != nullptr,
           "Production demo resource list displays its German printer fixture");
    requireObject(screen.root, &lv_label_class, "Ressource links: Details · Aktion rechts");
    renderer.capture("demo-resource-list-german");

    for (int i = 0; i < 3; ++i)
        std::strcpy(resources.items[i].name, DemoLocalization::resourceName(i + 1, true));
    std::strcpy(resources.authenticatedUsername, "Demo User");
    list.setResourceList(resources);
    Fixtures::activeLanguage = "en";
    list.loop();
    expect(requireObject(screen.root, &lv_label_class, "CNC Router") != nullptr,
           "Production demo resource list displays its English CNC fixture");
    expect(requireObject(screen.root, &lv_label_class, "3D Printer") != nullptr,
           "Production demo resource list displays its English printer fixture");
    requireObject(screen.root, &lv_label_class, "Resource on the left: details · action on the right");
    renderer.capture("demo-resource-list-english");
}

void testCatalogLocales(Renderer &renderer)
{
    constexpr size_t labelsPerFrame = 12;
    auto *root = lv_obj_create(nullptr);
    lv_obj_set_size(root, Renderer::width, Renderer::height);
    ScreenGuard screen(root);
    for (const char *locale : {"de", "en"}) {
        for (size_t offset = 0; offset < std::size(FirmwareI18n::catalog); offset += labelsPerFrame) {
            lv_obj_clean(root);
            const size_t count = std::min(labelsPerFrame, std::size(FirmwareI18n::catalog) - offset);
            for (size_t i = 0; i < count; ++i) {
                const auto &entry = FirmwareI18n::catalog[offset + i];
                auto *item = lv_label_create(root);
                lv_obj_set_width(item, 220);
                lv_obj_set_height(item, 34);
                lv_obj_set_pos(item, (i % 2) * 230, (i / 2) * 72);
                lv_label_set_long_mode(item, LV_LABEL_LONG_MODE_WRAP);
                const char *rendered = std::strcmp(locale, "en") == 0 ? entry.en : entry.de;
                const char *translated = FirmwareI18n::messageText(entry.id, "en");
                expect(std::strcmp(translated, entry.en) == 0,
                       std::string("English catalog entry translates: ") + entry.de);
                if (std::strcmp(locale, "de") == 0) {
                    const char *reverse = FirmwareI18n::messageText(entry.id, "de");
                    const bool validReverse = std::any_of(std::begin(FirmwareI18n::catalog),
                        std::end(FirmwareI18n::catalog), [&](const auto &candidate) {
                            return std::strcmp(candidate.en, entry.en) == 0 && std::strcmp(candidate.de, reverse) == 0;
                        });
                    expect(validReverse, std::string("German catalog reverse mapping is valid: ") + entry.en);
                }
                lv_label_set_text(item, rendered);
            }
            renderer.capture(std::string("catalog-") + locale + "-" + std::to_string(offset / labelsPerFrame));
        }
    }
}

void testLogos(Renderer &renderer)
{
    ScreenGuard screen(lv_obj_create(nullptr));
    const std::array<const lv_image_dsc_t *, 2> images = {&logo_400w_png, &logo_40h};
    const std::array<const uint8_t *, 2> ends = {largeLogoEnd, smallLogoEnd};
    std::array<lv_obj_t *, 2> objects{};
    for (size_t i = 0; i < images.size(); ++i) {
        expect(reinterpret_cast<uintptr_t>(images[i]->data) % 4 == 0,
               "Embedded RGB565 logo data is word-aligned");
        expect(reinterpret_cast<uintptr_t>(ends[i]) - reinterpret_cast<uintptr_t>(images[i]->data) == images[i]->data_size,
               "Embedded logo byte count matches production descriptor");
        objects[i] = lv_image_create(screen.root);
        lv_image_set_src(objects[i], images[i]);
        lv_obj_align(objects[i], LV_ALIGN_TOP_MID, 0, i == 0 ? 60 : 260);
        expect(images[i]->header.cf == LV_COLOR_FORMAT_RGB565A8, "Production RGB565A8 logo descriptor");
        expect(lv_obj_get_style_image_recolor_opa(objects[i], LV_PART_MAIN) == LV_OPA_TRANSP, "Theme does not recolor logo");
    }
    renderer.capture("production-logos");
    for (size_t i = 0; i < images.size(); ++i) {
        const auto &image = *images[i];
        lv_area_t area;
        lv_obj_get_coords(objects[i], &area);
        expect(area.x1 >= 0 && area.y1 >= 0 && area.x2 < Renderer::width && area.y2 < Renderer::height,
               "Unscaled logo fits framebuffer");
        const uint32_t size = image.header.w * image.header.h;
        unsigned opaque = 0, transparent = 0;
        for (unsigned p = 0; p < size; ++p) {
            const auto alpha = image.data[size * 2 + p];
            const auto rendered = renderer.pixels[(area.y1 + p / image.header.w) * Renderer::width + area.x1 + p % image.header.w];
            if (alpha == 255) {
                uint16_t expected;
                std::memcpy(&expected, image.data + p * 2, sizeof(expected));
                expect(rendered == expected, "Opaque logo pixel preserved by actual renderer");
                ++opaque;
            } else if (alpha == 0) {
                expect(rendered == lv_color_to_u16(DisplayTheme::background()), "Transparent logo pixel composites on dark background");
                ++transparent;
            }
        }
        expect(opaque > 100 && transparent > 100, "Logo has rendered color and transparency");
    }
}
