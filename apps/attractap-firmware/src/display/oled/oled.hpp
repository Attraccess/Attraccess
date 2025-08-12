#pragma once

#include <Arduino.h>
#include "icons.hpp"
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include "esp_netif.h"
#include "esp_log.h"
#include "../../logger/logger.hpp"
#include "../../display/IDisplay.hpp"

#ifdef SCREEN_DRIVER_SH1106
#include <Adafruit_SH1106.h>
#elif defined(SCREEN_DRIVER_SSD1306)
#include <Adafruit_SSD1306.h>
#else
#error "No display driver defined"
#endif

class OLED : public IDisplay
{
public:
#ifdef SCREEN_DRIVER_SH1106
    OLED() : logger("OLED"), screen(SCREEN_RESET) {}
#elif defined(SCREEN_DRIVER_SSD1306)
    OLED() : logger("OLED"), screen(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, SCREEN_RESET) {}
#endif

    void setup() override;
    void loop() override;
    void transitionTo(DisplayState state) override;
    void onDataChange(State::NetworkState networkState, State::WebsocketState webSocketState, State::ApiState apiState, State::ApiEventData apiEventData) override;

private:
    DisplayState _state;
    State::NetworkState networkState;
    State::WebsocketState webSocketState;
    State::ApiState apiState;
    State::ApiEventData apiEventData;

#ifdef SCREEN_DRIVER_SH1106
    Adafruit_SH1106 screen;
#elif SCREEN_DRIVER_SSD1306
    Adafruit_SSD1306 screen;
#endif

    void updateScreen();
    IDisplay::DisplayState computeDesiredState() const;
    bool needsUpdate = true;

    void draw_main_elements();
    void draw_booting_ui();
    void draw_nfc_tap_ui();
    void draw_network_connecting_ui();
    void draw_websocket_connecting_ui();
    void draw_authentication_ui();
    void draw_waiting_for_commands_ui();
    void draw_error_ui();
    void draw_success_ui();
    void draw_text_ui();
    void draw_resource_selection_ui();
    void draw_two_line_message(String line1, String line2);
    void draw_confirm_action_ui();
    void draw_firmware_update_ui();
    void draw_wait_for_processing_ui();

    Logger logger;

    // Boot gating to keep logo visible briefly
    uint32_t bootMillis = 0;
    static constexpr uint32_t BOOT_DURATION_MS = 2000;
};