#include "websocket.hpp"
#include <functional>
#include "platform.hpp"
#include "esp_heap_caps.h"
#include "esp_system.h"
#include "settings/kvstore.hpp"
#include <cstdlib>
#include <cstring>
#include <string>

// Deliberate-reboot reason handed to the crash reporter across the SW reset (see
// api_diag.cpp). Lives in the same NVS namespace as the boot diagnostics record
// so the API layer can pick it up and attach it to the uploaded crash report.
#define BOOT_DIAG_NAMESPACE "bootdiag"
#define BOOT_DIAG_REBOOT_REASON_KEY "rebootreason"

void Websocket::connectWebSocket()
{
    // Runs on the ws_conn task only. Hold the lifecycle mutex for the whole
    // attempt so disableConnectionAttempts() cannot destroy the client handle
    // mid-connect.
    if (connect_lifecycle_mutex)
    {
        xSemaphoreTake(connect_lifecycle_mutex, portMAX_DELAY);
    }
    this->connectWebSocketLocked();
    if (connect_lifecycle_mutex)
    {
        xSemaphoreGive(connect_lifecycle_mutex);
    }
}

void Websocket::connectWebSocketLocked()
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
        return;
    }

    AttraccessApiConfig apiConfig = Settings::getAttraccessApiConfig();
    std::string serverHostname = apiConfig.hostname;
    uint16_t serverPort = apiConfig.port;

    if (serverHostname.empty() || serverPort == 0)
    {
        logger.error("connectWebSocket: serverHostname or serverPort is empty");
        setState(INIT);

        return;
    }

    const char *certPem = nullptr;
    int certIndex = -1;
    if (apiConfig.useSSL)
    {
        logger.info("connectWebSocket: using SSL");
        // A changed API address invalidates the locked certificate decision:
        // the lock only proves anything about the server it was made against.
        this->_certManager.ensureLockMatchesServer(serverHostname + ":" + std::to_string(serverPort));
        if (!this->_certManager.getCertificate(&certPem))
        {
            logger.error("Failed to get certificate");
            setState(INIT);
            return;
        }
        certIndex = this->_certManager.getCurrentCertIndex();
    }
    else
    {
        logger.info("connectWebSocket: non secure (no SSL)");
    }

    bool configMatchesClient =
        _lastApiConfig.hostname == apiConfig.hostname &&
        _lastApiConfig.port == apiConfig.port &&
        _lastApiConfig.useSSL == apiConfig.useSSL &&
        _clientCertIndex == certIndex;

    _lastApiConfig = apiConfig;
    setState(CONNECTING);

    lockWsClient();
    esp_websocket_client_handle_t existingClient = ws_client;
    unlockWsClient();

    if (existingClient && configMatchesClient)
    {
        logger.info("connectWebSocket: reusing existing client (stop+start)");
        esp_websocket_client_stop(existingClient);
        esp_err_t restartRet = esp_websocket_client_start(existingClient);
        if (restartRet == ESP_OK)
        {
            logger.info("connectWebSocket: WebSocket restarted");
            this->consecutiveConnectFailures = 0;
            return;
        }
        logger.error((std::string("Failed to restart WebSocket client: ") + esp_err_to_name(restartRet)).c_str());
    }

    lockWsClient();
    esp_websocket_client_handle_t oldClient = ws_client;
    ws_client = nullptr;
    unlockWsClient();
    if (oldClient)
    {
        esp_websocket_client_destroy(oldClient);
    }

    std::string protocol = (apiConfig.useSSL) ? "wss" : "ws";
    std::string wsUrl = protocol + "://" + serverHostname + ":" + std::to_string(serverPort) + "/api/attractap/websocket";
    logger.info(("Connecting to WebSocket: " + wsUrl).c_str());

    esp_websocket_client_config_t websocket_cfg = {};
    websocket_cfg.uri = wsUrl.c_str();
    websocket_cfg.port = serverPort;

    // Configure buffer sizes to prevent ENOBUFS errors
    // WebSocket event callbacks parse API payloads and invoke application
    // callbacks on this task. The 9.8 KB stack overflowed on the initial
    // resource-list payload after adding network-quality reporting.
    websocket_cfg.task_stack = 16384;
    websocket_cfg.buffer_size = 4096; // Increase buffer size (default is typically 1024)
    // Below the LVGL render task (prio 4): TLS work must not preempt UI refresh
    // (default was 5, unpinned) - ATT-554 item 7.
    websocket_cfg.task_prio = 3;

    websocket_cfg.ping_interval_sec = 5;
    websocket_cfg.pingpong_timeout_sec = PINGPONG_TIMEOUT_SEC;
    websocket_cfg.disable_pingpong_discon = false;
    // Bound unreachable-host retries: without network_timeout_ms the client
    // waits the full TCP connect timeout per attempt, which multiplies across
    // the cert sweep (PERFORMANCE_ANALYSIS.md quick win Q2).
    websocket_cfg.network_timeout_ms = 10000;

    websocket_cfg.disable_auto_reconnect = true;

    websocket_cfg.keep_alive_enable = true;
    websocket_cfg.keep_alive_idle = 5;
    websocket_cfg.keep_alive_interval = 5;
    websocket_cfg.keep_alive_count = 3;

    if (apiConfig.useSSL)
    {
        websocket_cfg.transport = WEBSOCKET_TRANSPORT_OVER_SSL;
        websocket_cfg.cert_pem = certPem;
    }

    _clientCertIndex = certIndex;

    esp_websocket_client_handle_t newClient = esp_websocket_client_init(&websocket_cfg);
    if (!newClient)
    {
        handleConnectFailure("esp_websocket_client_init returned null");
        return;
    }

    // Register event handler
    esp_websocket_register_events(newClient, WEBSOCKET_EVENT_ANY, websocket_event_handler, this);

    // Start connection
    esp_err_t ret = esp_websocket_client_start(newClient);
    if (ret != ESP_OK)
    {
        esp_websocket_client_destroy(newClient);
        handleConnectFailure((std::string("esp_websocket_client_start: ") + esp_err_to_name(ret)).c_str());
        return;
    }

    lockWsClient();
    ws_client = newClient;
    unlockWsClient();

    this->consecutiveConnectFailures = 0;
    logger.info("connectWebSocket: WebSocket started");
}
