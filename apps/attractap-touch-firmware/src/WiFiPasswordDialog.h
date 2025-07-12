#ifndef WIFI_PASSWORD_DIALOG_H
#define WIFI_PASSWORD_DIALOG_H

#include <Arduino.h>
#include <lvgl.h>
#include "KeyboardManager.h"

class WiFiPasswordDialog
{
public:
    // Callback function types
    typedef std::function<void(const String &ssid, const String &password)> ConnectCallback;
    typedef std::function<void()> CancelCallback;

    WiFiPasswordDialog();
    ~WiFiPasswordDialog();

    void begin(KeyboardManager *keyboardMgr);
    void show(const String &ssid);
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
    lv_obj_t *passwordNetworkLabel;
    lv_obj_t *passwordTextArea;
    lv_obj_t *passwordConnectButton;
    lv_obj_t *passwordCancelButton;

    // State
    bool visible;
    String selectedNetworkSSID;

    // Dependencies
    KeyboardManager *keyboardManager;

    // Callbacks
    ConnectCallback onConnect;
    CancelCallback onCancel;

    // Private methods
    void createUI();

    // Event handlers
    static void onPasswordConnectClicked(lv_event_t *e);
    static void onPasswordCancelClicked(lv_event_t *e);
    static void onPasswordTextAreaClicked(lv_event_t *e);
};

#endif // WIFI_PASSWORD_DIALOG_H