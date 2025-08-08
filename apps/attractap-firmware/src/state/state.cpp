#include "state.hpp"

// Fixed-size buffer per queued message to avoid heap and keep stack small
static constexpr size_t WEBSOCKET_MESSAGE_MAX_LEN = 1024; // bytes, including null terminator
struct StateQueueMessage
{
    char data[WEBSOCKET_MESSAGE_MAX_LEN];
};

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
}

portMUX_TYPE State::stateMutex = portMUX_INITIALIZER_UNLOCKED;
uint32_t State::_lastStateChangeTime;

esp_ip4_addr_t State::wifi_ip;
bool State::wifi_connected;
String State::wifi_ssid;

esp_ip4_addr_t State::ethernet_ip;
bool State::ethernet_connected;

String State::websocket_hostname;
uint16_t State::websocket_port;
bool State::websocket_use_ssl;
bool State::websocket_connected;
QueueHandle_t State::incoming_websocket_messages_queue = nullptr;
QueueHandle_t State::outgoing_websocket_messages_queue = nullptr;

bool State::api_authenticated;
String State::api_device_name;

State::State()
{
    _lastStateChangeTime = millis();
}

void State::onStateChanged()
{
    _lastStateChangeTime = millis();
}

uint32_t State::getLastStateChangeTime()
{
    taskENTER_CRITICAL(&State::stateMutex);
    uint32_t lastStateChangeTime = _lastStateChangeTime;
    taskEXIT_CRITICAL(&State::stateMutex);
    return lastStateChangeTime;
}

void State::setEthernetState(bool connected, esp_ip4_addr_t ip)
{
    taskENTER_CRITICAL(&State::stateMutex);
    ethernet_ip = ip;
    ethernet_connected = connected;
    this->onStateChanged();
    taskEXIT_CRITICAL(&State::stateMutex);
}

void State::setWifiState(bool connected, esp_ip4_addr_t ip, String ssid)
{
    taskENTER_CRITICAL(&State::stateMutex);
    wifi_connected = connected;
    wifi_ip = ip;
    wifi_ssid = ssid;
    this->onStateChanged();
    taskEXIT_CRITICAL(&State::stateMutex);
}

State::NetworkState State::getNetworkState()
{
    taskENTER_CRITICAL(&State::stateMutex);
    NetworkState state;
    state.wifi_connected = wifi_connected;
    state.wifi_ip = wifi_ip;
    state.wifi_ssid = wifi_ssid;

    state.ethernet_connected = ethernet_connected;
    state.ethernet_ip = ethernet_ip;
    taskEXIT_CRITICAL(&State::stateMutex);

    return state;
}

void State::setWebsocketState(bool connected, String hostname, uint16_t port, bool useSSL)
{
    taskENTER_CRITICAL(&State::stateMutex);
    websocket_connected = connected;
    websocket_hostname = hostname;
    websocket_port = port;
    websocket_use_ssl = useSSL;
    this->onStateChanged();
    taskEXIT_CRITICAL(&State::stateMutex);
}

State::WebsocketState State::getWebsocketState()
{
    taskENTER_CRITICAL(&State::stateMutex);
    WebsocketState state;
    state.connected = websocket_connected;
    state.hostname = websocket_hostname;
    state.port = websocket_port;
    state.useSSL = websocket_use_ssl;
    taskEXIT_CRITICAL(&State::stateMutex);

    return state;
}

void State::setApiState(bool authenticated, String deviceName)
{
    taskENTER_CRITICAL(&State::stateMutex);
    api_authenticated = authenticated;
    api_device_name = deviceName;
    this->onStateChanged();
    taskEXIT_CRITICAL(&State::stateMutex);
}

State::ApiState State::getApiState()
{
    taskENTER_CRITICAL(&State::stateMutex);
    ApiState state;
    state.authenticated = api_authenticated;
    state.deviceName = api_device_name;
    taskEXIT_CRITICAL(&State::stateMutex);

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