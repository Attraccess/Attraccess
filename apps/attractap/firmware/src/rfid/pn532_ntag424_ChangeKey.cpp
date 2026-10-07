// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/*!
    @brief   Change key keynumber from oldkey to newkey.

    @param   oldkey       Current key (16 byte)
    @param   newkey       New key     (16 byte)
    @param   keynumber    Keynumber to change (0-4)

    @return  false=fail|true=success
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_ChangeKey(uint8_t *oldkey, uint8_t *newkey,
                                          uint8_t keynumber, uint8_t keyversion)
{
  uint8_t xorkey[16];
  for (int i = 0; i < 16; ++i)
  {
    xorkey[i] = oldkey[i] ^ newkey[i];
  }
  uint32_t crc32_newkey = Adafruit_PN532::ntag424_crc32(newkey, 16);
  // we need JAMCRCn which is the binary invers
  crc32_newkey = ~crc32_newkey;
#ifdef NTAG424DEBUG
  Serial.println("old key");
  Adafruit_PN532::PrintHex(oldkey, 16);
  Serial.println("new key");
  Adafruit_PN532::PrintHex(newkey, 16);
  Serial.println("XOR key");
  Adafruit_PN532::PrintHex(xorkey, 16);
  Serial.println("CRC32 key");
#endif
  uint8_t crcbytes[4];
  memcpy(crcbytes, &crc32_newkey, sizeof(uint32_t));
#ifdef NTAG424DEBUG
  Serial.printf("ROM CRC: %02X %02X %02X %02X\n", crcbytes[0], crcbytes[1],
                crcbytes[2], crcbytes[3]);
  Serial.println(crc32_newkey, HEX);
#endif
  // assemble keydata
  uint8_t keydata[32];
  uint8_t keydata_length = 21;
  if (keynumber > 0)
  {
    memcpy(keydata, xorkey, 16);
    keydata[16] = keyversion;
    memcpy(keydata + 17, crcbytes, 4);
    keydata_length = 21;
  }
  else if (keynumber == 0)
  {
    memcpy(keydata, newkey, 16);
    keydata[16] = keyversion;
    keydata_length = 17;
  }
#ifdef NTAG424DEBUG
  Serial.println("keydata:");
  Adafruit_PN532::PrintHex(keydata, keydata_length);
  Serial.println("Sessionkey ENC:");
  Adafruit_PN532::PrintHex(ntag424_Session.session_key_enc, 16);
#endif
  uint8_t cla[1] = {NTAG424_COM_CLA};
  uint8_t ins[1] = {NTAG424_COM_CHANGEKEY};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {keynumber};
  // uint8_t cmd_data[1] = {0x00};
  uint8_t result[50];

  uint8_t response_length = Adafruit_PN532::ntag424_apdu_send(
      cla, ins, p1, p2, cmd_header, 1, keydata, keydata_length, 0,
      NTAG424_COMM_MODE_FULL, result, sizeof(result)

  );
  Adafruit_PN532::PrintHex(result, response_length);

  // A full-mode response can retain its eight-byte CMAC before the status
  // trailer. The status is always the final two bytes.
  if (response_length < 2 || result[response_length - 2] != 0x91 ||
      result[response_length - 1] != 0x00)
  {
    return false;
  }
  return true;
}
