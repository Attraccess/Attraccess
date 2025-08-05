#include "websocket.hpp"

void Websocket::setup()
{
    Serial.println("Websocket setup");

    this->_certManager.begin();

    xTaskCreate(
        taskFn,
        "Websocket",
        10000,
        this,
        9,
        NULL);
}

void Websocket::taskFn(void *parameter)
{
    Websocket *websocket = (Websocket *)parameter;
    while (true)
    {
        websocket->loop();
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

void Websocket::loop()
{
    if (!network_is_connected)
    {
        return;
    }

    AttraccessApiConfig apiConfig = Settings::getAttraccessApiConfig();
    bool apiConfigChanged = _lastApiConfig.hostname != apiConfig.hostname || _lastApiConfig.port != apiConfig.port || _lastApiConfig.useSSL != apiConfig.useSSL;
    if (apiConfigChanged)
    {
        _lastApiConfig = apiConfig;
        connectWebSocket();
        return;
    }

    switch (_state)
    {
    case INIT:
        connectWebSocket();
        break;
    case CONNECTING:
        break;
    case CONNECTED:
        break;
    }
}

void Websocket::connectWebSocket()
{
    Serial.println("Websocket connectWebSocket");

    setState(CONNECTING);

    if (ws_client)
    {
        esp_websocket_client_destroy(ws_client);
        ws_client = nullptr;
    }

    AttraccessApiConfig apiConfig = Settings::getAttraccessApiConfig();
    String serverHostname = apiConfig.hostname;
    uint16_t serverPort = apiConfig.port;

    if (serverHostname.isEmpty() || serverPort == 0)
    {
        Serial.println("Websocket connectWebSocket: serverHostname or serverPort is empty");
        setState(INIT);
        vTaskDelay(RECONNECT_INTERVAL_MS / portTICK_PERIOD_MS);
        return;
    }

    String protocol = (serverPort == 443) ? "wss" : "ws";
    String wsUrl = protocol + "://" + serverHostname + ":" + String(serverPort) + "/api/attractap/websocket";
    Serial.printf("Connecting to WebSocket: %s\n", wsUrl.c_str());

    esp_websocket_client_config_t websocket_cfg = {};
    websocket_cfg.uri = wsUrl.c_str();
    websocket_cfg.port = serverPort;

    // Configure buffer sizes to prevent ENOBUFS errors
    websocket_cfg.buffer_size = 4096; // Increase buffer size (default is typically 1024)
    websocket_cfg.task_stack = 8192;  // Increase task stack size for stability
    websocket_cfg.task_prio = 5;      // Set appropriate task priority

    if (apiConfig.useSSL)
    {
        websocket_cfg.transport = WEBSOCKET_TRANSPORT_OVER_SSL;

        if (!this->_certManager.getCertificate(&websocket_cfg.cert_pem))
        {
            Serial.println("Failed to get certificate");
            setState(INIT);
            vTaskDelay(RECONNECT_INTERVAL_MS / portTICK_PERIOD_MS);
            return;
        }
    }

    ws_client = esp_websocket_client_init(&websocket_cfg);
    if (!ws_client)
    {
        Serial.println("Failed to initialize WebSocket client");
        setState(INIT);
        vTaskDelay(RECONNECT_INTERVAL_MS / portTICK_PERIOD_MS);
        return;
    }

    // Register event handler
    esp_websocket_register_events(ws_client, WEBSOCKET_EVENT_ANY, websocket_event_handler, this);

    // Start connection
    esp_err_t ret = esp_websocket_client_start(ws_client);
    if (ret != ESP_OK)
    {
        Serial.printf("Failed to start WebSocket client: %s\n", esp_err_to_name(ret));
        setState(INIT);
        vTaskDelay(RECONNECT_INTERVAL_MS / portTICK_PERIOD_MS);
        return;
    }
}

void Websocket::websocket_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data)
{
    Websocket *websocket = (Websocket *)handler_args;
    websocket->processWebSocketEvent(base, event_id, event_data);
}

void Websocket::processWebSocketEvent(esp_event_base_t base, int32_t event_id, void *event_data)
{
    esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;

    AttraccessApiConfig apiConfig = Settings::getAttraccessApiConfig();

    switch (event_id)
    {
    case WEBSOCKET_EVENT_CONNECTED:
        if (apiConfig.useSSL)
        {
            this->_certManager.markSuccess();
        }
        Serial.println("AttraccessServiceESP: WebSocket connected");
        setState(CONNECTED);
        break;

    case WEBSOCKET_EVENT_CLOSED:
        Serial.println("AttraccessServiceESP: WebSocket closed");
        vTaskDelay(RECONNECT_INTERVAL_MS / portTICK_PERIOD_MS);
        setState(INIT);
        break;

    case WEBSOCKET_EVENT_DISCONNECTED:
    {
        Serial.println("AttraccessServiceESP: WebSocket disconnected");
        if (apiConfig.useSSL)
        {
            this->_certManager.markFailure();
        }
        setState(INIT);
        vTaskDelay(RECONNECT_INTERVAL_MS / portTICK_PERIOD_MS);
        break;
    }

    case WEBSOCKET_EVENT_DATA:
        if (data->op_code == 0x01)
        { // Text frame
            String message = String((char *)data->data_ptr, data->data_len);
            Serial.printf("AttraccessServiceESP: Received: %s\n", message.c_str());
            if (_messageHandler)
            {
                _messageHandler(message);
            }
        }
        else if (data->op_code == 0x02)
        { // Binary frame
            Serial.printf("AttraccessServiceESP: Received binary data: %zu bytes\n", data->data_len);
            if (_binaryDataHandler)
            {
                _binaryDataHandler((const uint8_t *)data->data_ptr, data->data_len);
            }
        }
        break;

    case WEBSOCKET_EVENT_ERROR:
        Serial.println("AttraccessServiceESP: WebSocket error");
        setState(INIT);
        break;

    default:
        break;
    }
}

void Websocket::sendMessage(const String &message)
{
    Serial.println("Websocket sendMessage: " + message);
    int ret = esp_websocket_client_send_text(ws_client, message.c_str(), message.length(), pdMS_TO_TICKS(5000));

    if (ret == -1)
    {
        Serial.println("Websocket sendMessage: failed");
    }
}

void Websocket::setNetworkIsConnected(bool isConnected)
{
    network_is_connected = isConnected;
}

void Websocket::setBinaryDataHandler(std::function<void(const uint8_t *data, size_t length)> binaryDataHandler)
{
    _binaryDataHandler = binaryDataHandler;
}

void Websocket::setMessageHandler(std::function<void(const String &message)> messageHandler)
{
    _messageHandler = messageHandler;
}

void Websocket::setState(ConnectionState state)
{
    _state = state;
    if (_stateChangedHandler)
    {
        _stateChangedHandler(state);
    }
}

void Websocket::setStateChangedHandler(std::function<void(ConnectionState state)> stateChangedHandler)
{
    _stateChangedHandler = stateChangedHandler;
}