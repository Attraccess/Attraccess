/**************************************************************************/
/*!
    @file Adafruit_PN532.h

    v2.0  - Refactored to add I2C support from Adafruit_NFCShield_I2C library.

    v1.1  - Added full command list
          - Added 'verbose' mode flag to constructor to toggle debug output
          - Changed readPassiveTargetID() to return variable length values
*/
/**************************************************************************/

#ifndef ADAFRUIT_PN532_H
#define ADAFRUIT_PN532_H

#include <cstddef>
#include <cstdint>

#include "pn532_i2c.hpp"

#include "pn532/commands.hpp"


/**
 * @brief Class for working with Adafruit PN532 NFC/RFID breakout boards.
 */
class Adafruit_PN532
{
public:
  // I2C on the shared bus (SPI/UART/software-SPI transports were removed with
  // the Arduino port — no Attractap hardware ever used them).
  explicit Adafruit_PN532(uint8_t i2cAddress = PN532_I2C_ADDRESS);
  bool begin(void);

  void reset(void);
  void wakeup(void);

  // Generic PN532 functions
  bool SAMConfig(void);
  bool setRfField(bool enabled);
  uint32_t getFirmwareVersion(void);
  bool sendCommandCheckAck(uint8_t *cmd, uint8_t cmdlen,
                           uint16_t timeout = 100);
  bool writeGPIO(uint8_t pinstate);
  uint8_t readGPIO(void);
  bool setPassiveActivationRetries(uint8_t maxRetries);

  // ISO14443A functions
  bool readPassiveTargetID(
      uint8_t cardbaudrate, uint8_t *uid, uint8_t *uidLength,
      uint16_t timeout = 0); // timeout 0 means no timeout - will block forever.
  bool startPassiveTargetIDDetection(uint8_t cardbaudrate);
  bool readDetectedPassiveTargetID(uint8_t *uid, uint8_t *uidLength);
  bool inDataExchange(uint8_t *send, uint8_t sendLength, uint8_t *response,
                      uint8_t *responseLength);
  bool inListPassiveTarget();
  uint8_t AsTarget();
  uint8_t getDataTarget(uint8_t *cmd, uint8_t *cmdlen);
  uint8_t setDataTarget(uint8_t *cmd, uint8_t cmdlen);

  // Mifare Classic functions
  bool mifareclassic_IsFirstBlock(uint32_t uiBlock);
  bool mifareclassic_IsTrailerBlock(uint32_t uiBlock);
  uint8_t mifareclassic_AuthenticateBlock(uint8_t *uid, uint8_t uidLen,
                                          uint32_t blockNumber,
                                          uint8_t keyNumber, uint8_t *keyData);
  uint8_t mifareclassic_ReadDataBlock(uint8_t blockNumber, uint8_t *data);
  uint8_t mifareclassic_WriteDataBlock(uint8_t blockNumber, uint8_t *data);
  uint8_t mifareclassic_FormatNDEF(void);
  uint8_t mifareclassic_WriteNDEFURI(uint8_t sectorNumber,
                                     uint8_t uriIdentifier, const char *url);

  // Mifare Ultralight functions
  uint8_t mifareultralight_ReadPage(uint8_t page, uint8_t *buffer);
  uint8_t mifareultralight_WritePage(uint8_t page, uint8_t *data);

  // NTAG2xx functions
  uint8_t ntag2xx_ReadPage(uint8_t page, uint8_t *buffer);
  uint8_t ntag2xx_WritePage(uint8_t page, uint8_t *data);
  uint8_t ntag2xx_WriteNDEFURI(uint8_t uriIdentifier, char *url,
                               uint8_t dataLen);

  // Help functions to display formatted text
  static void PrintHex(const uint8_t *data, const uint32_t numBytes);
  static void PrintHexChar(const uint8_t *pbtData, const uint32_t numBytes);

private:
  int8_t _uid[7];      // ISO14443A uid
  int8_t _uidLen;      // uid len
  int8_t _key[6];      // Mifare Classic key
  int8_t _inListedTag; // Tg number of inlisted tag.

  // Low level I2C communication functions.
  void readdata(uint8_t *buff, uint8_t n);
  void writecommand(uint8_t *cmd, uint8_t cmdlen);
  bool isready();
  bool waitready(uint16_t timeout);
  bool readack();

  Pn532I2cDevice *i2c_dev = NULL;
};

#endif
