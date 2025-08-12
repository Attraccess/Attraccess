#include "state.hpp"

// Fixed-size buffer per queued message to avoid heap and keep stack small
static constexpr size_t WEBSOCKET_MESSAGE_MAX_LEN = 1024; // bytes, including null terminator
struct StateQueueMessage
{
    char data[WEBSOCKET_MESSAGE_MAX_LEN];
};

// Static member definitions
uint32_t State::_lastStateChangeTime = 0;
portMUX_TYPE State::stateMutex = portMUX_INITIALIZER_UNLOCKED;
portMUX_TYPE State::apiEventMutex = portMUX_INITIALIZER_UNLOCKED;
esp_ip4_addr_t State::wifi_ip = {};
bool State::wifi_connected = false;
String State::wifi_ssid = "";
esp_ip4_addr_t State::ethernet_ip = {};
bool State::ethernet_connected = false;
String State::websocket_hostname = "";
uint16_t State::websocket_port = 0;
bool State::websocket_use_ssl = false;
bool State::websocket_connected = false;
QueueHandle_t State::incoming_websocket_messages_queue = nullptr;
QueueHandle_t State::outgoing_websocket_messages_queue = nullptr;
QueueHandle_t State::api_input_events_queue = nullptr;
QueueHandle_t State::nfc_commands_queue = nullptr;
QueueHandle_t State::wifi_events_queue = nullptr;
bool State::_queuesInitialized = false;
bool State::api_authenticated = false;
String State::api_device_name = "";
State::ApiEventData State::api_event_data = {State::ApiEventState::API_EVENT_STATE_NONE, JsonObject()};
uint32_t State::api_event_time = 0;
DynamicJsonDocument State::api_event_doc(1024);
String State::keypad_value = "";

void State::initializeQueuesIfNeeded()
{
    if (State::incoming_websocket_messages_queue == nullptr)
    {
        State::incoming_websocket_messages_queue = xQueueCreate(15, sizeof(StateQueueMessage));
    }
    if (State::outgoing_websocket_messages_queue == nullptr)
    {
        State::outgoing_websocket_messages_queue = xQueueCreate(15, sizeof(StateQueueMessage));
    }
    if (State::api_input_events_queue == nullptr)
    {
        State::api_input_events_queue = xQueueCreate(15, sizeof(ApiInputEvent));
    }
    if (State::nfc_commands_queue == nullptr)
    {
        State::nfc_commands_queue = xQueueCreate(15, sizeof(NfcCommand));
    }
    if (State::wifi_events_queue == nullptr)
    {
        State::wifi_events_queue = xQueueCreate(10, sizeof(WifiEvent));
    }
}

void State::onStateChanged()
{
    _lastStateChangeTime = millis();
}

uint32_t State::getLastStateChangeTime()
{
    taskENTER_CRITICAL(&stateMutex);
    uint32_t lastStateChangeTime = _lastStateChangeTime;
    taskEXIT_CRITICAL(&stateMutex);
    return lastStateChangeTime;
}

void State::setEthernetState(bool connected, esp_ip4_addr_t ip)
{
    taskENTER_CRITICAL(&stateMutex);
    ethernet_ip = ip;
    ethernet_connected = connected;
    onStateChanged();
    taskEXIT_CRITICAL(&stateMutex);
}

void State::setWifiState(bool connected, esp_ip4_addr_t ip, String ssid)
{
    taskENTER_CRITICAL(&stateMutex);
    wifi_connected = connected;
    wifi_ip = ip;
    wifi_ssid = ssid;
    onStateChanged();
    taskEXIT_CRITICAL(&stateMutex);
}

State::NetworkState State::getNetworkState()
{
    taskENTER_CRITICAL(&stateMutex);
    NetworkState state;
    state.wifi_connected = wifi_connected;
    state.wifi_ip = wifi_ip;
    state.wifi_ssid = wifi_ssid;

    state.ethernet_connected = ethernet_connected;
    state.ethernet_ip = ethernet_ip;
    taskEXIT_CRITICAL(&stateMutex);

    return state;
}

void State::setWebsocketState(bool connected, String hostname, uint16_t port, bool useSSL)
{
    taskENTER_CRITICAL(&stateMutex);
    websocket_connected = connected;
    websocket_hostname = hostname;
    websocket_port = port;
    websocket_use_ssl = useSSL;
    onStateChanged();
    taskEXIT_CRITICAL(&stateMutex);
}

State::WebsocketState State::getWebsocketState()
{
    taskENTER_CRITICAL(&stateMutex);
    WebsocketState state;
    state.connected = websocket_connected;
    state.hostname = websocket_hostname;
    state.port = websocket_port;
    state.useSSL = websocket_use_ssl;
    taskEXIT_CRITICAL(&stateMutex);

    return state;
}

void State::setApiState(bool authenticated, String deviceName)
{
    taskENTER_CRITICAL(&stateMutex);
    api_authenticated = authenticated;
    api_device_name = deviceName;
    onStateChanged();
    taskEXIT_CRITICAL(&stateMutex);
}

State::ApiState State::getApiState()
{
    taskENTER_CRITICAL(&stateMutex);
    ApiState state;
    state.authenticated = api_authenticated;
    state.deviceName = api_device_name;
    taskEXIT_CRITICAL(&stateMutex);

    return state;
}

void State::pushIncomingWebsocketMessageToQueue(const String &message)
{
    initializeQueuesIfNeeded();
    static const uint32_t incoming_queue_max_wait_ms = 2000;
    StateQueueMessage qmsg;
    size_t copyLen = message.length();
    if (copyLen >= WEBSOCKET_MESSAGE_MAX_LEN)
    {
        copyLen = WEBSOCKET_MESSAGE_MAX_LEN - 1; // leave space for null terminator
    }
    memcpy(qmsg.data, message.c_str(), copyLen);
    qmsg.data[copyLen] = '\0';

    xQueueSend(incoming_websocket_messages_queue, &qmsg, pdMS_TO_TICKS(incoming_queue_max_wait_ms));
}

bool State::getNextIncomingWebsocketMessage(String &message)
{
    initializeQueuesIfNeeded();
    StateQueueMessage qmsg;
    if (xQueueReceive(incoming_websocket_messages_queue, &qmsg, 0) == pdPASS)
    {
        message = String(qmsg.data);
        return true;
    }
    return false;
}

void State::pushOutgoingWebsocketMessageToQueue(const String &message)
{
    initializeQueuesIfNeeded();
    static const uint32_t outgoing_queue_max_wait_ms = 2000;
    StateQueueMessage qmsg;
    size_t copyLen = message.length();
    if (copyLen >= WEBSOCKET_MESSAGE_MAX_LEN)
    {
        copyLen = WEBSOCKET_MESSAGE_MAX_LEN - 1;
    }
    memcpy(qmsg.data, message.c_str(), copyLen);
    qmsg.data[copyLen] = '\0';

    xQueueSend(outgoing_websocket_messages_queue, &qmsg, pdMS_TO_TICKS(outgoing_queue_max_wait_ms));
}

bool State::getNextOutgoingWebsocketMessage(String &message)
{
    initializeQueuesIfNeeded();
    StateQueueMessage qmsg;
    if (xQueueReceive(outgoing_websocket_messages_queue, &qmsg, 0) == pdPASS)
    {
        message = String(qmsg.data);
        return true;
    }
    return false;
}

void State::setApiEventData(ApiEventState state, ArduinoJson::JsonObject payload)
{
    taskENTER_CRITICAL(&apiEventMutex);
    api_event_data.state = state;

    // Ensure persistent storage of payload independent of caller's document
    api_event_doc.clear();
    JsonObject target = api_event_doc.to<JsonObject>();
    for (JsonPair p : payload)
    {
        target[p.key()] = p.value();
    }
    api_event_data.payload = api_event_doc.as<JsonObject>();
    api_event_time = millis();
    taskEXIT_CRITICAL(&apiEventMutex);
}

State::ApiEventData State::getApiEventData()
{
    taskENTER_CRITICAL(&apiEventMutex);
    ApiEventData data = api_event_data;
    taskEXIT_CRITICAL(&apiEventMutex);
    return data;
}

uint32_t State::getLastApiEventTime()
{
    taskENTER_CRITICAL(&apiEventMutex);
    uint32_t time = api_event_time;
    taskEXIT_CRITICAL(&apiEventMutex);
    return time;
}

void State::pushEventToApi(ApiInputEventType type)
{
    pushEventToApi(type, "");
}

void State::pushEventToApi(ApiInputEventType type, const String &payload)
{
    initializeQueuesIfNeeded();

    ApiInputEvent event;
    event.type = type;
    // Deep copy payload into fixed buffer
    size_t copyLen = payload.length();
    if (copyLen >= sizeof(event.payload))
    {
        copyLen = sizeof(event.payload) - 1; // leave room for null terminator
    }
    memcpy(event.payload, payload.c_str(), copyLen);
    event.payload[copyLen] = '\0';
    xQueueSend(api_input_events_queue, &event, pdMS_TO_TICKS(1000));
}

bool State::getNextApiInputEvent(ApiInputEvent &event)
{
    initializeQueuesIfNeeded();
    return xQueueReceive(api_input_events_queue, &event, 0) == pdPASS;
}

void State::setKeypadValue(String value)
{
    taskENTER_CRITICAL(&stateMutex);
    if (keypad_value != value)
    {
        keypad_value = value;
        onStateChanged();
    }
    taskEXIT_CRITICAL(&stateMutex);
}

String State::getKeypadValue()
{
    taskENTER_CRITICAL(&stateMutex);
    String value = keypad_value;
    taskEXIT_CRITICAL(&stateMutex);
    return value;
}

void State::pushWifiEventToQueue(WifiEventType type)
{
    initializeQueuesIfNeeded();
    WifiEvent event;
    event.type = type;
    xQueueSend(wifi_events_queue, &event, pdMS_TO_TICKS(1000));
}

bool State::getNextWifiEvent(WifiEvent &event)
{
    initializeQueuesIfNeeded();
    return xQueueReceive(wifi_events_queue, &event, 0) == pdPASS;
}

void State::pushNfcCommandToQueue(NfcCommandType type, const String &payload)
{
    initializeQueuesIfNeeded();
    NfcCommand command;
    command.type = type;
    size_t copyLen = payload.length();
    if (copyLen >= sizeof(command.payload))
    {
        copyLen = sizeof(command.payload) - 1; // leave room for null terminator
    }
    memcpy(command.payload, payload.c_str(), copyLen);
    command.payload[copyLen] = '\0';
    xQueueSend(nfc_commands_queue, &command, pdMS_TO_TICKS(1000));
}

bool State::getNextNfcCommand(NfcCommand &command)
{
    initializeQueuesIfNeeded();
    return xQueueReceive(nfc_commands_queue, &command, 0) == pdPASS;
}