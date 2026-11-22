#pragma once

#include <string>

#ifndef ATTRACTAP_HOST
#include <ArduinoJson.h>
#include "esp_netif.h"
#include "../network/wifi/wifi.hpp"
#endif
#include "../logger/logger.hpp"

class SerialCommandHandler
{
public:
    // Host tests have no USB. The secure profile (ATT-1166) has no console: there the commands arrive only over the
    // Bluetooth setup channel (ATT-1371), see serialConsoleInput.cpp.
#if defined(ATTRACTAP_HOST)
    static void setup() {}
    static void loop() {}
#else
    static void setup();
    static void loop();
#endif

#ifndef ATTRACTAP_HOST
    static constexpr size_t MAX_COMMAND_LENGTH = 256;

    // A command source besides the console: the Bluetooth setup of the bridge and the readers (src/bt_setup). Its
    // lines go through the same commands and PIN rules, on the main loop like console lines; the replies
    // (`RESP ...\n`) go back to the channel the command came from instead of the console.
    class Channel
    {
    public:
        virtual ~Channel() = default;
        // The next complete command line, without its newline. Called from the main loop.
        virtual bool nextLine(std::string &line) = 0;
        virtual void reply(const std::string &line) = 0;
        // A limit on wrong PINs (the Bluetooth setup: bt_setup::PinGuard). The console has none: it needs the cable.
        virtual bool pinAttemptAllowed() { return true; }
        virtual void pinRejected() {}
    };
    // At most one extra channel; it must live until reboot.
    static void setChannel(Channel *channel) { extraChannel = channel; }

    static void sendJsonResponse(const std::string &topic, const std::string &payload);
    static void sendErrorResponse(const std::string &topic, const char *error);
#endif

private:
#ifndef ATTRACTAP_HOST
#ifndef ATTRACTAP_SECURE_PROFILE
    static std::string inputBuffer;
    static void readConsole();
#endif
    static Logger logger;
    static Channel *extraChannel;
    // The channel of the command being handled; null for the console.
    static Channel *replyChannel;
#ifdef ATTRACTAP_BLE_BRIDGE
    static void sendHeapStatus(const std::string &topic);
#endif

    static void processLine(const std::string &line);
    static void handleAuthorizedCommand(const std::string &topic, JsonObject payloadObj);
    static void handleCommand(const std::string &topic, const std::string &payload);
#ifdef ATTRACTAP_CRASH_TRIGGER
    static void triggerCrash(uint32_t stackBytes);
#endif

    static bool pinIsSet();
    static bool validateNewCode(const char *code);
    static bool ensureAuthorized(const char *codeFromPayload, std::string &errorOut);

    static std::string ipToString(const esp_ip4_addr_t &ip);
    static const char *encryptionTypeToString(wifi_auth_mode_t mode);
#endif
};
