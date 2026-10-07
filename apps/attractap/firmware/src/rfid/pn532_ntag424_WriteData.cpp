// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/**
 * @brief   Send WriteData request to PICC, with MAC signature
 *
 * @param   data       buffer of bytes to write
 * @param   fileno     file number (0x01: CC, 0x02: NDEF, 0x03: Proprietary)
 * @param   offset     offset to start writing at (in bytes)
 * @param   size       number of bytes to write
 * @param   keyNo      AppKey number (0-4) to authorize the write
 *
 * @return  size of status (bytes returned), or 0 on error
 */
uint8_t Adafruit_PN532::ntag424_WriteData(const uint8_t *data,
                                          int fileno,
                                          int offset,
                                          int size,
                                          uint8_t keyNo)
{
  // 1. Build command header (FileNo + Offset[3] + Length[3])
  uint8_t cmd_header[7] = {
      (uint8_t)fileno,
      (uint8_t)(offset & 0xFF),
      (uint8_t)((offset >> 8) & 0xFF),
      (uint8_t)((offset >> 16) & 0xFF),
      (uint8_t)(size & 0xFF),
      (uint8_t)((size >> 8) & 0xFF),
      (uint8_t)((size >> 16) & 0xFF)};

  // 2. Prepare key and command for MAC
  uint8_t key_buf[1] = {keyNo};
  uint8_t mac_cmd[1] = {NTAG424_CMD_WRITEDATA};
  uint8_t signature[8];

  // 3. Calculate MAC signature over header + payload
  ntag424_MAC(key_buf,
              mac_cmd,
              cmd_header, sizeof(cmd_header),
              (uint8_t *)data, size,
              signature);

  // 4. Prepare full APDU in PN532 packet buffer
  // Lc = header (7) + payload (size) + signature (8)
  uint8_t Lc = 7 + size + 8;

  pn532_packetbuffer[0] = PN532_COMMAND_INDATAEXCHANGE;
  pn532_packetbuffer[1] = 1; // target card #
  pn532_packetbuffer[2] = NTAG424_COM_CLA;
  pn532_packetbuffer[3] = NTAG424_CMD_WRITEDATA;
  pn532_packetbuffer[4] = 0x00; // P1
  pn532_packetbuffer[5] = 0x00; // P2
  pn532_packetbuffer[6] = Lc;   // Lc byte count

  // 5. Copy header, payload, and signature
  memcpy(pn532_packetbuffer + 7, cmd_header, 7);
  memcpy(pn532_packetbuffer + 14, data, size);
  memcpy(pn532_packetbuffer + 14 + size, signature, 8);

  // 6. Le = 0 (expect status only)
  pn532_packetbuffer[7 + Lc] = 0x00;
#ifdef NTAG424DEBUG
  Serial.println(F("> WriteData - PCD APDU:"));
  PrintHexChar(pn532_packetbuffer, 8 + Lc);
#endif

  // 7. Send and ACK
  if (!sendCommandCheckAck(pn532_packetbuffer, 8 + Lc))
  {
#ifdef NTAG424DEBUG
    Serial.println(F("WriteData: no ACK"));
#endif
    return 0;
  }

  // 8. Read response (status APDU)
  // Response length = header(8) + status bytes(2)
  uint8_t response_len = 8 + 2;
  readdata(pn532_packetbuffer, response_len);

  // 9. Check SW1/SW2 at end of packet
  uint8_t sw1 = pn532_packetbuffer[response_len - 2];
  uint8_t sw2 = pn532_packetbuffer[response_len - 1];
#ifdef NTAG424DEBUG
  Serial.print(F("SW1: "));
  Serial.println(sw1, HEX);
  Serial.print(F("SW2: "));
  Serial.println(sw2, HEX);
#endif

  // 0x91 0x00 indicates success
  if (sw1 == 0x91 && sw2 == 0x00)
  {
    return 2; // return status length
  }
  return 0;
}
