#include "ble_proxy.hpp"

#include "ble_codec.hpp"

#if ATTRACTAP_BLE_PROXY

#include <atomic>
#include <new>

#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/idf_additions.h"
#include "freertos/queue.h"
#include "freertos/task.h"

#include "../logger/logger.hpp"
#include "../platform.hpp"
#include "ble_capability.hpp"
#include "ble_core.hpp"
#include "ble_radio_nimble.hpp"

namespace
{
    // Requests: the session queue (16) plus a scan/open/close/cancel in flight.
    constexpr UBaseType_t COMMAND_QUEUE_DEPTH = ble::MAX_PENDING_REQUESTS + 8;
    constexpr UBaseType_t EVENT_QUEUE_DEPTH = 32;
    // Radio results must not get lost; NimBLE's host task waits this long for room.
    constexpr TickType_t EVENT_POST_TIMEOUT = pdMS_TO_TICKS(200);
    constexpr uint32_t TASK_STACK = 6144;
    constexpr UBaseType_t TASK_PRIORITY = 3;
    constexpr TickType_t IDLE_WAIT = pdMS_TO_TICKS(20);

    void logHeap(Logger &logger, const char *when)
    {
        logger.infof("Heap %s: internal free=%u largest=%u, psram free=%u", when,
                     static_cast<unsigned>(heap_caps_get_free_size(MALLOC_CAP_INTERNAL)),
                     static_cast<unsigned>(heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL)),
                     static_cast<unsigned>(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)));
    }
}

struct BleProxy::Impl : public ble::IBleSink, public ble::IRadioEvents
{
    struct RadioEvent
    {
        enum class Kind : uint8_t
        {
            Advertisement,
            ScanComplete,
            Connected,
            ConnectFailed,
            Disconnected,
            OpDone,
        } kind;
        ble::Address address;
        int8_t rssi = 0;
        bool hasRssi = false;
        uint16_t mtu = 0;
        int reason = 0;
        uint32_t token = 0;
        ble::Error error;
        ble::Bytes data;
    };

    Hooks hooks;
    Logger logger{"BleProxy"};
    ble::NotificationBuffer notifications;
    ble::NimbleRadio radio{*this};
    ble::BleProxyCore core{radio, *this, notifications};
    QueueHandle_t commands = nullptr;
    QueueHandle_t events = nullptr;
    TaskHandle_t task = nullptr;
    std::atomic<uint32_t> generation{1};
    std::atomic<bool> otaPending{false};
    uint32_t handledGeneration = 1;
    bool loggedInit = false;

    // --- IBleSink (proxy task) ----------------------------------------------------------------------------
    bool send(const std::string &message) override { return hooks.send && hooks.send(message.data(), message.size()); }
    bool canSendNotification() override { return !hooks.canSendNotification || hooks.canSendNotification(); }
    void log(bool isError, const char *line) override
    {
        if (isError) logger.error(line);
        else logger.info(line);
    }

    // --- IRadioEvents (NimBLE host task) ------------------------------------------------------------------
    void post(RadioEvent *event, TickType_t wait)
    {
        if (xQueueSend(events, &event, wait) != pdTRUE)
        {
            if (event->kind != RadioEvent::Kind::Advertisement) logger.error("BLE event queue full, radio event lost");
            delete event;
            return;
        }
        xTaskNotifyGive(task);
    }
    RadioEvent *make(RadioEvent::Kind kind)
    {
        auto *event = new (std::nothrow) RadioEvent();
        if (event) event->kind = kind;
        return event;
    }
    void radioAdvertisement(const ble::Address &address, int8_t rssi, bool hasRssi, const uint8_t *data,
                            size_t length) override
    {
        RadioEvent *event = make(RadioEvent::Kind::Advertisement);
        if (!event) return;
        event->address = address;
        event->rssi = rssi;
        event->hasRssi = hasRssi;
        event->data.assign(data, data + length);
        // Advertisements are many and droppable: never hold up NimBLE for one.
        post(event, 0);
    }
    void radioScanComplete() override
    {
        if (RadioEvent *event = make(RadioEvent::Kind::ScanComplete)) post(event, EVENT_POST_TIMEOUT);
    }
    void radioConnected(const ble::Address &peer, uint16_t mtu) override
    {
        RadioEvent *event = make(RadioEvent::Kind::Connected);
        if (!event) return;
        event->address = peer;
        event->mtu = mtu;
        post(event, EVENT_POST_TIMEOUT);
    }
    void radioConnectFailed(const ble::Error &error) override
    {
        RadioEvent *event = make(RadioEvent::Kind::ConnectFailed);
        if (!event) return;
        event->error = error;
        post(event, EVENT_POST_TIMEOUT);
    }
    void radioDisconnected(int reason) override
    {
        RadioEvent *event = make(RadioEvent::Kind::Disconnected);
        if (!event) return;
        event->reason = reason;
        post(event, EVENT_POST_TIMEOUT);
    }
    void radioOpDone(uint32_t token, const ble::Error &error, ble::Bytes &&value) override
    {
        RadioEvent *event = make(RadioEvent::Kind::OpDone);
        if (!event) return;
        event->token = token;
        event->error = error;
        event->data = std::move(value);
        post(event, EVENT_POST_TIMEOUT);
    }
    void radioNotification(const ble::Uuid &service, const ble::Uuid &characteristic, const uint8_t *data,
                           size_t length) override
    {
        // Full buffer: the characteristic gets its overflow marker; nothing is dropped silently.
        notifications.push(service, characteristic, data, length);
        xTaskNotifyGive(task);
    }

    // --- proxy task ----------------------------------------------------------------------------------------
    static void entry(void *arg) { static_cast<Impl *>(arg)->run(); }

    void dispatch(RadioEvent &event, uint32_t now)
    {
        switch (event.kind)
        {
        case RadioEvent::Kind::Advertisement:
            core.onAdvertisement(event.address, event.rssi, event.hasRssi, event.data.data(), event.data.size());
            break;
        case RadioEvent::Kind::ScanComplete:
            core.onScanComplete(now);
            break;
        case RadioEvent::Kind::Connected:
            core.onConnected(event.address, event.mtu, now);
            break;
        case RadioEvent::Kind::ConnectFailed:
            core.onConnectFailed(event.error, now);
            break;
        case RadioEvent::Kind::Disconnected:
            core.onDisconnected(event.reason, now);
            break;
        case RadioEvent::Kind::OpDone:
            core.onOpDone(event.token, event.error, std::move(event.data), now);
            break;
        }
    }

    void run()
    {
        for (;;)
        {
            ulTaskNotifyTake(pdTRUE, IDLE_WAIT);
            uint32_t now = millis();
            const uint32_t current = generation.load();
            if (current != handledGeneration)
            {
                handledGeneration = current;
                core.linkLost(now);
            }
            if (otaPending.exchange(false)) core.otaStarted(now);
            RadioEvent *event = nullptr;
            while (xQueueReceive(events, &event, 0) == pdTRUE)
            {
                dispatch(*event, millis());
                delete event;
            }
            ble::Command *command = nullptr;
            while (xQueueReceive(commands, &command, 0) == pdTRUE)
            {
                // Requests of a connection that is already gone never run.
                if (command->generation == handledGeneration)
                {
                    const bool wasReady = core.radioReady();
                    core.handle(std::move(*command), millis());
                    if (!wasReady && core.radioReady() && !loggedInit)
                    {
                        loggedInit = true;
                        logHeap(logger, "after BLE init");
                    }
                }
                delete command;
                // Radio results first: a burst of requests must not delay them.
                while (xQueueReceive(events, &event, 0) == pdTRUE)
                {
                    dispatch(*event, millis());
                    delete event;
                }
            }
            core.tick(millis());
        }
    }

    // Answers a request that never reaches the state machine (malformed, or no room). Websocket task.
    void reject(const ble::Command &command, const ble::Error &error)
    {
        if (!command.requestId || !command.sessionId[0]) return;
        const std::string message =
            command.type == ble::CommandType::Scan
                ? ble::scanResultMessage(command.sessionId, command.requestId, error, nullptr)
                : ble::resultMessage(command.sessionId, command.requestId, error);
        send(message);
    }
};

void BleProxy::setup(Hooks hooks)
{
    if (impl) return;
    impl = new (std::nothrow) Impl();
    if (!impl) return;
    impl->hooks = std::move(hooks);
    impl->core.setOtaActive(impl->hooks.otaActive);
    impl->commands = xQueueCreate(COMMAND_QUEUE_DEPTH, sizeof(ble::Command *));
    impl->events = xQueueCreate(EVENT_QUEUE_DEPTH, sizeof(Impl::RadioEvent *));
    logHeap(impl->logger, "at boot");
    // A PSRAM stack costs no internal RAM; the task never touches flash.
    if (!impl->commands || !impl->events ||
        xTaskCreatePinnedToCoreWithCaps(Impl::entry, "ble_proxy", TASK_STACK, impl, TASK_PRIORITY, &impl->task,
                                        tskNO_AFFINITY, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT) != pdPASS)
    {
        impl->logger.error("Could not start the BLE proxy task; BLE requests are refused");
        impl->task = nullptr;
    }
}

bool BleProxy::handleMessage(const char *type, JsonObjectConst payload)
{
    if (!ble::isRequestType(type)) return false;
    if (!impl) return true;
    auto *command = new (std::nothrow) ble::Command();
    if (!command) return true;
    ble::Error error;
    if (!ble::parseCommand(type, payload, *command, error) || !impl->task)
    {
        if (!impl->task) error = ble::Error(ble::Code::ReaderOffline, "ble-init-failed");
        impl->logger.errorf("Refused %s: %s %s", type, ble::codeName(error.code), error.detail);
        impl->reject(*command, error);
        delete command;
        return true;
    }
    command->generation = impl->generation.load();
    command->receivedMs = millis();
    if (xQueueSend(impl->commands, &command, 0) != pdTRUE)
    {
        impl->reject(*command, ble::Error(ble::Code::ReaderBusy, "queue-full"));
        delete command;
        return true;
    }
    xTaskNotifyGive(impl->task);
    return true;
}

void BleProxy::linkLost()
{
    if (!impl || !impl->task) return;
    impl->generation++;
    xTaskNotifyGive(impl->task);
}

void BleProxy::otaStarted()
{
    if (!impl || !impl->task) return;
    impl->otaPending = true;
    xTaskNotifyGive(impl->task);
}

void BleProxy::fillCapability(JsonObject capabilities, char *scratch, size_t size)
{
    ble::fillCapability(capabilities, scratch, size);
}

#else

// No proxy on this build: no capability, so the API never sends BLE requests; stray ones are dropped.
void BleProxy::setup(Hooks hooks) { (void)hooks; }
bool BleProxy::handleMessage(const char *type, JsonObjectConst payload)
{
    (void)payload;
    return ble::isRequestType(type);
}
void BleProxy::linkLost() {}
void BleProxy::otaStarted() {}
void BleProxy::fillCapability(JsonObject capabilities, char *scratch, size_t size)
{
    (void)capabilities, (void)scratch, (void)size;
}

#endif
