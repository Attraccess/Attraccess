#pragma once

#include "host_runtime.hpp"
#include "api/reader_transport.hpp"

#include <atomic>
#include <cstddef>
#include <functional>
#include <memory>
#include <mutex>
#include <queue>
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

    explicit HostWebsocket(HostRuntime &runtime);
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
    void enableConnectionAttempts() override;
    void disableConnectionAttempts() override { stop(); }
    void forceReconnect(const char *) override { enableConnectionAttempts(); }
    void resetCertificateTrust() override {}
    void setSubprotocol(const std::string &subprotocol) override;
    bool sendBinary(const uint8_t *data, size_t length) override;
    void setRawBinaryCallback(std::function<bool(const uint8_t *, size_t)> callback) override;
    void setConnectionCallback(std::function<void(bool connected)> callback) override;

private:
    struct Outbound
    {
        std::string data;
        bool binary = false;
    };
    static constexpr size_t MaxQueuedMessages = 64;
    static constexpr size_t MaxInboundMessageBytes = 1024 * 1024;

    void run();
    void updateUrlFromSettings();
    void publishState(State state);
    void publishError(const std::string &message);
    void publishMessage(std::string message);
    void publishBinary(std::string data);
    void publishConnection(bool connected);
    bool enqueue(const char *data, size_t length, bool binary);

    HostRuntime &runtime;
    std::string url;
    std::mutex mutex;
    std::queue<Outbound> outbound;
    std::string subprotocol;
    MessageCallback messageCallback;
    std::function<bool(const uint8_t *, size_t)> rawBinaryCallback;
    std::function<void(bool)> connectionCallback;
    StateCallback stateCallback;
    ErrorCallback errorCallback;
    std::shared_ptr<std::atomic_bool> callbackLifetime = std::make_shared<std::atomic_bool>(false);
    std::atomic_bool stopRequested{false};
    std::atomic_bool wasConnected{false};
    std::thread worker;
};
