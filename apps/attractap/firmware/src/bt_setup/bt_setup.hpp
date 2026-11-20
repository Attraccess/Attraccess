#pragma once

// Bluetooth setup (ATT-1315, ATT-1371): the BLE bridge and the readers get their PIN, Wi-Fi and server address from
// the Attraccess web app over Web Bluetooth. While the setup window is open (bt_setup_logic.hpp) the device
// advertises as "<BT_SETUP_NAME_PREFIX> XXXX" (e.g. "Attractap Touch 71C8") with a GATT service the web app writes
// the Serial Configurator's command lines to (`CMND <topic> <json>\n`) and reads the replies from
// (`RESP <topic> <json>\n`, as notifications). The commands run through SerialCommandHandler on the main loop with
// the same PIN rules as on the serial port. Writes need an encrypted link (LE Secure Connections, Just Works), so
// the Wi-Fi password never crosses the air in clear text.
//
// The setup owns NimBLE while it runs: the BLE proxy refuses to start until it is closed (`bt-setup`, retryable),
// and closing hands all of NimBLE's memory back.
//
// Service 2665a001-44cd-4fe2-a450-916b627619d7
//   RX 2665a002-...: write, encryption required. Bytes of command lines; a line may span several writes.
//   TX 2665a003-...: notify. Bytes of reply lines, split into pieces of the ATT MTU minus 3.

#include <cstdint>

#ifdef ESP_PLATFORM
#include "sdkconfig.h"
#endif

// The devices that run the BLE proxy (same condition as ATTRACTAP_BLE_PROXY): not the demo variants (no API), not
// the park images or the desktop simulator (no NimBLE).
#if defined(ESP_PLATFORM) && !defined(DEMO_MODE) && defined(CONFIG_BT_NIMBLE_ENABLED)
#define ATTRACTAP_BT_SETUP 1
#else
#define ATTRACTAP_BT_SETUP 0
#endif

namespace bt_setup
{
    constexpr bool supported() { return ATTRACTAP_BT_SETUP; }

    enum class Request : uint8_t
    {
        Opened,
        AlreadyOpen,
        Paired,      // only a device that is not paired with a server offers the setup
        NoMemory,    // NimBLE could not start (nothing stays allocated)
        Unsupported, // a build without the setup
    };

    // Makes the setup the command channel of SerialCommandHandler. Once, before the first request.
    void registerChannel();
    // Opens a 10-minute window: the bridge's button, a reader at boot or the Touch's "Bluetooth setup" button. Reads
    // the pairing credentials. Call from one task only (the bridge task, or the reader's main loop).
    Request request(uint32_t now);
    // Periodic, on the task that calls request(): closes the window when it times out or 10 s after the reader runs
    // an authenticated session. Closing drops the link, stops advertising and frees NimBLE.
    void update(bool authenticated, uint32_t now);

    // Any task.
    bool isOpen();
    // The web app is connected.
    bool linked();
    uint32_t remainingMs(uint32_t now);
    // The advertised name; empty before the first window.
    const char *name();
    // The Touch's button may open a window (buttonVisible in bt_setup_logic.hpp): not paired as far as the last
    // request or an authenticated session tells, and no window open.
    bool offerButton();
    // NimBLE belongs to the setup (for the BLE proxy).
    bool active();
}
