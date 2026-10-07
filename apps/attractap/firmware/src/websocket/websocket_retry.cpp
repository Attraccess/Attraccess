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

// A failed (re)connect that gets this far means the websocket client could not be
// created/started at all -- almost always because the internal heap is too
// fragmented to allocate the client task's stack ("Error create websocket task" /
// ESP_FAIL from the IDF). That state does not heal on its own: every subsequent
// attempt fails the same way and the device sits forever on the connecting screen.
// Reboot after a few consecutive failures so the heap is defragmented and the
// device reconnects cleanly once the server is reachable again.
void Websocket::handleConnectFailure(const char *reason)
{
    this->consecutiveConnectFailures++;
    this->logger.errorf("Failed to start WebSocket client (%s); consecutive=%u heap_free=%u heap_largest=%u",
                        reason,
                        (unsigned)this->consecutiveConnectFailures,
                        (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
                        (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL));
    setState(INIT);

    if (this->consecutiveConnectFailures >= MAX_CONSECUTIVE_CONNECT_FAILURES)
    {
        this->logger.error("WebSocket client could not be started repeatedly (heap likely fragmented); rebooting to recover");

        // Record why we are rebooting so the next boot's crash report carries the
        // real cause instead of a bare "SW" reset reason. The API layer reads and
        // clears this key once the report is acknowledged (see api_diag.cpp).
        KVStore prefs;
        if (prefs.begin(BOOT_DIAG_NAMESPACE, false))
        {
            prefs.putString(BOOT_DIAG_REBOOT_REASON_KEY, "WEBSOCKET_RECONNECT_HEAP_EXHAUSTION");
            prefs.end();
        }

        delay(200);
        esp_restart();
    }
}

// Last line of defense against any connect-loop the device cannot escape on its
// own (wedged TLS stack, exhausted socket state, ...): if network and server
// config are present but no connection could be established for a whole
// watchdog period, reboot into a clean slate. An advancing certificate sweep
// re-arms the watchdog: the sweep position is RAM-only and a full sweep takes
// longer than one watchdog period, so rebooting mid-sweep would restart it at
// index 0 forever and certs late in the list would never be reached. Only a
// locked certificate (index frozen) or a truly stuck attempt lets it fire.
void Websocket::checkConnectWatchdog(const AttraccessApiConfig &apiConfig)
{
    bool waitingForConnection = _state != CONNECTED && !apiConfig.hostname.empty() && apiConfig.port != 0;
    if (!waitingForConnection)
    {
        this->connectWatchdogStartMs = 0;
        return;
    }

    uint32_t now = millis();
    int certIndex = this->_certManager.getCurrentCertIndex();
    bool sweepAdvanced = certIndex != this->connectWatchdogCertIndex;
    this->connectWatchdogCertIndex = certIndex;

    if (this->connectWatchdogStartMs == 0 || sweepAdvanced)
    {
        this->connectWatchdogStartMs = now ? now : 1;
        return;
    }

    if (now - this->connectWatchdogStartMs < CONNECT_WATCHDOG_TIMEOUT_MS)
    {
        return;
    }

    this->logger.errorf("No connection for %u ms despite network and config; rebooting to recover",
                        (unsigned)CONNECT_WATCHDOG_TIMEOUT_MS);

    // Same mechanism as handleConnectFailure: leave the reboot cause for the
    // next boot's crash report (read and cleared by api_diag.cpp).
    KVStore prefs;
    if (prefs.begin(BOOT_DIAG_NAMESPACE, false))
    {
        prefs.putString(BOOT_DIAG_REBOOT_REASON_KEY, "WEBSOCKET_CONNECT_TIMEOUT");
        prefs.end();
    }

    delay(200);
    esp_restart();
}

void Websocket::resetCertificateTrust()
{
    this->_certManager.reset();
}

bool Websocket::shouldReconnect()
{
    return millis() - this->lastReconnectAttemptTime >= this->nextRetryDelayMs;
}

void Websocket::growReconnectBackoff()
{
    uint32_t next = this->reconnectBackoffMs * 2;
    this->reconnectBackoffMs = (next > this->RECONNECT_BACKOFF_MAX_MS) ? this->RECONNECT_BACKOFF_MAX_MS : next;
}

void Websocket::resetReconnectBackoff()
{
    this->reconnectBackoffMs = this->RECONNECT_BACKOFF_BASE_MS;
    this->nextRetryDelayMs = this->RECONNECT_BACKOFF_BASE_MS;
}

void Websocket::logHeapStats()
{
    this->logger.infof("Heap internal: free=%u largest=%u",
                       (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
                       (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL));
}
