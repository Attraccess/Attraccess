// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/**************************************************************************/
/*!
    @brief   send an apdu-frame to the picc, and wait for a response.

    @param *cla                   CLA/ISO prefix
    @param *ins                   Instruction or command
    @param *p1                    Parameter 1
    @param *p2                    Parameter 2
    @param *cmd_header            command header
    @param cmd_header_length      length of command_header
    @param *cmd_data              command data
    @param cmd_data_length        length of command data
    @param le                     TODO: check if needed.
    @param comm_mode              Communication mode: NTAG424_COMM_MODE_PLAIN,
   NTAG424_COMM_MODE_MAC or NTAG424_COMM_MODE_FULL
    @param *response              response buffer
    @param response_le            size of response buffer
    @return length of response
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_apdu_send(
    uint8_t *cla, uint8_t *ins, uint8_t *p1, uint8_t *p2, uint8_t *cmd_header,
    uint8_t cmd_header_length, uint8_t *cmd_data, uint8_t cmd_data_length,
    uint8_t le, uint8_t comm_mode, uint8_t *response, uint8_t response_le)
{
  Serial.print("cmd_counter: ");
  Serial.println(ntag424_Session.cmd_counter);
  uint8_t apdusize = (8 + (7 + cmd_header_length + cmd_data_length + 2)) & 0xff;
  uint8_t apdu[apdusize];
  uint8_t offset = 0;
  apdu[0] = PN532_COMMAND_INDATAEXCHANGE;
  apdu[1] = 0x01;
  apdu[2] = cla[0];
  apdu[3] = ins[0];
  apdu[4] = p1[0];
  apdu[5] = p2[0];
  apdu[6] = cmd_data_length + cmd_header_length;
  uint8_t offset_lc = 6;
  offset = 7;
  // apdu[4] = cmd_data_length + cmd_header_length;
  memcpy(apdu + offset, cmd_header, cmd_header_length);
  offset += cmd_header_length;

  if (comm_mode == NTAG424_COMM_MODE_PLAIN)
  {
    // we are done
    memcpy(apdu + offset, cmd_data, cmd_data_length);
    offset += cmd_data_length;
  }
  else if (comm_mode == NTAG424_COMM_MODE_MAC)
  {
    memcpy(apdu + offset, cmd_data, cmd_data_length);
    offset += cmd_data_length;
    uint8_t cmac_short[8];
    Adafruit_PN532::ntag424_MAC(ins, cmd_header, cmd_header_length, cmd_data,
                                cmd_data_length, cmac_short);
#ifdef NTAG424DEBUG
    Serial.println("CMAC NEW:");
    Adafruit_PN532::PrintHexChar(cmac_short, 8);
#endif
    memcpy(apdu + offset, cmac_short, 8);
    offset += 8;
    apdu[offset_lc] += 8;
  }
  else if (comm_mode == NTAG424_COMM_MODE_FULL)
  {
    if (!ntag424_encodeFullApdu(apdu, offset, offset_lc, ins, cmd_header, cmd_header_length, cmd_data, cmd_data_length)) return 0;
  }
  if (apdu[3] != NTAG424_CMD_ISOUPDATEBINARY)
  {
    apdu[offset] = le;
    offset++;
  }
  apdusize = offset;
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("PCD->PICC:"));
  Adafruit_PN532::PrintHexChar(apdu + 2, apdusize - 2);
#endif
  if (!sendCommandCheckAck((uint8_t *)apdu, apdusize))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
    return 0;
  }
  /* Read the response packet */
  // readdata(pn532_packetbuffer, 41);
  readdata(pn532_packetbuffer, response_le);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("PCD<-PICC: "));
  // Adafruit_PN532::PrintHexChar(pn532_packetbuffer + 8, 5 +
  // pn532_packetbuffer[3] - 8);
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 5 + pn532_packetbuffer[3]);
#endif
  //  increase cmd_counter
  ntag424_Session.cmd_counter += 1;

  uint8_t response_length = pn532_packetbuffer[3] - 3;
  memcpy(response, pn532_packetbuffer + 8, response_length);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("RESPONSE: "));
  Adafruit_PN532::PrintHexChar(response, response_length);
#endif
  return ntag424_decodeResponse(response, response_length, comm_mode);
}
