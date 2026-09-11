#include "host_websocket.hpp"
#include "logger/logger.hpp"
#include "settings/settings.hpp"

#include <curl/curl.h>

#include <array>
#include <chrono>
#include <stdexcept>
#include <utility>

namespace
{
Logger logger("HostWebsocket");

void initializeCurl()
{
    static std::once_flag initialized;
    std::call_once(initialized, []
                   {
                       if (curl_global_init(CURL_GLOBAL_DEFAULT) != CURLE_OK)
                           throw std::runtime_error("Could not initialize the host WebSocket transport");
                   });
}

bool isWebsocketFrame(const curl_ws_frame *frame)
{
    return frame != nullptr && (frame->flags & CURLWS_TEXT) != 0;
}

int cancelWhenStopping(void *client, curl_off_t, curl_off_t, curl_off_t, curl_off_t)
{
    return static_cast<std::stop_token *>(client)->stop_requested() ? 1 : 0;
}
}

std::string HostWebsocket::readerUrl(const std::string &endpoint)
{
    const auto schemeEnd = endpoint.find("://");
    if (schemeEnd == std::string::npos)
        throw std::invalid_argument("Reader endpoint must include http, https, ws, or wss scheme");

    const std::string scheme = endpoint.substr(0, schemeEnd);
    std::string websocketScheme;
    if (scheme == "http" || scheme == "ws")
        websocketScheme = "ws";
    else if (scheme == "https" || scheme == "wss")
        websocketScheme = "wss";
    else
        throw std::invalid_argument("Reader endpoint must use http, https, ws, or wss");

    const auto authorityStart = schemeEnd + 3;
    const auto authorityEnd = endpoint.find_first_of("/?#", authorityStart);
    if (authorityStart == endpoint.size() || authorityStart == authorityEnd || endpoint.find('@', authorityStart) < authorityEnd)
        throw std::invalid_argument("Reader endpoint must contain a host and no credentials");

    return websocketScheme + "://" + endpoint.substr(authorityStart, authorityEnd - authorityStart) + "/api/attractap/websocket";
}

HostWebsocket::HostWebsocket(HostRuntime &runtime)
    : runtime(runtime)
{
    initializeCurl();
    updateUrlFromSettings();
}

HostWebsocket::~HostWebsocket()
{
    stop();
}

void HostWebsocket::setMessageCallback(MessageCallback callback)
{
    std::lock_guard lock(mutex);
    messageCallback = std::move(callback);
}

void HostWebsocket::setStateCallback(StateCallback callback)
{
    std::lock_guard lock(mutex);
    stateCallback = std::move(callback);
}

void HostWebsocket::setErrorCallback(ErrorCallback callback)
{
    std::lock_guard lock(mutex);
    errorCallback = std::move(callback);
}

void HostWebsocket::start()
{
    if (worker.joinable())
        return;
    {
        std::lock_guard lock(mutex);
        callbackLifetime = std::make_shared<std::atomic_bool>(true);
    }
    worker = std::jthread([this](std::stop_token stopToken) { run(stopToken); });
}

void HostWebsocket::stop()
{
    if (!worker.joinable())
        return;
    {
        std::lock_guard lock(mutex);
        callbackLifetime->store(false);
    }
    worker.request_stop();
    worker.join();

    StateCallback callback;
    {
        std::lock_guard lock(mutex);
        callback = stateCallback;
    }
    if (callback)
        runtime.post([callback = std::move(callback)] { callback(State::Disconnected); });
}

void HostWebsocket::enableConnectionAttempts()
{
    stop();
    updateUrlFromSettings();
    start();
}

void HostWebsocket::updateUrlFromSettings()
{
    const auto config = Settings::getAttraccessApiConfig();
    const std::string endpoint = config.hostname.find("://") == std::string::npos
                                     ? std::string(config.useSSL ? "https://" : "http://") + config.hostname + ":" + std::to_string(config.port)
                                     : config.hostname;
    std::lock_guard lock(mutex);
    url = readerUrl(endpoint);
}

bool HostWebsocket::send(const char *message, size_t length)
{
    if (message == nullptr || length == 0)
        return false;

    std::lock_guard lock(mutex);
    if (outbound.size() == MaxQueuedMessages)
        return false;
    outbound.emplace(message, length);
    return true;
}

void HostWebsocket::publishState(State state)
{
    StateCallback callback;
    std::shared_ptr<std::atomic_bool> lifetime;
    {
        std::lock_guard lock(mutex);
        callback = stateCallback;
        lifetime = callbackLifetime;
    }
    if (callback)
        runtime.post([callback = std::move(callback), lifetime = std::move(lifetime), state]
                     {
                         if (lifetime->load())
                             callback(state);
                     });
}

void HostWebsocket::publishError(const std::string &message)
{
    logger.error(message.c_str());
    ErrorCallback callback;
    std::shared_ptr<std::atomic_bool> lifetime;
    {
        std::lock_guard lock(mutex);
        callback = errorCallback;
        lifetime = callbackLifetime;
    }
    if (callback)
        runtime.post([callback = std::move(callback), lifetime = std::move(lifetime), message]
                     {
                         if (lifetime->load())
                             callback(message);
                     });
}

void HostWebsocket::publishMessage(std::string message)
{
    MessageCallback callback;
    std::shared_ptr<std::atomic_bool> lifetime;
    {
        std::lock_guard lock(mutex);
        callback = messageCallback;
        lifetime = callbackLifetime;
    }
    if (callback)
        runtime.post([callback = std::move(callback), lifetime = std::move(lifetime), message = std::move(message)]
                     {
                         if (lifetime->load())
                             callback(message.data(), message.size());
                     });
}

void HostWebsocket::run(std::stop_token stopToken)
{
    using namespace std::chrono_literals;
    std::chrono::seconds reconnectDelay{1};

    while (!stopToken.stop_requested())
    {
        publishState(State::Connecting);
        CURL *connection = curl_easy_init();
        if (connection == nullptr)
        {
            publishError("Could not create host WebSocket connection");
            return;
        }

        curl_easy_setopt(connection, CURLOPT_URL, url.c_str());
        curl_easy_setopt(connection, CURLOPT_CONNECT_ONLY, 2L);
        curl_easy_setopt(connection, CURLOPT_CONNECTTIMEOUT_MS, 5000L);
        curl_easy_setopt(connection, CURLOPT_NOPROGRESS, 0L);
        curl_easy_setopt(connection, CURLOPT_XFERINFOFUNCTION, cancelWhenStopping);
        curl_easy_setopt(connection, CURLOPT_XFERINFODATA, &stopToken);
        // TLS verification is deliberately explicit: a simulator must never weaken reader authentication.
        curl_easy_setopt(connection, CURLOPT_SSL_VERIFYPEER, 1L);
        curl_easy_setopt(connection, CURLOPT_SSL_VERIFYHOST, 2L);
        const CURLcode connected = curl_easy_perform(connection);
        if (connected != CURLE_OK)
        {
            if (!stopToken.stop_requested())
                publishError(curl_easy_strerror(connected));
            curl_easy_cleanup(connection);
            for (auto slept = 0ms; slept < reconnectDelay && !stopToken.stop_requested(); slept += 100ms)
                std::this_thread::sleep_for(100ms);
            reconnectDelay = std::min(reconnectDelay * 2, 30s);
            continue;
        }

        reconnectDelay = 1s;
        publishState(State::Connected);
        std::string inbound;
        bool inboundIsText = false;
        std::array<char, 4096> buffer{};
        bool open = true;
        while (open && !stopToken.stop_requested())
        {
            std::string outboundMessage;
            {
                std::lock_guard lock(mutex);
                if (!outbound.empty())
                {
                    outboundMessage = std::move(outbound.front());
                    outbound.pop();
                }
            }
            if (!outboundMessage.empty())
            {
                size_t offset = 0;
                while (offset < outboundMessage.size() && !stopToken.stop_requested())
                {
                    size_t sent = 0;
                    const CURLcode sentResult = curl_ws_send(connection, outboundMessage.data() + offset,
                                                             outboundMessage.size() - offset, &sent, 0, CURLWS_TEXT);
                    offset += sent;
                    if (sentResult == CURLE_AGAIN)
                    {
                        std::this_thread::sleep_for(10ms);
                        continue;
                    }
                    if (sentResult != CURLE_OK)
                    {
                        publishError(curl_easy_strerror(sentResult));
                        open = false;
                        break;
                    }
                    if (sent == 0)
                    {
                        publishError("WebSocket send made no progress");
                        open = false;
                        break;
                    }
                }
                if (!open)
                    continue;
            }

            size_t received = 0;
            const curl_ws_frame *frame = nullptr;
            const CURLcode receivedResult = curl_ws_recv(connection, buffer.data(), buffer.size(), &received, &frame);
            if (receivedResult == CURLE_AGAIN)
            {
                std::this_thread::sleep_for(10ms);
                continue;
            }
            if (receivedResult != CURLE_OK || frame == nullptr || (frame->flags & CURLWS_CLOSE) != 0)
            {
                if (receivedResult != CURLE_OK)
                    publishError(curl_easy_strerror(receivedResult));
                open = false;
                continue;
            }
            if ((frame->flags & (CURLWS_PING | CURLWS_PONG)) != 0)
                continue;
            if (inbound.empty())
                inboundIsText = isWebsocketFrame(frame);
            if (!inboundIsText)
            {
                publishError("Host WebSocket transport does not accept binary frames");
                open = false;
                continue;
            }

            if (received > MaxInboundMessageBytes - inbound.size())
            {
                publishError("Host WebSocket message exceeds the maximum size");
                open = false;
                continue;
            }
            inbound.append(buffer.data(), received);
            if (frame->bytesleft == 0 && (frame->flags & CURLWS_CONT) == 0)
            {
                publishMessage(std::move(inbound));
                inbound.clear();
                inboundIsText = false;
            }
        }

        curl_easy_cleanup(connection);
        publishState(State::Disconnected);
        for (auto slept = 0ms; slept < reconnectDelay && !stopToken.stop_requested(); slept += 100ms)
            std::this_thread::sleep_for(100ms);
        reconnectDelay = std::min(reconnectDelay * 2, 30s);
    }
}
