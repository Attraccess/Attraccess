#include "reader_link.hpp"

#include <cstring>

#include "../../platform.hpp"
#include "../../settings/settings.hpp"
#include "../../state/state.hpp"
#include "mbedtls/platform_util.h"

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#endif

namespace
{
    constexpr uint32_t CHANNEL_SWITCH_DELAY_MS = 0;

    const char *channelName(ReaderLink::Channel channel)
    {
        switch (channel)
        {
        case ReaderLink::Channel::Legacy:
            return "token";
        case ReaderLink::Channel::Pairing:
            return "pairing";
        case ReaderLink::Channel::Session:
        default:
            return "session";
        }
    }

    const char *subprotocolFor(ReaderLink::Channel channel)
    {
        switch (channel)
        {
        case ReaderLink::Channel::Pairing:
            return SessionFraming::PAIRING_SUBPROTOCOL;
        case ReaderLink::Channel::Session:
            return SessionFraming::SESSION_SUBPROTOCOL;
        case ReaderLink::Channel::Legacy:
        default:
            return "";
        }
    }
}

ReaderLink::ReaderLink(IReaderTransport &socket, Options options)
    : socket(socket), options(std::move(options)), logger("ReaderLink")
{
}

void ReaderLink::setup()
{
    loadIdentity();
    timeFloor = TimeFloor(CredentialStore::timeFloorSeconds());

    // A reader with credentials only ever uses the session; one with a token keeps signing in
    // with it until an admin pairs it; everything else asks to be paired.
    if (credentials.paired())
    {
        channel = Channel::Session;
    }
    else if (!Settings::getAttraccessAuthConfig().apiKey.empty())
    {
        channel = Channel::Legacy;
    }
    else
    {
        channel = Channel::Pairing;
    }
    logger.infof("Reader channel: %s", channelName(channel.load()));

    socket.setMessageCallbackRaw([this](const char *data, size_t length) {
        // The token channel keeps its old threading: the API handles messages where they arrive.
        if (channel == Channel::Legacy)
        {
            if (appMessage)
            {
                appMessage(data, length);
            }
            return;
        }
        post(EventType::Text, std::string(data, length));
    });
    socket.setRawBinaryCallback([this](const uint8_t *data, size_t length) {
        if (channel != Channel::Session)
        {
            return false;
        }
        post(EventType::Binary, std::string(reinterpret_cast<const char *>(data), length));
        return true;
    });
    socket.setConnectionCallback([this](bool isConnected) {
        post(isConnected ? EventType::Connected : EventType::Disconnected);
    });
    socket.setSubprotocol(subprotocolFor(channel));
    socket.setup();
}

bool ReaderLink::loadIdentity()
{
    credentials = CredentialStore::load();
    if (credentials.hasKey())
    {
        key = SoftwareReaderKey::fromPrivateKey(credentials.privateKey.data(), credentials.privateKey.size());
        mbedtls_platform_zeroize(credentials.privateKey.data(), credentials.privateKey.size());
        if (key)
        {
            return true;
        }
        logger.error("Stored reader key is unusable, creating a new identity");
    }
    return newIdentity();
}

bool ReaderLink::newIdentity()
{
    key = SoftwareReaderKey::generate();
    std::vector<uint8_t> scalar;
    if (!key || !key->exportPrivateKey(scalar) || !CredentialStore::saveNewKey(scalar))
    {
        mbedtls_platform_zeroize(scalar.data(), scalar.size());
        logger.error("Could not create the reader identity");
        return false;
    }
    mbedtls_platform_zeroize(scalar.data(), scalar.size());
    credentials = CredentialStore::load();
    mbedtls_platform_zeroize(credentials.privateKey.data(), credentials.privateKey.size());
    logger.info("Created a new reader identity");
    return true;
}

void ReaderLink::post(EventType type, std::string data)
{
    std::lock_guard<std::mutex> lock(eventsMutex);
    events.push_back({type, std::move(data), generation});
}

void ReaderLink::loop()
{
    socket.loop();

    std::deque<Event> pending;
    uint32_t currentGeneration;
    {
        std::lock_guard<std::mutex> lock(eventsMutex);
        pending.swap(events);
        currentGeneration = generation;
    }
    for (const Event &event : pending)
    {
        // Frames of a connection that belonged to the previous channel are meaningless now.
        if (event.generation == currentGeneration || event.type == EventType::StartPairing)
        {
            handle(event);
        }
    }

    if (holding && static_cast<int32_t>(millis() - holdUntilMs) >= 0)
    {
        holding = false;
        if (attemptsEnabled)
        {
            socket.enableConnectionAttempts();
        }
    }

    if (channel == Channel::Session && connected && handshakeStartedMs != 0 &&
        millis() - handshakeStartedMs > HANDSHAKE_TIMEOUT_MS)
    {
        std::lock_guard<std::mutex> lock(sessionMutex);
        if (tls.status() == SessionTls::Status::Handshaking)
        {
            logger.error("Session handshake timed out");
            handshakeStartedMs = 0;
            tls.close();
            socket.forceReconnect("session handshake timeout");
        }
    }
}

void ReaderLink::handle(const Event &event)
{
    switch (event.type)
    {
    case EventType::StartPairing:
        if (channel == Channel::Legacy)
        {
            pairingTicket = event.data;
            pairingFromToken = !Settings::getAttraccessAuthConfig().apiKey.empty();
            useChannel(Channel::Pairing, event.data.empty() ? "no credentials" : "admin started pairing");
        }
        return;
    case EventType::Connected:
        connected = true;
        if (channel == Channel::Session)
        {
            onSessionConnected();
        }
        else if (channel == Channel::Pairing)
        {
            onPairingConnected();
        }
        return;
    case EventType::Disconnected:
        connected = false;
        handshakeStartedMs = 0;
        if (channel == Channel::Session)
        {
            std::lock_guard<std::mutex> lock(sessionMutex);
            tls.close();
            outbox.clear();
            // The sign-in belonged to that session; the next one authenticates again.
            State::setApiState(false, "");
        }
        else if (channel == Channel::Pairing && pairing)
        {
            onPairingEnded(pairing->onDisconnected());
        }
        return;
    case EventType::Text:
        if (channel == Channel::Pairing)
        {
            onPairingText(event.data);
        }
        else if (channel == Channel::Session)
        {
            // A session speaks TLS bytes only.
            logger.error("Text frame on the session channel, reconnecting");
            socket.forceReconnect("text frame in session");
        }
        return;
    case EventType::Binary:
        if (channel == Channel::Session)
        {
            onSessionBytes(event.data);
        }
        return;
    }
}

void ReaderLink::useChannel(Channel next, const char *reason)
{
    logger.infof("Switching to the %s channel (%s)", channelName(next), reason);
    {
        std::lock_guard<std::mutex> lock(eventsMutex);
        generation++;
    }
    {
        std::lock_guard<std::mutex> lock(sessionMutex);
        tls.close();
        outbox.clear();
    }
    pairing.reset();
    connected = false;
    handshakeStartedMs = 0;
    untrusted = false;
    State::setApiState(false, "");
    channel = next;
    socket.setSubprotocol(subprotocolFor(next));
    reconnectAfter(CHANNEL_SWITCH_DELAY_MS);
}

void ReaderLink::reconnectAfter(uint32_t delayMs)
{
    if (delayMs == 0)
    {
        socket.forceReconnect("reader channel");
        return;
    }
    // Hold the connection down: the server's limits are per address.
    socket.disableConnectionAttempts();
    holding = true;
    holdUntilMs = millis() + delayMs;
}

// --- API side --------------------------------------------------------------------------------

void ReaderLink::setMessageCallbackRaw(std::function<void(const char *, size_t)> callback)
{
    appMessage = std::move(callback);
}

#ifdef ESP_PLATFORM
void ReaderLink::setBinaryDataCallback(std::function<void(esp_websocket_event_data_t)> callback)
{
    appBinary = callback;
    // Token channel: OTA chunks arrive as plain binary frames, exactly as before.
    socket.setBinaryDataCallback(std::move(callback));
}
#endif

bool ReaderLink::sendMessage(const char *message, size_t length)
{
    switch (channel)
    {
    case Channel::Legacy:
        return socket.sendMessage(message, length);
    case Channel::Session:
    {
        std::lock_guard<std::mutex> lock(sessionMutex);
        return tls.sendFrame(SessionFraming::FrameType::JSON, reinterpret_cast<const uint8_t *>(message), length) &&
               flushOutbox();
    }
    case Channel::Pairing:
    default:
        // Nothing of the API leaves a reader that is not paired.
        return false;
    }
}

bool ReaderLink::sendHeartbeat(const char *message, size_t length)
{
    switch (channel)
    {
    case Channel::Legacy:
        return socket.sendHeartbeat(message, length);
    case Channel::Session:
    {
        std::lock_guard<std::mutex> lock(sessionMutex);
        return tls.sendFrame(SessionFraming::FrameType::HEARTBEAT, nullptr, 0) && flushOutbox();
    }
    case Channel::Pairing:
    default:
        return false;
    }
}

void ReaderLink::enableConnectionAttempts()
{
    attemptsEnabled = true;
    if (!holding)
    {
        socket.enableConnectionAttempts();
    }
}

void ReaderLink::disableConnectionAttempts()
{
    attemptsEnabled = false;
    socket.disableConnectionAttempts();
}

void ReaderLink::forceReconnect(const char *reason)
{
    socket.forceReconnect(reason);
}

void ReaderLink::startPairing(const std::string &ticket)
{
    // May be called from the transport task (token channel): handled on the main loop.
    post(EventType::StartPairing, ticket);
}

bool ReaderLink::sessionOpen() const
{
    std::lock_guard<std::mutex> lock(sessionMutex);
    return tls.open();
}

// --- pairing channel -------------------------------------------------------------------------

void ReaderLink::onPairingConnected()
{
    if (!key)
    {
        return;
    }
#ifdef ESP_PLATFORM
    logger.infof("Pairing connection open; heap internal: free=%u min=%u",
                 (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
                 (unsigned)heap_caps_get_minimum_free_size(MALLOC_CAP_INTERNAL));
#endif
    pairing.reset(new PairingClient(*key, options.lite, options.firmware));
    // A ticket is single-use: a later request of this reader is unbound.
    const std::string ticket = pairingTicket;
    pairingTicket.clear();
    pairing->start(ticket, [this](const std::string &text) { return socket.sendMessage(text.data(), text.size()); });
}

void ReaderLink::onPairingText(const std::string &text)
{
    if (!pairing)
    {
        return;
    }
    onPairingEnded(pairing->onMessage(text.data(), text.size()));
}

void ReaderLink::onPairingEnded(PairingClient::Outcome outcome)
{
    if (outcome == PairingClient::Outcome::Accepted)
    {
        const std::vector<uint8_t> caSpki = pairing->serverPublicKey();
        if (!CredentialStore::savePin(caSpki))
        {
            logger.error("Could not store the installation key");
            reconnectAfter(PairingClient::RETRY_AFTER_ERROR_MS);
            return;
        }
        credentials.caSpki = caSpki;
        // The server deleted the token with the approval; a paired reader never uses it again.
        Settings::clearAttraccessAuthConfig();
        pairingFromToken = false;
        useChannel(Channel::Session, "pairing approved");
        return;
    }
    if (outcome != PairingClient::Outcome::Retry)
    {
        return;
    }
    const uint32_t delay = pairing->retryDelayMs();
    pairing.reset();
    if (pairingFromToken && !Settings::getAttraccessAuthConfig().apiKey.empty())
    {
        // An admin-started pairing that did not complete: keep working with the token.
        pairingFromToken = false;
        State::clearEnrollment();
        useChannel(Channel::Legacy, "pairing did not complete");
        return;
    }
    reconnectAfter(delay);
}
