// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.
#include "../internal.hpp"

/*!
    @brief   Zero the tags default file.

    @return  false on fail|true on success
*/
/**************************************************************************/
bool Adafruit_PN532::ntag424_FormatNDEF()
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_ISOCLA};
  uint8_t ins[1] = {NTAG424_CMD_ISOUPDATEBINARY};
  uint8_t p1[1] = {0x84};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t ndefdata[PN532_PACKBUFFSIZ - 10];
  uint8_t memsize = 248;
  memset(ndefdata, 0, sizeof(ndefdata));
  uint8_t result[12];
  bool ret = true;
  uint8_t offset = 0;
  uint8_t datalen = sizeof(ndefdata);
  for (int i = 0; i < memsize; i += sizeof(ndefdata))
  {
    Serial.print(i);
    Serial.print(": ");
    Serial.println(offset);
    p2[0] = offset;
    if ((offset + datalen) > memsize)
    {
      datalen = memsize - offset;
    }
    uint8_t bytesread = Adafruit_PN532::ntag424_apdu_send(
        cla, ins, p1, p2, cmd_header, 0, ndefdata, datalen, 0,
        NTAG424_COMM_MODE_PLAIN, result, sizeof(result)

    );
    if ((result[0] != 0x90) || (result[1] != 0x00))
    {
      ret = false;
    }
    offset += datalen;

    Serial.println(bytesread);
  }
  return ret;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

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

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/*!
    @brief   Select the default ISO-7816-4 dedicated filename of the application
   file.

    @param   dfn      buffer containing the ISO-7816-4 dedicated filename

    @return  false on fail|true on success
*/
/**************************************************************************/
bool Adafruit_PN532::ntag424_ISOSelectFileByDFN(uint8_t *dfn)
{
  /* Prepare the command */
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_ISOCLA};
  uint8_t ins[1] = {NTAG424_CMD_ISOSELECTFILE};
  uint8_t p1[1] = {0x4};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t result[12];

  /* Send the command */
  Adafruit_PN532::ntag424_apdu_send(cla, ins, p1, p2, cmd_header, 0, dfn, 7, 0,
                                    NTAG424_COMM_MODE_PLAIN, result,
                                    sizeof(result));
  if ((result[0] != 0x90) || (result[1] != 0x00))
  {
    return false;
  }
  return true;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/*!
    @brief   select file by fileid for the following commands.

    @param   fileid      fileid

    @return  false on fail|true on success
*/
/**************************************************************************/
bool Adafruit_PN532::ntag424_ISOSelectFileById(int fileid)
{
  // Select the default ISO-7816-4 name of the application file
  /* Prepare the command */
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_ISOCLA};
  uint8_t ins[1] = {NTAG424_CMD_ISOSELECTFILE};
  uint8_t p1[1] = {0x0};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t cmd_data[2] = {(byte)((fileid >> 8) & 0xff), (byte)(fileid & 0xff)};
  uint8_t result[12];

  /* Send the command */
  Adafruit_PN532::ntag424_apdu_send(cla, ins, p1, p2, cmd_header, 0, cmd_data,
                                    2, 0, NTAG424_COMM_MODE_PLAIN, result,
                                    sizeof(result)

  );
  if ((result[0] != 0x90) || (result[1] != 0x00))
  {
    return false;
  }
  return true;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/*!
    @brief   write data_to_write to picc. (Chip signature).

    @param   data_to_write     buffer containg the data to write
    @param   length            length of the buffer

    @return  false on fail|true on success
*/
/**************************************************************************/
bool Adafruit_PN532::ntag424_ISOUpdateBinary(uint8_t *data_to_write,
                                             uint8_t length)
{
  uint8_t cmac_short[8];
  uint8_t cla[1] = {NTAG424_COM_ISOCLA};
  uint8_t ins[1] = {NTAG424_CMD_ISOUPDATEBINARY};
  uint8_t p1[1] = {0x84};
  uint8_t p2[1] = {0x0};
  uint8_t cmd_header[1] = {0x00};
  uint8_t cmd_data[1] = {0x00};
  uint8_t result[12];

  uint8_t offset = 0;
  uint8_t datalen = PN532_PACKBUFFSIZ - 10;
  for (int i = 0; i < length; i += datalen)
  {
    Serial.print(i);
    Serial.print(": ");
    Serial.println(offset);
    p2[0] = offset;
    if ((offset + datalen) > length)
    {
      datalen = length - offset;
    }
    if (datalen > 0)
    {
      uint8_t bytesread = Adafruit_PN532::ntag424_apdu_send(
          cla, ins, p1, p2, cmd_header, 0, data_to_write + offset, datalen, 0,
          NTAG424_COMM_MODE_PLAIN, result, sizeof(result)

      );
    }
    offset += datalen;
  }
  if ((result[0] != 0x90) || (result[1] != 0x00))
  {
    return false;
  }
  return true;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

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

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

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

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

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
