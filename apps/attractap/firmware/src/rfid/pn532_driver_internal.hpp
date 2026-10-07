#pragma once
#include "Adafruit_PN532_NTAG424.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include "esp_random.h"
#include "esp_rom_crc.h"
#include "pn532_platform.hpp"

namespace Pn532Driver
{
extern Pn532DebugPort serial;
}
#define Serial Pn532Driver::serial
#define PN532DEBUGPRINT Serial
#define PN532_PACKBUFFSIZ 64
// Uncomment here to enable debug output consistently across command modules.
// #define PN532DEBUG
// #define MIFAREDEBUG
// #define NTAG424DEBUG
extern byte pn532ack[];
extern byte pn532response_firmwarevers[];
extern byte pn532_packetbuffer[PN532_PACKBUFFSIZ];
