// Command lines from the console port (USB-Serial-JTAG on the readers, UART0 on the BLE bridge): the Serial
// Configurator's path. The secure profile has no console; CMakeLists.txt leaves this file out of its builds and
// tools/check_secure_profile.py fails a secure build that compiles it.
#include "serialCommandHandler.hpp"

#if !defined(ATTRACTAP_HOST) && !defined(ATTRACTAP_SECURE_PROFILE)

#include "console_io.hpp"

std::string SerialCommandHandler::inputBuffer = "";

// Non-blocking drain of the console RX buffer (driver installed in main.cpp during startup).
void SerialCommandHandler::readConsole()
{
    uint8_t byte;
    while (console_io::readByte(byte))
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

#endif
