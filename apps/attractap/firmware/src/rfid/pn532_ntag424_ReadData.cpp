// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/*!
    @brief   Send ReadData request to picc.

    @param   buffer     buffer for the read data
    @param   fileno     fileno to read
    @param   offset     offset where to start to read from
    @param   size       number of bytes to read

    @return  size of status
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_ReadData(uint8_t *buffer, int fileno,
                                         int offset, int size)
{
  /*
  uint8_t cmd[1] = {NTAG424_CMD_READDATA};
  uint8_t cmd_header[7] = {fileno,  offset & 0xff, (offset >> 8) & 0xff, (offset
  >> 16) & 0xff, size & 0xff, (size >> 8) & 0xff,  (size >> 16) & 0xff}; uint8_t
  signature[8]; Adafruit_PN532::ntag424_MAC(cmd, cmd_header, sizeof(cmd_header),
  cmd_header, 0 , signature);
  */
  /* Prepare the command */
  pn532_packetbuffer[0] = PN532_COMMAND_INDATAEXCHANGE;
  pn532_packetbuffer[1] = 1; /* Card number */
  pn532_packetbuffer[2] = NTAG424_COM_CLA;
  pn532_packetbuffer[3] = NTAG424_CMD_READDATA;
  pn532_packetbuffer[4] = 0;
  pn532_packetbuffer[5] = 0;
  // Lc
  pn532_packetbuffer[6] = 0x07;
  // FileNo
  pn532_packetbuffer[7] = fileno;
  // offset
  pn532_packetbuffer[8] = offset & 0xff;
  pn532_packetbuffer[9] = (offset >> 8) & 0xff;
  pn532_packetbuffer[10] = (offset >> 16) & 0xff;
  // length
  pn532_packetbuffer[11] = size & 0xff;
  pn532_packetbuffer[12] = (size >> 8) & 0xff;
  pn532_packetbuffer[13] = (size >> 16) & 0xff;

  // memcpy(&pn532_packetbuffer + 14, signature, 8);

  // Le
  // pn532_packetbuffer[14 + 8] = 0;
  pn532_packetbuffer[14] = 0;
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.println(F("> ReadData - PCD apdu: "));
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 15);
#endif

  /* Send the command */
  if (!sendCommandCheckAck(pn532_packetbuffer, 15))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
    return 0;
  }

  /* Read the response packet */
  readdata(pn532_packetbuffer, 17 + size);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.println(F("Received: "));
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 80);
#endif
  uint8_t datasize = pn532_packetbuffer[12];
  uint8_t offsetPW = 8 + size;
  /* If byte 8 isn't 0x00 we probably have an error */
  if ((pn532_packetbuffer[7] == 0x00) &&
      (pn532_packetbuffer[offsetPW] == 0x91) &&
      (pn532_packetbuffer[offsetPW + 1] == 0x00))
  {
#ifdef NTAG424DEBUG
    Adafruit_PN532::PrintHexChar(pn532_packetbuffer + 17, datasize);
    Adafruit_PN532::PrintHexChar(pn532_packetbuffer + offsetPW, 1);
    Adafruit_PN532::PrintHexChar(pn532_packetbuffer + offsetPW + 1, 1);
    Serial.println(datasize);
#endif
    memcpy(buffer, pn532_packetbuffer + 17, datasize);
  }
  else
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Unexpected response reading block: "));
    Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 26);
#endif
    return 0;
  }
  // Return OK signal
  return datasize;
}
