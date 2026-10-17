#pragma once
/**************************************************************************/
/*!
    @file Adafruit_PN532.cpp

    @section intro_sec Introduction

    Driver for NXP's PN532 NFC/13.56MHz RFID Transceiver

    This is a library for the Adafruit PN532 NFC/RFID breakout boards
    This library works with the Adafruit NFC breakout
    ----> https://www.adafruit.com/products/364

    Check out the links above for our tutorials and wiring diagrams
    These chips use SPI or I2C to communicate.

    Adafruit invests time and resources providing this open source code,
    please support Adafruit and open-source hardware by purchasing
    products from Adafruit!

    @section author Author

    Adafruit Industries

    @section license License

    BSD (see license.txt)

    @section  HISTORY

    v2.2 - Added startPassiveTargetIDDetection() to start card detection and
            readDetectedPassiveTargetID() to read it, useful when using the
            IRQ pin.

    v2.1 - Added NTAG2xx helper functions

    v2.0 - Refactored to add I2C support from Adafruit_NFCShield_I2C library.

    v1.4 - Added setPassiveActivationRetries()

    v1.2 - Added writeGPIO()
         - Added readGPIO()

    v1.1 - Changed readPassiveTargetID() to handle multiple UID sizes
         - Added the following helper functions for text display
             static void PrintHex(const byte * data, const uint32_t numBytes)
             static void PrintHexChar(const byte * pbtData, const uint32_t
   numBytes)
         - Added the following Mifare Classic functions:
             bool mifareclassic_IsFirstBlock (uint32_t uiBlock)
             bool mifareclassic_IsTrailerBlock (uint32_t uiBlock)
             uint8_t mifareclassic_AuthenticateBlock (uint8_t * uid, uint8_t
   uidLen, uint32_t blockNumber, uint8_t keyNumber, uint8_t * keyData) uint8_t
   mifareclassic_ReadDataBlock (uint8_t blockNumber, uint8_t * data) uint8_t
   mifareclassic_WriteDataBlock (uint8_t blockNumber, uint8_t * data)
         - Added the following Mifare Ultalight functions:
             uint8_t mifareultralight_ReadPage (uint8_t page, uint8_t * buffer)
*/
/**************************************************************************/
