// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"

uint8_t Adafruit_PN532::ntag424_selectNdefForRead()
{
  // uint16_t filesize =  Adafruit_PN532::ntag424_GetFileSize(buffer);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.println(F("ISOGetFileSettings"));
#endif
  // call getfilesettings
  /* Prepare the command */
  pn532_packetbuffer[0] = PN532_COMMAND_INDATAEXCHANGE;
  pn532_packetbuffer[1] = 1; /* Card number */
  pn532_packetbuffer[2] = NTAG424_COM_CLA;
  pn532_packetbuffer[3] = NTAG424_CMD_GETFILESETTINGS;
  pn532_packetbuffer[4] = 0x0;
  pn532_packetbuffer[5] = 0x0;
  pn532_packetbuffer[6] = 0x1;
  pn532_packetbuffer[7] = 0x2;
  pn532_packetbuffer[8] = 0x0;
  /* Send the command */
  if (!sendCommandCheckAck(pn532_packetbuffer, 9))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
    return 0;
  }
  readdata(pn532_packetbuffer, 26);
#ifdef NTAG424DEBUG
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 26);
  PN532DEBUGPRINT.println(F("ISOReadFile"));
  PN532DEBUGPRINT.println(F("ISOSelectFile1"));
#endif
  // Select the default ISO-7816-4 DF name of the application file
  /* Prepare the command */
  pn532_packetbuffer[0] = PN532_COMMAND_INDATAEXCHANGE;
  pn532_packetbuffer[1] = 1; /* Card number */
  pn532_packetbuffer[2] = NTAG424_COM_ISOCLA;
  pn532_packetbuffer[3] = NTAG424_CMD_ISOSELECTFILE;
  pn532_packetbuffer[4] = 0x4;
  pn532_packetbuffer[5] = 0x0;
  pn532_packetbuffer[6] = 0x7;
  pn532_packetbuffer[7] = 0xd2;
  pn532_packetbuffer[8] = 0x76;
  pn532_packetbuffer[9] = 0x0;
  pn532_packetbuffer[10] = 0x0;
  pn532_packetbuffer[11] = 0x85;
  pn532_packetbuffer[12] = 0x01;
  pn532_packetbuffer[13] = 0x01;
  pn532_packetbuffer[14] = 0x0;
  /* Send the command */
  if (!sendCommandCheckAck(pn532_packetbuffer, 15))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
    return 0;
  }

  /* Read the response packet */
  readdata(pn532_packetbuffer, 26);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.println(F("Received: "));
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 26);
#endif

  /* If byte 8 isn't 0x00 we probably have an error */
  if (!((pn532_packetbuffer[7] == 0x00) && (pn532_packetbuffer[8] == 0x90)))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Error while selecting iso-file 1: "));
    Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 26);
#endif
    return 0;
  }

#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.println(F("ISOSelectFile2"));
#endif
  // Select the default ISO-7816-4 DF name of the application file
  /* Prepare the command */
  pn532_packetbuffer[0] = PN532_COMMAND_INDATAEXCHANGE;
  pn532_packetbuffer[1] = 1; /* Card number */
  pn532_packetbuffer[2] = NTAG424_COM_ISOCLA;
  pn532_packetbuffer[3] = NTAG424_CMD_ISOSELECTFILE;
  pn532_packetbuffer[4] = 0x0;
  pn532_packetbuffer[5] = 0x0;
  pn532_packetbuffer[6] = 0x2;
  pn532_packetbuffer[7] = 0xe1;
  pn532_packetbuffer[8] = 0x04;
  pn532_packetbuffer[9] = 0x0;
  /* Send the command */
  if (!sendCommandCheckAck(pn532_packetbuffer, 10))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
    return 0;
  }

  /* Read the response packet */
  readdata(pn532_packetbuffer, 26);
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print("GetFileInfo: ");
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 26);
#endif

  /* If byte 8 isn't 0x00 we probably have an error */
  if (!((pn532_packetbuffer[7] == 0x00) && (pn532_packetbuffer[8] == 0x90)))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Error while selecting iso-file 2"));
    Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 26);
#endif
    return 0;
  }
  return 1;
}
