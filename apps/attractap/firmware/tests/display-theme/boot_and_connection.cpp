#include "render_harness.hpp"

void testBoot(Renderer &renderer)
{
    BootScreen boot;
    boot.init();
    ScreenGuard screen(boot.getScreen(), &boot);
    auto *title = requireObject(screen.root, &lv_label_class, "Attraccess");
    expectColor(lv_obj_get_style_text_color(title, LV_PART_MAIN), DisplayTheme::text(), "Boot title color");
    requireObject(screen.root, &lv_label_class, "Attractap Host vtest");
    renderer.capture("boot");
}

void testInit(Renderer &renderer)
{
    InitScreen init;
    init.init();
    ScreenGuard screen(init.getScreen(), &init);
    init.loop();
    requireObject(screen.root, &lv_label_class, "Server: nicht konfiguriert");
    renderer.capture("init-pending");
    Fixtures::network.wifi_connected = true;
    const uint8_t ip[] = {192, 0, 2, 42};
    std::memcpy(&Fixtures::network.wifi_ip.addr, ip, sizeof(ip));
    Fixtures::websocket = {false, "reader.example", 443, true, State::WS_CONNECTING,
                          "Example CA", 1, 3, 0, false, 5};
    Fixtures::nowMs += 1000;
    init.loop();
    auto *wifi = requireObject(screen.root, &lv_label_class, "WLAN  192.0.2.42");
    expectColor(lv_obj_get_style_text_color(wifi, LV_PART_MAIN), DisplayTheme::success(), "Connected network color");
    auto *search = requireObject(screen.root, &lv_label_class, "suche Zertifikat");
    expectColor(lv_obj_get_style_text_color(search, LV_PART_MAIN), DisplayTheme::warning(), "Certificate search warning");
    renderer.capture("init-cert-search");
    FirmwareI18n::refreshTree(screen.root, "en");
    requireObject(screen.root, &lv_label_class, "Wi-Fi  192.0.2.42");
    requireObject(screen.root, &lv_label_class, "Server: reader.example:443  (SSL)");
    renderer.capture("init-cert-search-english");
    FirmwareI18n::refreshTree(screen.root, "de");
    Fixtures::websocket.connected = true;
    Fixtures::websocket.phase = State::WS_CONNECTED;
    Fixtures::api.authenticated = true;
    Fixtures::nowMs += 1000;
    init.loop();
    auto *api = requireObject(screen.root, &lv_label_class, "API verbunden");
    expectColor(lv_obj_get_style_text_color(api, LV_PART_MAIN), DisplayTheme::success(), "API connected color");
    renderer.capture("init-connected");
    bool opened = false;
    init.setOnOpenSettingsCallback([&] { opened = true; });
    lv_obj_send_event(lv_obj_get_parent(requireObject(screen.root, &lv_label_class, "Einstellungen")), LV_EVENT_CLICKED, nullptr);
    expect(opened, "Production settings event callback");
}
