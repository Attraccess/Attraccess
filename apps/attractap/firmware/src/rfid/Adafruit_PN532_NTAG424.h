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

// IDF v6 / mbedTLS 4.x: legacy mbedtls/aes.h and mbedtls/cmac.h were removed
// from the public headers (moved to mbedtls/private/). The firmware's NTAG424
// crypto now uses the supported PSA Crypto API (psa/crypto.h).
#include "psa/crypto.h"
#include "pn532_i2c.hpp"

#include "pn532_commands.hpp"
#include "pn532_card_state.hpp"


/**
 * @brief Class for working with Adafruit PN532 NFC/RFID breakout boards.
 */
class Adafruit_PN532 : public Pn532CardState
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

  // NTAG424 functions
  uint8_t ntag424_apdu_send(uint8_t *cla, uint8_t *ins, uint8_t *p1,
                            uint8_t *p2, uint8_t *cmd_header,
                            uint8_t cmd_header_length, uint8_t *cmd_data,
                            uint8_t cmd_data_length, uint8_t le,
                            uint8_t comm_mode, uint8_t *response,
                            uint8_t response_le);
  uint32_t ntag424_crc32(uint8_t *data, uint8_t datalength);
  uint8_t ntag424_addpadding(uint8_t inputlength, uint8_t paddinglength,
                             uint8_t *buffer);
  uint8_t ntag424_encrypt(uint8_t *key, uint8_t length, uint8_t *input,
                          uint8_t *output);
  uint8_t ntag424_encrypt(uint8_t *key, uint8_t *iv, uint8_t length,
                          uint8_t *input, uint8_t *output);
  uint8_t ntag424_decrypt(uint8_t *key, uint8_t length, uint8_t *input,
                          uint8_t *output);
  uint8_t ntag424_decrypt(uint8_t *key, uint8_t *iv, uint8_t length,
                          uint8_t *input, uint8_t *output);
  uint8_t ntag424_cmac_short(uint8_t *key, uint8_t *input, uint8_t length,
                             uint8_t *cmac);
  uint8_t ntag424_cmac(uint8_t *key, uint8_t *input, uint8_t length,
                       uint8_t *cmac);
  uint8_t ntag424_MAC(uint8_t *cmd, uint8_t *cmdheader,
                      uint8_t cmdheader_length, uint8_t *cmddata,
                      uint8_t cmddata_length, uint8_t *signature);
  uint8_t ntag424_MAC(uint8_t *key, uint8_t *cmd, uint8_t *cmdheader,
                      uint8_t cmdheader_length, uint8_t *cmddata,
                      uint8_t cmddata_length, uint8_t *signature);
  void ntag424_random(uint8_t *output, uint8_t bytecount);
  void ntag424_derive_session_keys(uint8_t *key, uint8_t *RndA, uint8_t *RndB);
  uint8_t ntag424_rotl(uint8_t *input, uint8_t *output, uint8_t bufferlen,
                       uint8_t rotation);
  uint8_t ntag424_ReadData(uint8_t *buffer, int fileno, int offset, int size);
  uint8_t ntag424_WriteData(const uint8_t *data, int fileno, int offset, int size, uint8_t keyNo);
  uint8_t ntag424_Authenticate(uint8_t *key, uint8_t keyno, uint8_t cmd);
  uint8_t ntag424_AuthenticateEV2First(uint8_t *key, uint8_t keyno,
                                       uint8_t cmd);
  uint8_t ntag424_ChangeKey(uint8_t *oldkey, uint8_t *newkey,
                            uint8_t keynumber, uint8_t keyversion = 0x01);
  uint8_t ntag424_ReadSig(uint8_t *buffer);
  uint8_t ntag424_GetTTStatus(uint8_t *buffer);
  uint8_t ntag424_GetCardUID(uint8_t *buffer);
  uint8_t ntag424_GetFileSettings(uint8_t fileno, uint8_t *buffer,
                                  uint8_t comm_mode);
  uint8_t ntag424_ChangeFileSettings(uint8_t fileno, uint8_t *filesettings,
                                     uint8_t filesettings_length,
                                     uint8_t comm_mode);
  uint8_t ntag424_ISOReadFile(uint8_t *buffer);
  bool ntag424_FormatNDEF();
  bool ntag424_ISOUpdateBinary(uint8_t *buffer, uint8_t length);
  bool ntag424_ISOSelectFileById(int fileid);
  bool ntag424_ISOSelectFileByDFN(uint8_t *dfn);
  uint8_t ntag424_isNTAG424();
  uint8_t ntag424_GetVersion();

  // MIFARE DESFire functions (EV2/EV3; reuse the EV2 secure messaging above)
  bool desfire_SelectApplication(const uint8_t *aid);
  bool desfire_CreateApplication(const uint8_t *aid, uint8_t keySettings1,
                                 uint8_t keySettings2);
  bool desfire_GetKeyVersion(uint8_t keynumber, uint8_t *keyversion);

  // NTAG2xx functions
  uint8_t ntag2xx_ReadPage(uint8_t page, uint8_t *buffer);
  uint8_t ntag2xx_WritePage(uint8_t page, uint8_t *data);
  uint8_t ntag2xx_WriteNDEFURI(uint8_t uriIdentifier, char *url,
                               uint8_t dataLen);

  // Help functions to display formatted text
  static void PrintHex(const uint8_t *data, const uint32_t numBytes);
  static void PrintHexChar(const uint8_t *pbtData, const uint32_t numBytes);

private:
    uint8_t ntag424_encodeFullApdu(uint8_t *apdu, uint8_t &offset, uint8_t offset_lc, uint8_t *ins, uint8_t *cmd_header, uint8_t cmd_header_length, uint8_t *cmd_data, uint8_t cmd_data_length);
    uint8_t ntag424_decodeResponse(uint8_t *response, uint8_t response_length, uint8_t comm_mode);
    uint8_t ntag424_finishAuthentication(uint8_t *key, uint8_t *RndA, uint8_t *RndB);
    uint8_t ntag424_selectNdefForRead();
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
