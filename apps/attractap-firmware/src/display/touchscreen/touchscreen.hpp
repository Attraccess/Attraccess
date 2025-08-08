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

class Touchscreen
{
public:
    enum DisplayState
    {
        DISPLAY_STATE_NONE,
        DISPLAY_STATE_ERROR,
        DISPLAY_STATE_SUCCESS,
        DISPLAY_STATE_TEXT,
        DISPLAY_STATE_SELECT_ITEM,
        DISPLAY_STATE_CONFIRM_ACTION,
    };

    Touchscreen() : xptSPI(VSPI), xpt(XPT2046_CS, XPT2046_IRQ), tft(), draw_buf(), indev(), lastMillis(0), lastKnownAppStateChangeTime(0), waitForConnectionScreen(), nfcTapScreen(), messageScreen(), unknownStateScreen(), isConnectedToWifi(false), isConnectedToEthernet(false), isConnectedToWebsocket(false), isConnectedToApi(false), nfcTapEnabled(false), currentScreen(nullptr), state(DISPLAY_STATE_NONE), logger("Touchscreen") {}

    void setup();

    // Static wrapper functions for LVGL callbacks (multi-instance safe)
    static void flushDisplayWrapper(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map);
    static void readTouchpadWrapper(lv_indev_t *indev, lv_indev_data_t *data);

private:
    static void taskFn(void *parameter);
    void loop();

    static uint8_t UPDATE_FREQ_HZ;
    static uint32_t UPDATE_INTERVAL_MS;

    uint32_t lastKnownAppStateChangeTime;
    void getUpdatesFromAppState();

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

    bool isConnectedToApi;
    bool isConnectedToWifi;
    bool isConnectedToEthernet;
    bool isConnectedToWebsocket;

    bool nfcTapEnabled;

    IScreen *currentScreen;
    lv_obj_t *deviceNameLabel;

    uint32_t bootMillis;
    lv_obj_t *uptimeLabel;

    void updateScreen();
    void prepareApplicationOverlay();

    WaitForConnectionScreen waitForConnectionScreen;
    NfcTapScreen nfcTapScreen;
    MessageScreen messageScreen;
    UnknownStateScreen unknownStateScreen;

    Logger logger;
};