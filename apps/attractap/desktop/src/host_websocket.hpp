#pragma once

#include "host_runtime.hpp"
#include "api/reader_transport.hpp"

#include <atomic>
#include <cstddef>
#include <functional>
#include <memory>
#include <mutex>
#include <queue>
#include <stop_token>
#include <string>
#include <thread>

class HostWebsocket : public IReaderTransport
{
public:
    enum class State
    {
        Disconnected,
        Connecting,
        Connected,
    };

    using MessageCallback = std::function<void(const char *, size_t)>;
    using StateCallback = std::function<void(State)>;
    using ErrorCallback = std::function<void(const std::string &)>;

    // Converts the configured HTTP(S) endpoint to the reader protocol endpoint.
    // The backend path is fixed so a profile cannot accidentally connect to another API.
    static std::string readerUrl(const std::string &endpoint);

    HostWebsocket(HostRuntime &runtime, std::string endpoint);
    ~HostWebsocket();

    HostWebsocket(const HostWebsocket &) = delete;
    HostWebsocket &operator=(const HostWebsocket &) = delete;

    void setMessageCallback(MessageCallback callback);
    void setStateCallback(StateCallback callback);
    void setErrorCallback(ErrorCallback callback);

    void start();
    void stop();
    bool send(const char *message, size_t length);
    bool send(const std::string &message) { return send(message.data(), message.size()); }

    void setup() override { start(); }
    void loop() override {}
    bool sendMessage(const char *message, size_t length) override { return send(message, length); }
    bool sendHeartbeat(const char *message, size_t length) override { return send(message, length); }
    void setMessageCallbackRaw(std::function<void(const char *, size_t)> callback) override { setMessageCallback(std::move(callback)); }
    void enableConnectionAttempts() override { start(); }
    void disableConnectionAttempts() override { stop(); }
    void forceReconnect(const char *) override { stop(); start(); }
    void resetCertificateTrust() override {}

private:
    static constexpr size_t MaxQueuedMessages = 64;
    static constexpr size_t MaxInboundMessageBytes = 1024 * 1024;

    void run(std::stop_token stopToken);
    void publishState(State state);
    void publishError(const std::string &message);
    void publishMessage(std::string message);

    HostRuntime &runtime;
    std::string url;
    std::mutex mutex;
    std::queue<std::string> outbound;
    MessageCallback messageCallback;
    StateCallback stateCallback;
    ErrorCallback errorCallback;
    std::shared_ptr<std::atomic_bool> callbackLifetime = std::make_shared<std::atomic_bool>(false);
    std::jthread worker;
};
