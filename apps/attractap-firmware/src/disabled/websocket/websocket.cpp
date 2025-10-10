#include "websocket.hpp"

void Websocket::setup()
{
    logger.info("Websocket setup");

    this->_certManager.begin();

    xTaskCreate(
        taskFn,
        "Websocket",
        10000,
        this,
        TASK_PRIORITY_WEBSOCKET,
        NULL);
}

void Websocket::taskFn(void *parameter)
{
    Websocket *websocket = (Websocket *)parameter;
    while (true)
    {
        websocket->loop();
        vTaskDelay(20 / portTICK_PERIOD_MS);
    }
}

void Websocket::loop()
{
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
        // Try to send any pending outgoing messages
        this->processOutgoingMessages();
        break;
    }
}

void Websocket::updateInfoFromAppState()
{
    uint32_t lastStateChangeTime = State::getLastStateChangeTime();
    if (lastKnownAppStateChangeTime >= lastStateChangeTime)
    {
        return;
    }

    lastKnownAppStateChangeTime = lastStateChangeTime;

    auto networkState = State::getNetworkState();
    this->network_is_connected = networkState.wifi_connected || networkState.ethernet_connected;
}

void Websocket::connectWebSocket()
{
    logger.info("connectWebSocket");

    if (!network_is_connected)
    {
        logger.info("connectWebSocket: network is not connected");
        setState(INIT);
        vTaskDelay(RECONNECT_INTERVAL_MS / portTICK_PERIOD_MS);
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
        vTaskDelay(RECONNECT_INTERVAL_MS / portTICK_PERIOD_MS);
        return;
    }

    String protocol = (serverPort == 443) ? "wss" : "ws";
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
            vTaskDelay(RECONNECT_INTERVAL_MS / portTICK_PERIOD_MS);
            return;
        }

        yield();
    }

    ws_client = esp_websocket_client_init(&websocket_cfg);
    if (!ws_client)
    {
        logger.error("Failed to initialize WebSocket client");
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
        logger.error((String("Failed to start WebSocket client: ") + esp_err_to_name(ret)).c_str());
        setState(INIT);
        vTaskDelay(RECONNECT_INTERVAL_MS / portTICK_PERIOD_MS);
        return;
    }

    logger.info("connectWebSocket: WebSocket started");
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
        vTaskDelay(RECONNECT_INTERVAL_MS / portTICK_PERIOD_MS);
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
        vTaskDelay(RECONNECT_INTERVAL_MS / portTICK_PERIOD_MS);
        break;
    }

    case WEBSOCKET_EVENT_DATA:
        if (data->op_code == 0x01)
        { // Text frame
            String message = String((char *)data->data_ptr, data->data_len);
            logger.debug(("Pushing incoming message to queue: " + message).c_str());

            State::pushIncomingWebsocketMessageToQueue(message);
        }
        else if (data->op_code == 0x02)
        { // Binary frame
            logger.debug(("Received binary data: " + String(data->data_len) + " bytes").c_str());

            logger.error("No binary data handler");
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

void Websocket::processOutgoingMessages()
{
    String message;
    if (!State::getNextOutgoingWebsocketMessage(message))
    {
        return;
    }

    logger.debug(("sendMessage: " + message).c_str());
    int ret = esp_websocket_client_send_text(ws_client, message.c_str(), message.length(), pdMS_TO_TICKS(5000));

    if (ret == -1)
    {
        logger.error("sendMessage: failed");
    }
}

void Websocket::setState(ConnectionState state)
{
    _state = state;

    State::setWebsocketState(state == CONNECTED, this->_lastApiConfig.hostname, this->_lastApiConfig.port, this->_lastApiConfig.useSSL);
}