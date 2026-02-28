#if defined(CONFIG_IDF_TARGET_ESP32P4)

#include "websocket_p4.hpp"
#include "mbedtls/sha1.h"
#include "mbedtls/base64.h"
#include <cstring>
#include <time.h>

static void generateWebSocketKey(char *out, size_t outLen)
{
    uint8_t raw[16];
    for (int i = 0; i < 16; i++)
    {
        raw[i] = (uint8_t)random(256);
    }
    size_t olen;
    mbedtls_base64_encode((unsigned char *)out, outLen, &olen, raw, 16);
    out[olen] = '\0';
}

static String computeAcceptKey(const char *clientKey)
{
    const char *guid = "258EAFA5-E914-47DA-95CA-C5AB0DC41111";
    char combined[128];
    snprintf(combined, sizeof(combined), "%s%s", clientKey, guid);

    uint8_t hash[20];
    mbedtls_sha1((const unsigned char *)combined, strlen(combined), hash);

    char b64[32];
    size_t olen;
    mbedtls_base64_encode((unsigned char *)b64, sizeof(b64), &olen, hash, 20);
    b64[olen] = '\0';
    return String(b64);
}

static bool hasValidSystemTime()
{
    // Require wall clock to be reasonably recent before certificate validation.
    // Jan 1, 2021 UTC = 1609459200
    return time(nullptr) >= 1609459200;
}

void Websocket::setup()
{
    logger.info("Websocket setup (P4 native)");
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
        pollReceive();
        break;
    }
}

void Websocket::updateInfoFromAppState()
{
    auto networkState = State::getNetworkState();
    this->network_is_connected = networkState.wifi_connected || networkState.ethernet_connected;
}

void Websocket::disconnect()
{
    handshakeDone = false;
    rxBufLen = 0;
    if (tcpClientSecure)
    {
        tcpClientSecure->stop();
        delete tcpClientSecure;
        tcpClientSecure = nullptr;
    }
    if (tcpClient)
    {
        tcpClient->stop();
        delete tcpClient;
        tcpClient = nullptr;
    }
    setState(INIT);
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

    logger.info("connectWebSocket (P4)");

    if (!network_is_connected)
    {
        logger.info("connectWebSocket: network is not connected");
        setState(INIT);
        return;
    }

    AttraccessApiConfig apiConfig = Settings::getAttraccessApiConfig();
    _lastApiConfig = apiConfig;
    setState(CONNECTING);

    disconnect();

    String serverHostname = apiConfig.hostname;
    uint16_t serverPort = apiConfig.port;

    if (serverHostname.isEmpty() || serverPort == 0)
    {
        logger.error("connectWebSocket: serverHostname or serverPort is empty");
        setState(INIT);
        return;
    }

    useSSL = apiConfig.useSSL;
    if (useSSL)
    {
        if (!hasValidSystemTime())
        {
            logger.warn("TLS connect deferred: system time not synced yet");
            setState(INIT);
            return;
        }

        logger.info("connectWebSocket: using SSL");
        tcpClientSecure = new WiFiClientSecure();
        const char *certData = nullptr;
        if (!this->_certManager.getCertificate(&certData) || !certData)
        {
            logger.error("Failed to get certificate");
            delete tcpClientSecure;
            tcpClientSecure = nullptr;
            setState(INIT);
            return;
        }
        tcpClientSecure->setCACert(certData);
        tcpClientSecure->setHandshakeTimeout(10);

        if (!tcpClientSecure->connect(serverHostname.c_str(), serverPort, 10000))
        {
            char errBuf[128] = {0};
            int tlsErr = tcpClientSecure->lastError(errBuf, sizeof(errBuf));
            logger.errorf("TLS connect failed (err=%d: %s)", tlsErr, errBuf);
            // Rotate certificates only when wall clock is valid, otherwise
            // failures are likely due to missing SNTP sync.
            bool certValidationFailed =
                tlsErr <= 0 && strstr(errBuf, "X509") != nullptr;
            if (hasValidSystemTime() && certValidationFailed)
            {
                this->_certManager.markFailure();
            }
            delete tcpClientSecure;
            tcpClientSecure = nullptr;
            setState(INIT);
            return;
        }
    }
    else
    {
        logger.info("connectWebSocket: non secure (no SSL)");
        tcpClient = new WiFiClient();
        if (!tcpClient->connect(serverHostname.c_str(), serverPort, 10000))
        {
            logger.error("TCP connect failed");
            delete tcpClient;
            tcpClient = nullptr;
            setState(INIT);
            return;
        }
    }

    String path = "/api/attractap/websocket";
    String wsUrl = (useSSL ? "wss" : "ws") + String("://") + serverHostname + ":" + String(serverPort) + path;
    logger.info(("Connecting to WebSocket: " + wsUrl).c_str());

    if (!performHandshake())
    {
        disconnect();
        return;
    }

    if (useSSL)
    {
        this->_certManager.markSuccess();
    }
    handshakeDone = true;
    setState(CONNECTED);
    logger.info("WebSocket connected (P4)");
}

bool Websocket::performHandshake()
{
    char keyBuf[32];
    generateWebSocketKey(keyBuf, sizeof(keyBuf));
    String acceptKey = computeAcceptKey(keyBuf);

    String hostHeader = _lastApiConfig.hostname;
    if ((_lastApiConfig.useSSL && _lastApiConfig.port != 443) || (!_lastApiConfig.useSSL && _lastApiConfig.port != 80))
    {
        hostHeader += ":" + String(_lastApiConfig.port);
    }

    String req = "GET /api/attractap/websocket HTTP/1.1\r\n";
    req += "Host: " + hostHeader + "\r\n";
    req += "Upgrade: websocket\r\n";
    req += "Connection: Upgrade\r\n";
    req += "Sec-WebSocket-Key: " + String(keyBuf) + "\r\n";
    req += "Sec-WebSocket-Version: 13\r\n";
    req += "\r\n";

    bool ok = false;
    if (tcpClientSecure)
    {
        ok = (tcpClientSecure->write((const uint8_t *)req.c_str(), req.length()) == (int)req.length());
    }
    else if (tcpClient)
    {
        ok = (tcpClient->write((const uint8_t *)req.c_str(), req.length()) == (int)req.length());
    }

    if (!ok)
    {
        logger.error("Handshake send failed");
        return false;
    }

    // Read response
    String response;
    unsigned long deadline = millis() + 5000;
    while (millis() < deadline)
    {
        int c = -1;
        if (tcpClientSecure)
            c = tcpClientSecure->read();
        else if (tcpClient)
            c = tcpClient->read();
        if (c >= 0)
        {
            response += (char)c;
            if (response.endsWith("\r\n\r\n"))
                break;
            if (response.length() > 4096)
            {
                logger.error("Handshake response too long");
                return false;
            }
        }
        else
        {
            delay(1);
        }
    }

    if (!response.startsWith("HTTP/1.1 101"))
    {
        logger.error(("Handshake failed: " + response.substring(0, 80)).c_str());
        return false;
    }

    String responseLower = response;
    responseLower.toLowerCase();
    if (responseLower.indexOf("sec-websocket-accept:") < 0)
    {
        logger.error("Missing Sec-WebSocket-Accept");
        return false;
    }

    return true;
}

bool Websocket::sendFrame(uint8_t opcode, const uint8_t *payload, size_t len)
{
    uint8_t header[14];
    size_t headerLen = 2;
    header[0] = 0x80 | (opcode & 0x0F);

    if (len < 126)
    {
        header[1] = (uint8_t)len;
    }
    else if (len < 65536)
    {
        header[1] = 126;
        header[2] = (len >> 8) & 0xFF;
        header[3] = len & 0xFF;
        headerLen = 4;
    }
    else
    {
        header[1] = 127;
        for (int i = 0; i < 8; i++)
            header[2 + i] = (len >> (56 - i * 8)) & 0xFF;
        headerLen = 10;
    }

    // Client must mask; use simple mask
    uint8_t mask[4] = {(uint8_t)random(256), (uint8_t)random(256), (uint8_t)random(256), (uint8_t)random(256)};
    header[1] |= 0x80;
    memcpy(header + headerLen, mask, 4);
    headerLen += 4;

    bool ok = false;
    if (tcpClientSecure)
    {
        ok = (tcpClientSecure->write(header, headerLen) == (int)headerLen);
        if (ok && len > 0)
        {
            uint8_t *masked = (uint8_t *)malloc(len);
            if (masked)
            {
                for (size_t i = 0; i < len; i++)
                    masked[i] = payload[i] ^ mask[i % 4];
                ok = (tcpClientSecure->write(masked, len) == (int)len);
                free(masked);
            }
            else
                ok = false;
        }
    }
    else if (tcpClient)
    {
        ok = (tcpClient->write(header, headerLen) == (int)headerLen);
        if (ok && len > 0)
        {
            uint8_t *masked = (uint8_t *)malloc(len);
            if (masked)
            {
                for (size_t i = 0; i < len; i++)
                    masked[i] = payload[i] ^ mask[i % 4];
                ok = (tcpClient->write(masked, len) == (int)len);
                free(masked);
            }
            else
                ok = false;
        }
    }
    return ok;
}

void Websocket::pollReceive()
{
    bool secure = (tcpClientSecure != nullptr);
    WiFiClient *client = secure ? (WiFiClient *)tcpClientSecure : tcpClient;
    if (!client || !client->connected())
    {
        logger.info("WebSocket disconnected (P4)");
        if (_lastApiConfig.useSSL)
        {
            this->_certManager.markFailure();
        }
        disconnect();
        return;
    }

    while (client->available() > 0)
    {
        int c = client->read();
        if (c < 0)
            break;
        if (rxBufLen < RX_BUF_SIZE)
        {
            rxBuf[rxBufLen++] = (uint8_t)c;
        }
        if (rxBufLen >= 2 && !parseFrame())
        {
            break;
        }
    }
}

bool Websocket::parseFrame()
{
    if (rxBufLen < 2)
        return true;

    uint8_t opcode = rxBuf[0] & 0x0F;
    bool fin = (rxBuf[0] & 0x80) != 0;
    bool masked = (rxBuf[1] & 0x80) != 0;
    uint64_t payloadLen = rxBuf[1] & 0x7F;

    size_t headerLen = 2;
    if (payloadLen == 126)
    {
        if (rxBufLen < 4)
            return true;
        payloadLen = ((uint64_t)rxBuf[2] << 8) | rxBuf[3];
        headerLen = 4;
    }
    else if (payloadLen == 127)
    {
        if (rxBufLen < 10)
            return true;
        payloadLen = 0;
        for (int i = 0; i < 8; i++)
            payloadLen = (payloadLen << 8) | rxBuf[2 + i];
        headerLen = 10;
    }

    size_t maskOffset = 0;
    if (masked)
    {
        maskOffset = headerLen;
        headerLen += 4;
    }

    size_t totalNeeded = headerLen + payloadLen;
    if (totalNeeded > RX_BUF_SIZE)
    {
        logger.error("WebSocket frame too large");
        rxBufLen = 0;
        return false;
    }
    if (rxBufLen < totalNeeded)
        return true;

    // Unmask payload if present (server->client is unmasked per RFC, but some servers send masked)
    uint8_t *payload = rxBuf + headerLen;
    if (masked && maskOffset + 4 <= rxBufLen)
    {
        uint8_t mask[4] = {rxBuf[maskOffset], rxBuf[maskOffset + 1], rxBuf[maskOffset + 2], rxBuf[maskOffset + 3]};
        for (size_t i = 0; i < payloadLen; i++)
        {
            payload[i] ^= mask[i % 4];
        }
    }

    if (opcode == 0x01)
    {
        if (messageCallbackRaw)
        {
            messageCallbackRaw((const char *)payload, (size_t)payloadLen);
        }
    }
    else if (opcode == 0x02)
    {
        if (binaryDataCallback)
        {
            esp_websocket_event_data_t data = {};
            data.data_ptr = payload;
            data.data_len = (int)payloadLen;
            data.payload_len = payloadLen;
            data.payload_offset = 0;
            data.op_code = 0x02;
            binaryDataCallback(data);
        }
    }
    else if (opcode == 0x08)
    {
        logger.info("WebSocket close frame");
        disconnect();
        return false;
    }
    else if (opcode == 0x09)
    {
        // Ping - respond with pong (simplified: same payload)
        sendFrame(0x0A, payload, payloadLen);
    }

    memmove(rxBuf, rxBuf + totalNeeded, rxBufLen - totalNeeded);
    rxBufLen -= totalNeeded;
    return true;
}

bool Websocket::shouldReconnect()
{
    return millis() - this->lastReconnectAttemptTime >= this->RECONNECT_INTERVAL_MS;
}

void Websocket::sendMessage(const String &message)
{
    this->logger.debug(("sendMessage: " + message).c_str());
    if (_state != CONNECTED)
    {
        logger.error("sendMessage: not connected");
        return;
    }
    if (!sendFrame(0x01, (const uint8_t *)message.c_str(), message.length()))
    {
        logger.error("sendMessage: failed");
    }
}

void Websocket::sendMessage(const char *message, size_t length)
{
    if (_state != CONNECTED)
    {
        logger.error("sendMessage(raw): not connected");
        return;
    }
    if (!sendFrame(0x01, (const uint8_t *)message, length))
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
    disconnect();
}

#endif // CONFIG_IDF_TARGET_ESP32P4
