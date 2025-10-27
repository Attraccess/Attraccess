#include "websocket.hpp"

void Websocket::setup()
{
    logger.info("Websocket setup");
    this->_certManager.begin();
}

void Websocket::loop()
{
    if (!connectionAttemptsEnabled)
    {
        return;
    }

    this->updateInfoFromAppState();

    if (!network_is_connected)
    {
        return;
    }

    AttraccessApiConfig apiConfig = Settings::getAttraccessApiConfig();
    bool apiConfigChanged = _lastApiConfig.hostname != apiConfig.hostname || _lastApiConfig.port != apiConfig.port || _lastApiConfig.useSSL != apiConfig.useSSL;
    if (apiConfigChanged)
    {
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

void Websocket::updateInfoFromAppState()
{
    auto networkState = State::getNetworkState();
    this->network_is_connected = networkState.wifi_connected || networkState.ethernet_connected;
}

void Websocket::connectWebSocket()
{
    if (!connectionAttemptsEnabled)
    {
        return;
    }

    if (!shouldReconnect())
    {
        return;
    }
    lastReconnectAttemptTime = millis();

    logger.info("connectWebSocket");

    if (!network_is_connected)
    {
        logger.info("connectWebSocket: network is not connected");
        setState(INIT);

        // TODO: replace with a logic that compares a timestamp to now
        // vTaskDelay(RECONNECT_INTERVAL_MS / portTICK_PERIOD_MS);
        return;
    }

    AttraccessApiConfig apiConfig = Settings::getAttraccessApiConfig();
    _lastApiConfig = apiConfig;
    setState(CONNECTING);

    if (ws_client)
    {
        esp_websocket_client_destroy(ws_client);
        ws_client = nullptr;
    }

    String serverHostname = apiConfig.hostname;
    uint16_t serverPort = apiConfig.port;

    if (serverHostname.isEmpty() || serverPort == 0)
    {
        logger.error("connectWebSocket: serverHostname or serverPort is empty");
        setState(INIT);

        return;
    }

    if (apiConfig.useSSL)
    {
        logger.info("connectWebSocket: using SSL");
    }
    else
    {
        logger.info("connectWebSocket: non secure (no SSL)");
    }
    String protocol = (apiConfig.useSSL) ? "wss" : "ws";
    String wsUrl = protocol + "://" + serverHostname + ":" + String(serverPort) + "/api/attractap/websocket";
    logger.info(("Connecting to WebSocket: " + wsUrl).c_str());

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
            logger.error("Failed to get certificate");
            setState(INIT);
            return;
        }
    }

    ws_client = esp_websocket_client_init(&websocket_cfg);
    if (!ws_client)
    {
        logger.error("Failed to initialize WebSocket client");
        setState(INIT);

        return;
    }

    // Register event handler
    esp_websocket_register_events(ws_client, WEBSOCKET_EVENT_ANY, websocket_event_handler, this);

    // Start connection
    esp_err_t ret = esp_websocket_client_start(ws_client);
    if (ret != ESP_OK)
    {
        logger.error((String("Failed to start WebSocket client: ") + esp_err_to_name(ret)).c_str());
        setState(INIT);

        return;
    }

    logger.info("connectWebSocket: WebSocket started");
}

bool Websocket::shouldReconnect()
{
    return millis() - this->lastReconnectAttemptTime >= this->RECONNECT_INTERVAL_MS;
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
        logger.info("WebSocket connected");
        {
            this->_certManager.markSuccess();
        }
        setState(CONNECTED);
        break;

    case WEBSOCKET_EVENT_CLOSED:
        logger.info("WebSocket closed");
        setState(INIT);
        break;

    case WEBSOCKET_EVENT_DISCONNECTED:
    {
        logger.info("WebSocket disconnected");
        if (apiConfig.useSSL)
        {
            this->_certManager.markFailure();
        }
        setState(INIT);
        break;
    }

    case WEBSOCKET_EVENT_DATA:
        if (data->op_code == 0x01)
        { // Text frame
            if (this->messageCallbackRaw)
            {
                this->messageCallbackRaw((const char *)data->data_ptr, (size_t)data->data_len);
            }
        }
        else if (data->op_code == 0x02)
        { // Binary frame
            logger.debug(("Received binary data: " + String(data->data_len) + " bytes").c_str());

            if (this->binaryDataCallback)
            {
                this->binaryDataCallback(*data);
            }
        }
        break;

    case WEBSOCKET_EVENT_ERROR:
        logger.error("WebSocket error");
        setState(INIT);
        break;

    default:
        logger.error(("Unknown event: " + String(event_id)).c_str());
        break;
    }
}

void Websocket::sendMessage(const String &message)
{
    this->logger.debug(("sendMessage: " + message).c_str());
    int ret = esp_websocket_client_send_text(ws_client, message.c_str(), message.length(), pdMS_TO_TICKS(5000));

    if (ret == -1)
    {
        logger.error("sendMessage: failed");
    }
}

void Websocket::sendMessage(const char *message, size_t length)
{
    if (!ws_client)
    {
        logger.error("sendMessage(raw): ws_client not initialized");
        return;
    }
    int ret = esp_websocket_client_send_text(ws_client, message, static_cast<int>(length), pdMS_TO_TICKS(5000));
    if (ret == -1)
    {
        logger.error("sendMessage(raw): failed");
    }
}

void Websocket::setState(ConnectionState state)
{
    _state = state;

    State::setWebsocketState(state == CONNECTED, this->_lastApiConfig.hostname, this->_lastApiConfig.port, this->_lastApiConfig.useSSL);
}

void Websocket::setMessageCallbackRaw(std::function<void(const char *, size_t)> callback)
{
    this->messageCallbackRaw = callback;
}

void Websocket::setBinaryDataCallback(std::function<void(esp_websocket_event_data_t)> callback)
{
    this->binaryDataCallback = callback;
}

void Websocket::enableConnectionAttempts()
{
    this->connectionAttemptsEnabled = true;
}

void Websocket::disableConnectionAttempts()
{
    this->connectionAttemptsEnabled = false;

    if (ws_client)
    {
        esp_websocket_client_destroy(ws_client);
        ws_client = nullptr;
    }

    setState(INIT);
}