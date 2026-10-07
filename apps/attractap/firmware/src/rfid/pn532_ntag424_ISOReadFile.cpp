// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/*!
    @brief   read the default ISO-7816-4 dedicated file / read the tag for
   example ndef-data.

    @param   buffer     response buffer

    @return  datasize
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_ISOReadFile(uint8_t *buffer)
{
  if (!ntag424_selectNdefForRead()) return 0;
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.println(F("ISOReadBinary1 to get the filesize"));
#endif
  // Select the default ISO-7816-4 DF name of the application file
  /* Prepare the command */
  pn532_packetbuffer[0] = PN532_COMMAND_INDATAEXCHANGE;
  pn532_packetbuffer[1] = 1; /* Card number */
  pn532_packetbuffer[2] = NTAG424_COM_ISOCLA;
  pn532_packetbuffer[3] = NTAG424_CMD_ISOREADBINARY;
  pn532_packetbuffer[4] = 0x0;
  pn532_packetbuffer[5] = 0x0;
  pn532_packetbuffer[6] = 0x3;

  /* Send the command */
  if (!sendCommandCheckAck(pn532_packetbuffer, 7))
  {
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
    return 0;
  }
  /* Read the response packet */
  readdata(pn532_packetbuffer, 26);
  int filesize = (int)pn532_packetbuffer[9] - 5;

#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print("filesize: ");
  PN532DEBUGPRINT.println(filesize);
  Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 26);
#endif

  uint8_t pagesize = 32;
  uint8_t pages = (filesize / pagesize) + 1;
  uint8_t offset = 0;
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print("pages: ");
  PN532DEBUGPRINT.println(pages);
#endif
  for (int i = 0; i < pages; i++)
  {
    offset = i * pagesize;
    if (offset + pagesize > filesize)
    {
      pagesize = filesize - offset;
    }

#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.print(F("ISOReadBinary2-"));
    PN532DEBUGPRINT.println(i);
#endif

    // Select the default ISO-7816-4 DF name of the application file
    /* Prepare the command */
    pn532_packetbuffer[0] = PN532_COMMAND_INDATAEXCHANGE;
    pn532_packetbuffer[1] = 1; /* Card number */
    pn532_packetbuffer[2] = NTAG424_COM_ISOCLA;
    pn532_packetbuffer[3] = NTAG424_CMD_ISOREADBINARY;
    pn532_packetbuffer[4] = 0x0;
    pn532_packetbuffer[5] = 7 + offset;
    pn532_packetbuffer[6] = pagesize;

    /* Send the command */
    if (!sendCommandCheckAck(pn532_packetbuffer, 7))
    {
#ifdef NTAG424DEBUG
      PN532DEBUGPRINT.println(F("Failed to receive ACK for write command"));
#endif
      return 0;
    }

    /* Read the response packet */
    readdata(pn532_packetbuffer, 64);
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Received: "));
    Adafruit_PN532::PrintHexChar(pn532_packetbuffer, 64);
#endif
    /* If byte 8 isn't 0x00 we probably have an error */
    if (pn532_packetbuffer[7] == 0x00)
    {
      /* Copy the the data bytes to the output buffer         */
      /* Block content starts at byte 9 of a valid response */
      memcpy(&buffer[offset], pn532_packetbuffer + 8, pagesize);
    }
    else
    {
#ifdef NTAG424DEBUG
      PN532DEBUGPRINT.println(F("Unexpected response reading block: "));
#endif
      return 0;
    }
  }
  // Return OK signal
  return filesize;
}
