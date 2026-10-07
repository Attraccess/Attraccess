// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



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
