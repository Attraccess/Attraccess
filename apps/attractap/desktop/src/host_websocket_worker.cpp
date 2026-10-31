#include "host_websocket.hpp"
#include <curl/curl.h>
#include <array>
#include <algorithm>
#include <chrono>

namespace
{
bool isWebsocketFrame(const curl_ws_frame *frame)
{
    return frame != nullptr && (frame->flags & CURLWS_TEXT) != 0;
}

int cancelWhenStopping(void *client, curl_off_t, curl_off_t, curl_off_t, curl_off_t)
{
    return static_cast<std::atomic_bool *>(client)->load() ? 1 : 0;
}
}

void HostWebsocket::run()
{
    using namespace std::chrono_literals;
    std::chrono::seconds reconnectDelay{1};

    while (!stopRequested.load())
    {
        publishState(State::Connecting);
        CURL *connection = curl_easy_init();
        if (connection == nullptr)
        {
            publishError("Could not create host WebSocket connection");
            return;
        }

        std::string protocol;
        {
            std::lock_guard lock(mutex);
            protocol = subprotocol;
        }
        // The subprotocol selects the reader channel (session / pairing); none is the token channel.
        curl_slist *headers = nullptr;
        if (!protocol.empty())
            headers = curl_slist_append(headers, ("Sec-WebSocket-Protocol: " + protocol).c_str());
        curl_easy_setopt(connection, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(connection, CURLOPT_URL, url.c_str());
        curl_easy_setopt(connection, CURLOPT_CONNECT_ONLY, 2L);
        curl_easy_setopt(connection, CURLOPT_CONNECTTIMEOUT_MS, 5000L);
        curl_easy_setopt(connection, CURLOPT_NOPROGRESS, 0L);
        curl_easy_setopt(connection, CURLOPT_XFERINFOFUNCTION, cancelWhenStopping);
        curl_easy_setopt(connection, CURLOPT_XFERINFODATA, &stopRequested);
        // TLS verification is deliberately explicit: a simulator must never weaken reader authentication.
        curl_easy_setopt(connection, CURLOPT_SSL_VERIFYPEER, 1L);
        curl_easy_setopt(connection, CURLOPT_SSL_VERIFYHOST, 2L);
        const CURLcode connected = curl_easy_perform(connection);
        if (connected != CURLE_OK)
        {
            if (!stopRequested.load())
                publishError(curl_easy_strerror(connected));
            curl_easy_cleanup(connection);
            curl_slist_free_all(headers);
            for (auto slept = 0ms; slept < reconnectDelay && !stopRequested.load(); slept += 100ms)
                std::this_thread::sleep_for(100ms);
            reconnectDelay = std::min(reconnectDelay * 2, 30s);
            continue;
        }

        reconnectDelay = 1s;
        publishState(State::Connected);
        wasConnected.store(true);
        publishConnection(true);
        std::string inbound;
        bool inboundIsText = false;
        std::array<char, 4096> buffer{};
        bool open = true;
        while (open && !stopRequested.load())
        {
            std::string outboundMessage;
            bool outboundBinary = false;
            {
                std::lock_guard lock(mutex);
                if (!outbound.empty())
                {
                    outboundMessage = std::move(outbound.front().data);
                    outboundBinary = outbound.front().binary;
                    outbound.pop();
                }
            }
            if (!outboundMessage.empty())
            {
                size_t offset = 0;
                while (offset < outboundMessage.size() && !stopRequested.load())
                {
                    size_t sent = 0;
                    const CURLcode sentResult = curl_ws_send(connection, outboundMessage.data() + offset,
                                                             outboundMessage.size() - offset, &sent, 0,
                                                             outboundBinary ? CURLWS_BINARY : CURLWS_TEXT);
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
            if (received > MaxInboundMessageBytes - inbound.size())
            {
                publishError("Host WebSocket message exceeds the maximum size");
                open = false;
                continue;
            }
            inbound.append(buffer.data(), received);
            if (frame->bytesleft == 0 && (frame->flags & CURLWS_CONT) == 0)
            {
                if (inboundIsText)
                    publishMessage(std::move(inbound));
                else
                    publishBinary(std::move(inbound)); // TLS records of the session channel
                inbound.clear();
                inboundIsText = false;
            }
        }

        curl_easy_cleanup(connection);
        curl_slist_free_all(headers);
        publishState(State::Disconnected);
        if (wasConnected.exchange(false))
            publishConnection(false);
        for (auto slept = 0ms; slept < reconnectDelay && !stopRequested.load(); slept += 100ms)
            std::this_thread::sleep_for(100ms);
        reconnectDelay = std::min(reconnectDelay * 2, 30s);
    }
}
