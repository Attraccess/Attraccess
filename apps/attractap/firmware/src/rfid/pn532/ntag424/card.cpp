// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.
#include "../internal.hpp"

/*!
    @brief   Send getCardUID request to picc. Works even if random uid is
   active. Authentication required (key0 only, but i am not sure)

    @param   buffer     response buffer for the carduid (7 byte)

    @return  size of uid
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_GetCardUID(uint8_t *buffer)
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_CLA};
  uint8_t ins[1] = {NTAG424_CMD_GETCARDUUID};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t cmd_data[1] = {0x00};
  uint8_t result[34];

  uint8_t resp_size = Adafruit_PN532::ntag424_apdu_send(
      cla, ins, p1, p2, cmd_header, 0, cmd_data, 0, 0, NTAG424_COMM_MODE_FULL,
      result, sizeof(result)

  );

  if ((resp_size > 4) && (result[resp_size - 2] == 0x91) &&
      (result[resp_size - 1] == 0x00))
  {
    memcpy(buffer, result, resp_size - 2);
    return resp_size - 2;
  }
  return 0;
}

/*!
    @brief   Send GetTTStatus request to picc. (TagTamper status) Authentication
   required

    @param   buffer     response buffer for the status (7 byte)

    @return  size of status
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_GetTTStatus(uint8_t *buffer)
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_CLA};
  uint8_t ins[1] = {NTAG424_CMD_GETTTSTATUS};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t cmd_data[1] = {0x00};
  uint8_t result[32];

  uint8_t resp_size = Adafruit_PN532::ntag424_apdu_send(
      cla, ins, p1, p2, cmd_header, 0, cmd_data, 0, 0, NTAG424_COMM_MODE_FULL,
      result, sizeof(result)

  );
  if ((resp_size > 2) && (result[resp_size - 2] == 0x91) &&
      (result[resp_size - 1] == 0x00))
  {
    memcpy(buffer, result, resp_size - 2);
    return resp_size - 2;
  }
  return 0;
}

/*!
    @brief   Send ReadSig request to picc. (Chip signature). Authentication
   required

    @param   buffer     response buffer for the signature

    @return  size of status
*/
/**************************************************************************/
// Attention: ReadSig crashes currently. Response exceeds
// sizeof(pn532_packetbuffer). Maybe multiple reads?
uint8_t Adafruit_PN532::ntag424_ReadSig(uint8_t *buffer)
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_CLA};
  uint8_t ins[1] = {NTAG424_CMD_READSIG};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t cmd_data[1] = {0x00};
  uint8_t result[58];
  uint8_t resp_size = Adafruit_PN532::ntag424_apdu_send(
      cla, ins, p1, p2, cmd_header, 0, cmd_data, 1, 0, NTAG424_COMM_MODE_MAC,
      result, sizeof(result));
  memcpy(buffer, result, resp_size);
  return resp_size;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/*!
    @brief   sends a GetFileSettings-call to the picc, copies result into
   buffer.

    @param   fileno       fileno
    @param   buffer       buffer
    @param   comm_mode    one off NTAG424_COMM_MODE_PLAIN, NTAG424_COMM_MODE_MAC
   or NTAG424_COMM_MODE_FULL

    @return  length of result
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_GetFileSettings(uint8_t fileno, uint8_t *buffer,
                                                uint8_t comm_mode)
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_CLA};
  uint8_t ins[1] = {NTAG424_CMD_GETFILESETTINGS};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {fileno};
  uint8_t cmd_data[1] = {0x00};
  uint8_t result[64];
  int resultlength = Adafruit_PN532::ntag424_apdu_send(
      cla, ins, p1, p2, cmd_header, sizeof(cmd_header), cmd_data, 0, 0,
      comm_mode, result, sizeof(result)

  );
  memcpy(buffer, result, resultlength);
  return resultlength;
}

/*!
    @brief   sends a ChangeFileSettings-call to the picc.

    @param   fileno                 fileno
    @param   filesettings           buffer with encoded filesettings
    @param   filesettings_length    size of filesettings buffer
    @param   comm_mode    one off NTAG424_COMM_MODE_PLAIN, NTAG424_COMM_MODE_MAC
   or NTAG424_COMM_MODE_FULL

    @return  length of result
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_ChangeFileSettings(uint8_t fileno,
                                                   uint8_t *filesettings,
                                                   uint8_t filesettings_length,
                                                   uint8_t comm_mode)
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_CLA};
  uint8_t ins[1] = {NTAG424_CMD_CHANGEFILESETTINGS};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {fileno};
  uint8_t cmd_data[1] = {0x0};
  uint8_t result[30];
  uint8_t resultlength = Adafruit_PN532::ntag424_apdu_send(
      cla, ins, p1, p2, cmd_header, sizeof(cmd_header), filesettings,
      filesettings_length, 0, comm_mode, result, sizeof(result));
  // memcpy(buffer, result, 16);
  return resultlength;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/*!
    @brief   Send GetVersion Request and check HW type in response.

    @return  1 = its an NTAG424-Tag; 0 = its something else
*/
/**************************************************************************/

uint8_t Adafruit_PN532::ntag424_isNTAG424()
{
  ntag424_GetVersion();
  // HW type (Byte 2) for NTAG424 = 0x04
  if (ntag424_VersionInfo.HWType == NTAG424_RESPONE_GETVERSION_HWTYPE_NTAG424)
  {
    return 1;
  }
  return 0;
}

/*!
    @brief   Send GetVersion Requests to picc. Data goes to global
   ntag424_VersionInfo

    @return  1 = its an NTAG424-Tag; 0 = its something else
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_GetVersion()
{
  /* Prepare the command */
  pn532_packetbuffer[0] = PN532_COMMAND_INDATAEXCHANGE;
  pn532_packetbuffer[1] = 1; /* Card number */
  pn532_packetbuffer[2] = NTAG424_COM_CLA;
  pn532_packetbuffer[3] = NTAG424_CMD_GETVERSION;
  pn532_packetbuffer[4] = 0x0;
  pn532_packetbuffer[5] = 0x0;
  pn532_packetbuffer[6] = 0x0;

  /* Send the command */
  if (!sendCommandCheckAck(pn532_packetbuffer, 7))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
    return 0;
  }
  readdata(pn532_packetbuffer, 15);
  ntag424_VersionInfo.VendorID = pn532_packetbuffer[8];
  ntag424_VersionInfo.HWType = pn532_packetbuffer[9];
  ntag424_VersionInfo.HWSubType = pn532_packetbuffer[10];
  ntag424_VersionInfo.HWMajorVersion = pn532_packetbuffer[11];
  ntag424_VersionInfo.HWMinorVersion = pn532_packetbuffer[12];
  ntag424_VersionInfo.HWStorageSize = pn532_packetbuffer[13];
  ntag424_VersionInfo.HWProtocol = pn532_packetbuffer[14];

  // NOTE: upstream Adafruit code wrote `if (!pn532_packetbuffer[14] == 0xaf)`,
  // which is always false — the additional-frame check was never active. Kept
  // disabled for behavior parity with the shipped Arduino builds.
  pn532_packetbuffer[0] = PN532_COMMAND_INDATAEXCHANGE;
  pn532_packetbuffer[1] = 1; /* Card number */
  pn532_packetbuffer[2] = NTAG424_COM_CLA;
  pn532_packetbuffer[3] = NTAG424_CMD_NEXTFRAME;
  pn532_packetbuffer[4] = 0x0;
  pn532_packetbuffer[5] = 0x0;
  pn532_packetbuffer[6] = 0x0;
  /* Send the command */
  if (!sendCommandCheckAck(pn532_packetbuffer, 7))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
    return 0;
  }
  readdata(pn532_packetbuffer, 15);
  ntag424_VersionInfo.VendorID = pn532_packetbuffer[8];
  ntag424_VersionInfo.SWType = pn532_packetbuffer[9];
  ntag424_VersionInfo.SWSubType = pn532_packetbuffer[10];
  ntag424_VersionInfo.SWMajorVersion = pn532_packetbuffer[11];
  ntag424_VersionInfo.SWMinorVersion = pn532_packetbuffer[12];
  ntag424_VersionInfo.SWStorageSize = pn532_packetbuffer[13];
  ntag424_VersionInfo.SWProtocol = pn532_packetbuffer[14];

  // See note above: the upstream additional-frame check was never active.
  pn532_packetbuffer[0] = PN532_COMMAND_INDATAEXCHANGE;
  pn532_packetbuffer[1] = 1; /* Card number */
  pn532_packetbuffer[2] = NTAG424_COM_CLA;
  pn532_packetbuffer[3] = NTAG424_CMD_NEXTFRAME;
  pn532_packetbuffer[4] = 0x0;
  pn532_packetbuffer[5] = 0x0;
  pn532_packetbuffer[6] = 0x0;
  /* Send the command */
  if (!sendCommandCheckAck(pn532_packetbuffer, 7))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
    return 0;
  }
  readdata(pn532_packetbuffer, 15);
  memcpy(&ntag424_VersionInfo.UID, (uint8_t *)pn532_packetbuffer + 8, 7);
  uint8_t BatchNo[5] = {pn532_packetbuffer[15], pn532_packetbuffer[16],
                        pn532_packetbuffer[17], pn532_packetbuffer[18],
                        (byte)(pn532_packetbuffer[19] & 0xf0)};
  memcpy(&ntag424_VersionInfo.BatchNo, BatchNo, 5);
  uint8_t FabKey[5] = {(byte)(pn532_packetbuffer[19] & 0x0f),
                       pn532_packetbuffer[20],
                       (byte)(pn532_packetbuffer[21] & 0x80)};
  memcpy(&ntag424_VersionInfo.FabKey, FabKey, 5);
  ntag424_VersionInfo.CWProd = (byte)(pn532_packetbuffer[21] & 0x3f);
  ntag424_VersionInfo.YearProd = pn532_packetbuffer[22];
  if (pn532_packetbuffer[23] != 0x91)
  {
    ntag424_VersionInfo.FabKeyID = pn532_packetbuffer[23];
  }
  else
  {
    ntag424_VersionInfo.FabKeyID = 0;
  }
#ifdef NTAG424DEBUG
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 18);
#endif

  if (pn532_packetbuffer[9] == NTAG424_RESPONE_GETVERSION_HWTYPE_NTAG424)
  {
    return 1;
  }

#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.println(F("Card is not an NTAG424"));
#endif
  return 0;
}
