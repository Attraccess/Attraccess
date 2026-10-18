#include "render_harness.hpp"

void expectBackground(Renderer &renderer, lv_obj_t *screen, const char *fixture)
{
    expect(lv_obj_get_style_bg_image_src(screen, LV_PART_MAIN) == &lockscreen_background_image,
           "Production screen retains original background descriptor");
    expect(lv_obj_get_style_bg_image_recolor_opa(screen, LV_PART_MAIN) == LV_OPA_TRANSP,
           "Background artwork is not recolored");
    renderer.capture(fixture);
    // Bottom strip is unobscured on all three production layouts.
    for (int x = 0; x < Renderer::width; ++x) {
        uint16_t original;
        std::memcpy(&original, lockscreen_map + (470 * Renderer::width + x) * 2, sizeof(original));
        expect(renderer.pixels[470 * Renderer::width + x] == original, "Original background pixels rendered unchanged");
    }
}

void testBackgroundScreens(Renderer &renderer)
{
    expect(reinterpret_cast<uintptr_t>(lockscreen_map) % 4 == 0, "Background data aligned");
    expect(static_cast<size_t>(backgroundEnd - lockscreen_map) == 480 * 480 * 2, "Background byte count");
    for (const uint32_t glyph : {0x00C4, 0x00D6, 0x00DC, 0x00DF, 0x00E4, 0x00F6, 0x00FC})
    {
        lv_font_glyph_dsc_t descriptor{};
        expect(lv_font_get_glyph_dsc(&attractap_font_montserrat_latin1_18, &descriptor, glyph, 0),
               "Lockscreen font contains each German Latin-1 glyph");
    }
    {
        Lockscreen lock;
        lock.setResourceName("CNC Fräse");
        lock.init();
        ScreenGuard guard(lock.getScreen(), &lock);
        lock.setUsageInfo(false, "", false);
        auto *resourceName = requireObject(guard.root, &lv_label_class, "CNC Fräse");
        auto *backIcon = requireObject(guard.root, &lv_label_class, LV_SYMBOL_LEFT);
        auto *backButton = lv_obj_get_parent(backIcon);
        lv_obj_update_layout(guard.root);
        lv_area_t backBounds; lv_obj_get_coords(backButton, &backBounds);
        expect(backBounds.x1 == 20 && backBounds.y1 == 20, "Icon-only back control occupies the far-left header position");
        lv_font_glyph_dsc_t iconGlyph{};
        expect(lv_font_get_glyph_dsc(lv_obj_get_style_text_font(backIcon, LV_PART_MAIN), &iconGlyph, 0xf053, 0),
               "Back control uses the real bundled chevron icon glyph");
        expect(lv_obj_get_style_text_font(resourceName, LV_PART_MAIN) == &attractap_font_montserrat_latin1_18,
               "Lockscreen resource name uses a Latin-1 font");
        expectBackground(renderer, guard.root, "lockscreen-available");
        Fixtures::activeLanguage = "en";
        lock.loop();
        requireObject(guard.root, &lv_label_class, "Tap your RFID \n        card/tag to sign in");
        requireObject(guard.root, &lv_label_class, "Available");
        renderer.capture("lockscreen-english-available");
        lock.setUsageInfo(true, "Müller", false);
        auto *usage = requireObject(guard.root, &lv_label_class, "In use: Müller");
        expect(lv_obj_get_style_text_font(usage, LV_PART_MAIN) == &attractap_font_montserrat_latin1_18,
               "Lockscreen active username uses a Latin-1 font");
        lock.setUsageInfo(false, "", true);
        requireObject(guard.root, &lv_label_class, "Under maintenance");
        Fixtures::activeLanguage = "de";
        lock.loop();
        requireObject(guard.root, &lv_label_class, "Bitte mit RFID \n        Karte/Tag anmelden");
        requireObject(guard.root, &lv_label_class, "In Wartung");
        expectBackground(renderer, guard.root, "lockscreen-in-use");
        expectBackground(renderer, guard.root, "lockscreen-maintenance");
    }
    {
        NoResourcesScreen empty;
        empty.init();
        ScreenGuard guard(empty.getScreen(), &empty);
        expectBackground(renderer, guard.root, "no-resources");
    }
    {
        ResourceListScreen list;
        API::ResourceList resources{};
        resources.count = 3;
        const char *names[] = {"Lasercutter", "CNC Fraese", "3D Drucker"};
        for (int i = 0; i < 3; ++i) {
            resources.items[i].id = i + 1;
            std::strcpy(resources.items[i].name, names[i]);
            resources.items[i].description = "Werkstatt";
        }
        resources.items[1].hasActiveUsage = true;
        resources.items[2].isUnderMaintenance = true;
        list.setResourceList(resources);
        list.init();
        ScreenGuard guard(list.getScreen(), &list);
        expectBackground(renderer, guard.root, "resource-list");
        uint32_t selected = 0;
        list.setResourceSelectionCallback([&](const API::ResourceBrief &resource) { selected = resource.id; });
        lv_obj_send_event(lv_obj_get_parent(requireObject(guard.root, &lv_label_class, "Lasercutter")), LV_EVENT_CLICKED, nullptr);
        expect(selected == 1, "Resource selection callback survives background restoration");
    }
}
void testAuthenticatedList(Renderer &renderer)
{
    ResourceListScreen list;
    API::ResourceList resources{};
    resources.count = 4;
    std::strcpy(resources.authenticatedUsername, "Alex Example");
    const char *names[] = {"Lasercutter", "Maintenance", "Werkstatttür", "3D Drucker"};
    for (int i = 0; i < 4; ++i) {
        auto &resource = resources.items[i];
        resource.id = i + 1;
        std::strcpy(resource.name, names[i]);
        resource.description = i == 1 ? "Maintenance" : "Werkstatt";
        resource.isHealthy = true;
        resource.accessKnown = true;
        resource.hasIntroduction = true;
    }
    resources.items[1].hasActiveUsage = true;
    std::strcpy(resources.items[1].activeUser, "Alex Example");
    resources.items[2].type = 1;
    resources.items[3].hasIntroduction = false;
    list.setResourceList(resources);
    list.setAuthenticatedUser("Alex Example");
    list.setSessionTimeoutTime(Fixtures::nowMs + 30000);
    list.init();
    ScreenGuard guard(list.getScreen(), &list);
    renderer.capture("att-880-authenticated-list");
    auto *logout = lv_obj_get_parent(requireObject(guard.root, &lv_label_class, "Abmelden"));
    setState(logout, LV_STATE_PRESSED);
    expect(lv_obj_get_style_transform_width(logout, LV_PART_MAIN) == 0 &&
           lv_obj_get_style_transform_height(logout, LV_PART_MAIN) == 0,
           "Pressed logout stays inside the header without clipping");
    setState(logout, LV_STATE_DEFAULT);
    auto *time = requireObject(guard.root, &lv_label_class, "30 s");
    expect(lv_obj_get_y(logout) == lv_obj_get_y(lv_obj_get_parent(time)), "Logout and countdown share one header row");
    auto *logo = requireObject(guard.root, &lv_image_class);
    expect(lv_obj_has_flag(logo, LV_OBJ_FLAG_HIDDEN), "Signed-in logo is hidden");
    for (int i = 0; i < 4; ++i) {
        auto *left = lv_obj_get_parent(requireObject(guard.root, &lv_label_class, names[i]));
        auto *row = lv_obj_get_parent(left);
        expect(lv_obj_get_child_count(row) == 2, "Every row has two halves");
        auto *right = lv_obj_get_child(row, 1);
        expect(lv_obj_get_width(left) == lv_obj_get_width(right), "Equal split widths");
        lv_area_t l, r; lv_obj_get_coords(left, &l); lv_obj_get_coords(right, &r);
        expect(l.x2 + 1 == r.x1, "Flush split without a middle gap");
        expect(r.x2 < 480 && l.x1 >= 0, "Both halves fit the display");
        expect(lv_obj_get_style_radius(left, 0) == 0 && lv_obj_get_style_radius(right, 0) == 0, "No inner radii");
    }
    uint32_t opened = 0, acted = 0;
    ResourceListAction action = ResourceListAction::None;
    unsigned logouts = 0;
    list.setResourceSelectionCallback([&](const auto &resource) { opened = resource.id; });
    list.setActionCallback([&](const auto &resource, auto value) { acted = resource.id; action = value; });
    list.setLogoutCallback([&] { ++logouts; });
    const auto click = [&](const char *caption) {
        lv_obj_send_event(lv_obj_get_parent(requireObject(guard.root, &lv_label_class, caption)), LV_EVENT_CLICKED, nullptr);
    };
    click("Lasercutter"); expect(opened == 1 && acted == 0, "Left opens details only");
    click("Stop"); expect(acted == 2 && action == ResourceListAction::Stop, "Stop targets its exact row");
    click("Öffnen"); expect(acted == 3 && action == ResourceListAction::OpenDoor, "Door action targets its exact row");
    click("Einweisung"); expect(acted == 3, "Missing introduction blocks a direct event too");
    list.showActionProgress(FirmwareI18n::Message::StartingUsage, FirmwareI18n::Text::literal("Lasercutter"));
    list.setSessionTimeoutPaused(true);
    renderer.capture("att-880-action-pending");
    auto *overlay = lv_obj_get_child(guard.root, -1);
    lv_area_t area; lv_obj_get_coords(overlay, &area);
    expect(area.x1 == 0 && area.y1 == 0 && area.x2 == 479 && area.y2 == 479, "Loading overlay covers the entire input surface");
    click("Start"); click("Maintenance"); click("Abmelden");
    expect(acted == 3 && opened == 1 && logouts == 0, "Pending action blocks actions, navigation and logout");
    Fixtures::nowMs += 45000;
    list.loop();
    requireObject(guard.root, &lv_label_class, "Pausiert");
    list.extendSessionTimeoutBy(45000);
    list.setSessionTimeoutPaused(false);
    list.hideActionProgress();
    requireObject(guard.root, &lv_label_class, "30 s");
    resources.items[0].hasActiveUsage = true;
    std::strcpy(resources.items[0].activeUser, "Alex Example");
    list.setResourceList(resources);
    list.showSuccessToast(FirmwareI18n::Message::UsageStarted);
    renderer.capture("att-880-action-complete");
    resources.items[0].hasActiveUsage = false;
    resources.items[0].requiresSupervisor = true;
    resources.items[1].isUnderMaintenance = true;
    std::strcpy(resources.items[1].activeUser, "Robin");
    resources.items[2].isHealthy = false;
    list.setResourceList(resources);
    renderer.capture("att-880-access-states");
    click("Aufsicht"); expect(acted == 1 && action == ResourceListAction::Supervision, "Supervisor requirement routes explicitly");
    std::strcpy(resources.authenticatedUsername, "Someone else");
    list.setResourceList(resources);
    click("Laden ..."); expect(acted == 1, "Another card's permissions cannot enable an action");
    renderer.capture("att-880-access-refresh");
    list.setSessionTimeoutTime(Fixtures::nowMs + 4000);
    renderer.capture("att-880-session-expiring");
    click("Abmelden"); expect(logouts == 1, "Logout re-enabled after action completion");
    list.setAuthenticatedUser("");
    renderer.capture("att-880-signed-out-list");
    expect(!lv_obj_has_flag(logo, LV_OBJ_FLAG_HIDDEN), "Logout restores logo");
    expect(resources.items[1].hasActiveUsage, "Reader logout leaves usage state intact");

    // Policy boundary cases that must stay consistent as live list data changes.
    API::ResourceBrief resource{};
    resource.accessKnown = true; resource.isHealthy = true; resource.hasIntroduction = true;
    expect(resourceListAction(resource, "Alex") == ResourceListAction::Start, "Introduced user can start");
    resource.isUnderMaintenance = true;
    expect(resourceListAction(resource, "Alex") == ResourceListAction::None, "Maintenance blocks ordinary starts");
    resource.canManageMaintenance = true;
    expect(resourceListAction(resource, "Alex") == ResourceListAction::Start, "Maintenance permission follows backend policy");
    resource.canManageMaintenance = false; resource.hasIntroduction = false;
    resource.hasActiveUsage = true; std::strcpy(resource.activeUser, "Alex");
    expect(resourceListAction(resource, "Alex") == ResourceListAction::Stop, "Owner can stop despite revoked access/maintenance");
    resource.isUnderMaintenance = false; resource.hasIntroduction = true; resource.allowTakeOver = true;
    std::strcpy(resource.activeUser, "Robin");
    expect(resourceListAction(resource, "Alex") == ResourceListAction::Takeover, "Foreign session requires explicit takeover");
    resource.allowTakeOver = false;
    expect(resourceListAction(resource, "Alex") == ResourceListAction::None, "Foreign usage is never a quick stop");
}
