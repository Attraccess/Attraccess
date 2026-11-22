#pragma once

// BLE bridge (ATT-1315): setup over Bluetooth. While the setup window is open (bridge.cpp, provisioning_logic.hpp)
// the bridge advertises as "Attractap Bridge XXXX" with a GATT service the Attraccess web app writes the Serial
// Configurator's command lines to (`CMND <topic> <json>\n`) and reads the replies from (`RESP <topic> <json>\n`,
// as notifications). The commands run through SerialCommandHandler with the same PIN rules as on the serial port.
// Writes need an encrypted link (LE Secure Connections, Just Works), so the Wi-Fi password never crosses the air in
// clear text.
//
// The setup owns NimBLE while it runs: the BLE proxy refuses to start until it is closed, and closing hands all of
// NimBLE's memory back.
//
// Service 2665a001-44cd-4fe2-a450-916b627619d7
//   RX 2665a002-...: write, encryption required. Bytes of command lines; a line may span several writes.
//   TX 2665a003-...: notify. Bytes of reply lines, split into pieces of the ATT MTU minus 3.

#include "../serial/serialCommandHandler.hpp"

namespace bridge::provisioning
{
    // Brings NimBLE up and advertises. False when there is not enough memory (nothing stays allocated).
    bool open();
    // Drops the link, stops advertising and frees NimBLE.
    void close();
    // NimBLE belongs to the setup (open() succeeded, close() not called yet).
    bool active();
    // The web app is connected.
    bool linked();
    // Drops a link that stays unencrypted or idle too long, or guessed the PIN too often (LinkGuard). Called
    // periodically from the bridge task.
    void tick(uint32_t now);
    // The command source SerialCommandHandler reads; empty while no setup runs.
    SerialCommandHandler::Channel &channel();
}
