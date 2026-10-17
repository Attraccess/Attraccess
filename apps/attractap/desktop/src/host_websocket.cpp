#include "host_websocket.hpp"
#include "logger/logger.hpp"
#include "settings/settings.hpp"

#include <curl/curl.h>

#include <algorithm>
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
    stopRequested.store(false);
    worker = std::thread([this] { run(); });
}

void HostWebsocket::stop()
{
    if (!worker.joinable())
        return;
    {
        std::lock_guard lock(mutex);
        callbackLifetime->store(false);
    }
    stopRequested.store(true);
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
