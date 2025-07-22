#ifndef WIFI_HIDDEN_NETWORK_DIALOG_H
#define WIFI_HIDDEN_NETWORK_DIALOG_H

#include <Arduino.h>
#include <lvgl.h>
#include "KeyboardManager.h"

class WiFiHiddenNetworkDialog
{
public:
    // Callback function types
    typedef std::function<void(const String &ssid, const String &password)> ConnectCallback;
    typedef std::function<void()> CancelCallback;

    WiFiHiddenNetworkDialog();
    ~WiFiHiddenNetworkDialog();

    void begin(KeyboardManager *keyboardMgr);
    void show();
    void hide();
    void update();

    // Set callbacks
    void setConnectCallback(ConnectCallback callback);
    void setCancelCallback(CancelCallback callback);

    // Check if the dialog is currently visible
    bool isVisible() const;

private:
    // UI components
    lv_obj_t *dialog;
    lv_obj_t *ssidTextArea;
    lv_obj_t *passwordTextArea;
    lv_obj_t *connectButton;
    lv_obj_t *cancelButton;

    // State
    bool visible;
    lv_obj_t *currentTextArea; // Track which text area is active for keyboard

    // Dependencies
    KeyboardManager *keyboardManager;

    // Callbacks
    ConnectCallback onConnect;
    CancelCallback onCancel;

    // Private methods
    void createUI();

    // Event handlers
    static void onConnectClicked(lv_event_t *e);
    static void onCancelClicked(lv_event_t *e);
    static void onSSIDTextAreaClicked(lv_event_t *e);
    static void onPasswordTextAreaClicked(lv_event_t *e);
};

#endif // WIFI_HIDDEN_NETWORK_DIALOG_H