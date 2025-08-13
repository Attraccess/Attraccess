#pragma once

#include <Arduino.h>
#include <XPT2046_Touchscreen.h>
#include <TFT_eSPI.h>
#include <attractap_touch_lv_conf.h>
#include <lvgl.h>
#include <esp_netif.h>
#include "screens/waitForConnection/waitForConnection.hpp"
#include "screens/iScreen.hpp"
#include <ArduinoJson.h>
#include "screens/nfcTap/nfcTap.hpp"
#include "screens/message/message.hpp"
#include "screens/unknownState/unknownState.hpp"
#include "task_priorities.h"
#include "../../state/state.hpp"
#include "../../logger/logger.hpp"
#include "../../display/IDisplay.hpp"

class Touchscreen : public IDisplay
{
public:
    Touchscreen() : xptSPI(VSPI), xpt(XPT2046_CS, XPT2046_IRQ), tft(), draw_buf(), indev(), lastMillis(0), waitForConnectionScreen(), nfcTapScreen(), messageScreen(), unknownStateScreen(), currentScreen(nullptr), logger("Touchscreen") {}

    void setup() override;
    void loop() override;
    void transitionTo(DisplayState state) override;
    void onDataChange(State::NetworkState networkState, State::WebsocketState webSocketState, State::ApiState apiState, State::ApiEventData apiEventData) override;

    // Static wrapper functions for LVGL callbacks (multi-instance safe)
    static void flushDisplayWrapper(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map);
    static void readTouchpadWrapper(lv_indev_t *indev, lv_indev_data_t *data);

private:
    static uint8_t UPDATE_FREQ_HZ;
    static uint32_t UPDATE_INTERVAL_MS;

    uint32_t lastMillis;

    SPIClass xptSPI;
    XPT2046_Touchscreen xpt;
    TFT_eSPI tft;

    uint32_t draw_buf[TFT_HOR_RES * TFT_VER_RES / 10];
    lv_indev_t *indev;
    lv_display_t *display;

    void xptPosition(uint16_t *xptX, uint16_t *xptY, uint8_t *xptZ, uint16_t *tftX, uint16_t *tftY);
    void flushDisplay(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map);
    void readTouchpad(lv_indev_t *indev, lv_indev_data_t *data);
    void feedLvgl();

    DisplayState state;

    State::NetworkState networkState;
    State::WebsocketState websocketState;
    State::ApiState apiState;
    State::ApiEventData apiEventData;

    IScreen *currentScreen;
    lv_obj_t *deviceNameLabel;

    uint32_t bootMillis;
    lv_obj_t *uptimeLabel;

    void prepareApplicationOverlay();

    WaitForConnectionScreen waitForConnectionScreen;
    NfcTapScreen nfcTapScreen;
    MessageScreen messageScreen;
    UnknownStateScreen unknownStateScreen;

    Logger logger;
};