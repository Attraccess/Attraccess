#include "serialCommandHandler.hpp"

#ifndef ATTRACTAP_HOST

#include <ArduinoJson.h>
#include <lwip/inet.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/usb_serial_jtag.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#include "../settings/settings.hpp"
#include "../network/wifi/wifi.hpp"
#include "../state/state.hpp"
#include "../utils.hpp"
#include "platform.hpp"

std::string SerialCommandHandler::inputBuffer = "";
Logger SerialCommandHandler::logger("SerialCmd");

void SerialCommandHandler::setup()
{
    logger.info("Serial command handler ready");
    inputBuffer.reserve(MAX_COMMAND_LENGTH);
}
#endif

void SerialCommandHandler::loop()
{
    // Non-blocking drain of the USB-Serial-JTAG RX buffer (driver installed in
    // main.cpp during startup; 0-tick timeout = don't wait for more bytes).
    uint8_t byte;
    while (usb_serial_jtag_read_bytes(&byte, 1, 0) == 1)
    {
        char c = static_cast<char>(byte);

        if (c == '\r')
        {
            continue;
        }

        if (c == '\n')
        {
            if (inputBuffer.length() > 0)
            {
                processLine(inputBuffer);
            }
            inputBuffer = "";
            continue;
        }

        if (inputBuffer.length() >= MAX_COMMAND_LENGTH)
        {
            logger.error("Serial command too long, clearing buffer");
            inputBuffer = "";
            continue;
        }

        inputBuffer += c;
    }
}

void SerialCommandHandler::processLine(const std::string &line)
{
    std::string trimmed = line;
    trimString(trimmed);

    // Search for "CMND" in the line to handle cases where garbage characters prefix the command
    size_t cmndIndex = trimmed.find("CMND");
    if (cmndIndex == std::string::npos)
    {
        logger.errorf("Invalid command format (no CMND): %s", trimmed.c_str());
        return;
    }

    // Extract everything from "CMND" onwards, removing any leading garbage
    trimmed = trimmed.substr(cmndIndex);
    trimString(trimmed);

    size_t firstSpace = trimmed.find(' ');
    if (firstSpace == std::string::npos)
    {
        logger.errorf("Invalid command format (no space): %s", trimmed.c_str());
        return;
    }

    std::string remainder = trimmed.substr(firstSpace + 1);
    trimString(remainder);

    size_t secondSpace = remainder.find(' ');
    std::string topic = (secondSpace != std::string::npos) ? remainder.substr(0, secondSpace) : remainder;
    std::string payload = (secondSpace != std::string::npos) ? remainder.substr(secondSpace + 1) : "";

    trimString(topic);
    trimString(payload);

    if (topic.length() == 0)
    {
        logger.errorf("Invalid command format (no topic): %s", trimmed.c_str());
        return;
    }

    logger.infof("Handling command: %s %s", topic.c_str(), payload.c_str());
    handleCommand(topic, payload);
}


void SerialCommandHandler::sendJsonResponse(const std::string &topic, const std::string &payload)
{
    // Exact wire format "RESP <topic> <payload>\n" — the provisioning tooling parses it.
    printf("RESP %s %s\n", topic.c_str(), payload.c_str());
}

void SerialCommandHandler::sendErrorResponse(const std::string &topic, const char *error)
{
    DynamicJsonDocument resp(128);
    resp["error"] = error ? error : "UNKNOWN_ERROR";
    std::string json;
    serializeJson(resp, json);
    sendJsonResponse(topic, json);
}
