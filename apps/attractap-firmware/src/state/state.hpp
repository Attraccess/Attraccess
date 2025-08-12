#pragma once

#include <esp_netif.h>
#include <Arduino.h>
#include <ArduinoJson.h>

class State
{
public:
    static void setWifiState(bool connected, esp_ip4_addr_t ip, String ssid);
    static void setEthernetState(bool connected, esp_ip4_addr_t ip);
    struct NetworkState
    {
        bool wifi_connected;
        esp_ip4_addr_t wifi_ip;
        String wifi_ssid;
        bool ethernet_connected;
        esp_ip4_addr_t ethernet_ip;
    };
    static NetworkState getNetworkState();

    static void setWebsocketState(bool connected, String hostname, uint16_t port, bool useSSL);
    struct WebsocketState
    {
        bool connected;
        String hostname;
        uint16_t port;
        bool useSSL;
    };
    static WebsocketState getWebsocketState();

    static void setApiState(bool authenticated, String deviceName);
    struct ApiState
    {
        bool authenticated;
        String deviceName;
    };
    static ApiState getApiState();

    static uint32_t getLastStateChangeTime();

    static void pushIncomingWebsocketMessageToQueue(const String &message);
    static bool getNextIncomingWebsocketMessage(String &message);

    static void pushOutgoingWebsocketMessageToQueue(const String &message);
    static bool getNextOutgoingWebsocketMessage(String &message);

    enum ApiInputEventType
    {
        API_INPUT_EVENT_KEYPAD_CONFIRM_PRESSED,
        API_INPUT_EVENT_KEYPAD_CANCEL_PRESSED,
        API_INPUT_EVENT_NFC_CARD_DETECTED,
        API_INPUT_EVENT_NFC_CARD_CHANGE_KEY_SUCCESS,
        API_INPUT_EVENT_NFC_CARD_CHANGE_KEY_FAILED,
        API_INPUT_EVENT_NFC_CARD_AUTHENTICATE_SUCCESS,
        API_INPUT_EVENT_NFC_CARD_AUTHENTICATE_FAILED,
    };
    struct ApiInputEvent
    {
        ApiInputEventType type;
        // Fixed-size buffer to avoid placing Arduino String in FreeRTOS queue
        char payload[64];
    };
    static void pushEventToApi(ApiInputEventType type);
    static void pushEventToApi(ApiInputEventType type, const String &payload);
    static bool getNextApiInputEvent(ApiInputEvent &event);

    enum ApiEventState
    {
        API_EVENT_STATE_NONE,
        API_EVENT_STATE_DISPLAY_ERROR,
        API_EVENT_STATE_DISPLAY_SUCCESS,
        API_EVENT_STATE_DISPLAY_TEXT,
        API_EVENT_STATE_CONFIRM_ACTION,
        API_EVENT_STATE_RESOURCE_SELECTION,
        API_EVENT_STATE_WAIT_FOR_PROCESSING,
        API_EVENT_STATE_WAIT_FOR_NFC_TAP,
        API_EVENT_STATE_FIRMWARE_UPDATE
    };
    struct ApiEventData
    {
        ApiEventState state;
        ArduinoJson::JsonObject payload;
    };
    static void setApiEventData(ApiEventState state, ArduinoJson::JsonObject payload);
    static ApiEventData getApiEventData();
    static uint32_t getLastApiEventTime();

    static void setKeypadValue(String value);
    static String getKeypadValue();

    // WiFi events queue to notify other components (e.g., CLI) about WiFi-related events
    enum WifiEventType
    {
        WIFI_EVENT_SCAN_DONE
    };
    struct WifiEvent
    {
        WifiEventType type;
    };
    static void pushWifiEventToQueue(WifiEventType type);
    static bool getNextWifiEvent(WifiEvent &event);

    // queue methods to send nfc commands to nfc class
    enum NfcCommandType
    {
        NFC_COMMAND_TYPE_AUTHENTICATE,
        NFC_COMMAND_TYPE_CHANGE_KEY,
    };
    struct NfcCommand
    {
        NfcCommandType type;
        // Fixed-size buffer to avoid placing Arduino String in FreeRTOS queue
        char payload[1024];
    };
    static void pushNfcCommandToQueue(NfcCommandType type, const String &payload);
    static bool getNextNfcCommand(NfcCommand &command);

private:
    State() = delete;

    static void onStateChanged();
    static uint32_t _lastStateChangeTime;

    static portMUX_TYPE stateMutex;
    static portMUX_TYPE apiEventMutex;

    static esp_ip4_addr_t wifi_ip;
    static bool wifi_connected;
    static String wifi_ssid;

    static esp_ip4_addr_t ethernet_ip;
    static bool ethernet_connected;

    static String websocket_hostname;
    static uint16_t websocket_port;
    static bool websocket_use_ssl;
    static bool websocket_connected;
    static QueueHandle_t incoming_websocket_messages_queue;
    static QueueHandle_t outgoing_websocket_messages_queue;

    static QueueHandle_t nfc_commands_queue;
    static QueueHandle_t wifi_events_queue;

    static QueueHandle_t api_input_events_queue;

    static void initializeQueuesIfNeeded();

    static bool _queuesInitialized;

    static bool api_authenticated;
    static String api_device_name;

    static ApiEventData api_event_data;
    static uint32_t api_event_time;

    // Backing store for api_event_data.payload so it remains valid
    // after the source JsonDocument in the caller goes out of scope.
    static DynamicJsonDocument api_event_doc;

    static String keypad_value;
};