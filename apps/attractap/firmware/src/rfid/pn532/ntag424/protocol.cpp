// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.
#include "../internal.hpp"

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

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

/***** NTAG424 Functions ******/

/**************************************************************************/
/*!
    @brief   create bytecount random bytes into output.

    @param   output     buffer to generate randomness in
    @param   bytecount  amount of bytes randomness to create in buffer

    @return
*/
/**************************************************************************/
void Adafruit_PN532::ntag424_random(uint8_t *output, uint8_t bytecount)
{
  for (int i = 0; i < bytecount; i++)
  {
    output[i] = (uint8_t)(esp_random() & 0xFF); // was Arduino random(256)
  }
}

/**************************************************************************/
/*!
    @brief   add padding to a buffer.

    @param   inputlength
    @param   paddinglength
    @param   buffer input & outputbuffer needs to be big enough for inputlength
   + padding worstcase

    @return  the new length of buffer including the added zeroes
*/
/**************************************************************************/
uint8_t Adafruit_PN532::ntag424_addpadding(uint8_t inputlength,
                                           uint8_t paddinglength,
                                           uint8_t *buffer)
{
  uint8_t zeroestoadd = paddinglength - (inputlength % paddinglength);
  memset(buffer + inputlength, 0, zeroestoadd);
  if (zeroestoadd > 0)
  {
    buffer[inputlength] = 0x80;
  }
  return inputlength + zeroestoadd;
}

/**************************************************************************/
/*!
    @brief   calculate and return the crc32 of data.

    @param   data      databuffer needs to be of size datalength
    @param   datalength

    @return  uint32 crc
*/
/**************************************************************************/

uint32_t Adafruit_PN532::ntag424_crc32(uint8_t *data, uint8_t datalength)
{
  Adafruit_PN532::PrintHexChar((uint8_t const *)data, datalength);
  // Standard reflected CRC-32 (zlib polynomial) — matches the old
  // Arduino_CRC32 library bit-for-bit (esp_rom_crc32_le inverts on entry/exit).
  uint32_t const crc32_res = esp_rom_crc32_le(0, (uint8_t const *)data, datalength);
  Serial.println(crc32_res, HEX);
  return crc32_res;
}

/**************************************************************************/
/*!
    @brief   left-rotate the bufferlen bytes of input by rotation bytes into
   output.

    @param   input      inputbuffer needs to be of size bufferlen
    @param   output     outputbuffer needs to be of size bufferlen
    @param   bufferlen  size of input & output-buffer
    @param   rotation     number of random bytes to rotate

    @return
*/
/**************************************************************************/

uint8_t Adafruit_PN532::ntag424_rotl(uint8_t *input, uint8_t *output,
                                     uint8_t bufferlen, uint8_t rotation)
{
  uint8_t overlap[16];
  if ((rotation > 16) || (bufferlen < rotation))
  {
    // no overflow
    PN532DEBUGPRINT.print(F("rotation-error: overflow or negative rotation"));
    return 0;
  }

#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("rotation-before: "));
  Adafruit_PN532::PrintHexChar(input, bufferlen);
#endif

  for (int i = 0; i < bufferlen; i++)
  {
    int z = i - rotation;
    if (z < 0)
    {
      z = bufferlen + z;
    }
    output[z] = input[i];
  }
#ifdef NTAG424DEBUG
  PN532DEBUGPRINT.print(F("rotation-after: "));
  Adafruit_PN532::PrintHexChar(output, bufferlen);
#endif
  return 1;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

uint8_t Adafruit_PN532::ntag424_decodeResponse(uint8_t *response, uint8_t response_length, uint8_t comm_mode)
{
  uint8_t resp_cmac_ok = 0;
  // check the responsemac if there is a MAC
  if ((response_length >= 10) && ((comm_mode == NTAG424_COMM_MODE_FULL) ||
                                  (comm_mode == NTAG424_COMM_MODE_MAC)))
  {
    uint8_t respcmac[8];
    memcpy(respcmac, response + (response_length - 10), 8);
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.print(F("response cmac:"));
    Adafruit_PN532::PrintHex(respcmac, 8);
#endif

    uint8_t *checkmacin = (uint8_t *)malloc(response_length + 6);
    uint8_t maclength = 0;
    checkmacin[0] = response[response_length - 1];
    checkmacin[1] = ntag424_Session.cmd_counter & 0xff;
    checkmacin[2] = (ntag424_Session.cmd_counter >> 8) & 0xff;
    memcpy(checkmacin + 3, ntag424_authresponse_TI,
           NTAG424_AUTHRESPONSE_TI_SIZE);
    uint8_t padded_respdata_length = 0;
    if (response_length > 10)
    {
      padded_respdata_length = response_length - 10;
      memcpy(checkmacin + 3 + NTAG424_AUTHRESPONSE_TI_SIZE, response,
             padded_respdata_length);
    }
    maclength = 3 + NTAG424_AUTHRESPONSE_TI_SIZE + padded_respdata_length;
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.print(F("checkcmac input: "));
    Adafruit_PN532::PrintHex(checkmacin, maclength);
#endif
    uint8_t checkmac[8];

    Adafruit_PN532::ntag424_cmac_short(ntag424_Session.session_key_mac,
                                       checkmacin, maclength, checkmac);
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.print(F("checkcmac:"));
    Adafruit_PN532::PrintHex(checkmac, 8);
#endif
    free(checkmacin);
    for (int i = 0; i < 8; i++)
    {
      if (respcmac[i] != checkmac[i])
      {
#ifdef NTAG424DEBUG
        PN532DEBUGPRINT.println(
            F("Response CMAC integrity error! (picc <> pcd)"));
        Adafruit_PN532::PrintHex(respcmac, 8);
        PN532DEBUGPRINT.print(F(" <> "));
        Adafruit_PN532::PrintHex(checkmac, 8);
#endif
        return 0;
      }
    }
    PN532DEBUGPRINT.println(F("Response CMAC ok! (picc == pcd)"));
  }
  // decrypt the response in mode.full
  // A successful write can contain only its CMAC and 0x9100 status trailer.
  // There is no encrypted payload to allocate or decrypt in that case.
  if ((response_length > 10) && (comm_mode == NTAG424_COMM_MODE_FULL))
  {
    uint8_t ivd[32];
    uint8_t ivde[16];
    ivd[0] = 0x5A;
    ivd[1] = 0xA5;
    memcpy(ivd + 2, ntag424_authresponse_TI, 4);
    ivd[6] = ntag424_Session.cmd_counter & 0xff;
    ivd[7] = (ntag424_Session.cmd_counter >> 8) & 0xff;
    memset(ivd + 7, 0, 25);
    // Serial.println("IV-init:");
    // Adafruit_PN532::PrintHex(iv, 16);
    // Same overflow as the command-IV path: only one block fits in ivde[16].
    if (!Adafruit_PN532::ntag424_encrypt(ntag424_Session.session_key_enc,
                                         sizeof(ivde), ivd, ivde))
    {
      return 0;
    }
    uint8_t *respplain = (uint8_t *)malloc(response_length - 10);
    if (respplain == nullptr)
    {
      return 0;
    }
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Encrypted Response(pcd < picc)"));
    Adafruit_PN532::PrintHex(response, response_length - 10);
#endif
    if (!Adafruit_PN532::ntag424_decrypt(ntag424_Session.session_key_enc, ivde,
                                         response_length - 10, response, respplain))
    {
      free(respplain);
      return 0;
    }
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(F("Decrypted Response(pcd < picc)"));
    Adafruit_PN532::PrintHex(respplain, response_length - 10);
#endif
    // 10 byte = cmac+responsecode
    // Serial.println(response_length);
    memcpy(response, respplain, response_length - 10);
    uint8_t resp_no_padding = response_length - 10;
    if (response_length > 10)
    {
      // Scan from the end for ISO/IEC 7816-4 padding (0x80 … 0x00). Uses
      // uint8_t (as before the IDF v6 migration) but iterates i>0 with idx=i-1
      // so the loop terminates correctly: `i >= 0` on an unsigned type is
      // always true and would wrap 255→0 (OOB read) or trip -Wtype-limits.
      for (uint8_t i = response_length - 10; i > 0; i--)
      {
        uint8_t idx = i - 1;
        // Serial.println(idx);
        if (response[idx] == 0x00)
        {
          resp_no_padding = idx;
        }
        else if (response[idx] == 0x80)
        {
          resp_no_padding = idx;
          break;
        }
        else
        {
          // nopadding?
          break;
        }
      }
    }
#ifdef NTAG424DEBUG
    PN532DEBUGPRINT.println(resp_no_padding);
#endif
    free(respplain);
    memcpy(response + resp_no_padding, response + response_length - 2, 2);
    resp_no_padding += 2;
    memset(response + resp_no_padding, 0, response_length - resp_no_padding);
    response_length = resp_no_padding;
  }
  return response_length;
}

// Adafruit PN532 driver, BSD license. Original notice: pn532/history.hpp.

uint8_t Adafruit_PN532::ntag424_encodeFullApdu(uint8_t *apdu, uint8_t &offset, uint8_t offset_lc, uint8_t *ins, uint8_t *cmd_header, uint8_t cmd_header_length, uint8_t *cmd_data, uint8_t cmd_data_length)
{
#ifdef NTAG424DEBUG
    Serial.println("ENC NEW:");
    Serial.println("APDU UNENC:");
    Adafruit_PN532::PrintHexChar(apdu, offset);
#endif
    uint8_t cmac_short[8];
    uint8_t padded_payload_length = 16 + cmd_data_length;
    uint8_t payload_padded[padded_payload_length];
    if (cmd_data_length > 0)
    {
      // Add padding to the cmddata
      memcpy(payload_padded, cmd_data, cmd_data_length);
      padded_payload_length = Adafruit_PN532::ntag424_addpadding(
          cmd_data_length, 16, payload_padded);
#ifdef NTAG424DEBUG
      Serial.print("CMDDATA Length:");
      Serial.println(cmd_data_length);
      Adafruit_PN532::PrintHexChar(payload_padded, cmd_data_length);
      Serial.println("CMDDATA Padded:");
      Serial.println(padded_payload_length);
      Adafruit_PN532::PrintHexChar(payload_padded, padded_payload_length);
#endif
      // assemble iv
      uint8_t iv[32];
      uint8_t ive[16];
      iv[0] = 0xA5;
      iv[1] = 0x5A;
      memcpy(iv + 2, ntag424_authresponse_TI, 4);
      iv[6] = ntag424_Session.cmd_counter & 0xff;
      iv[7] = (ntag424_Session.cmd_counter >> 8) & 0xff;
      memset(iv + 7, 0, 24); // was 25
#ifdef NTAG424DEBUG
      Serial.println("IV-init:");
      Adafruit_PN532::PrintHex(iv, 16);
#endif
      // Only the first AES block is the IV; encrypting sizeof(iv)=32 bytes
      // would overflow ive[16] and smash the stack (crashed changeKey on IDF).
      if (!Adafruit_PN532::ntag424_encrypt(ntag424_Session.session_key_enc,
                                           sizeof(ive), iv, ive))
      {
        return 0;
      }
      // encrypt cmd_data using SesAuthENCKey
      // padded_payload_length
      // uint8_t payload_encrypted[32];
      uint8_t payload_encrypted[52];
      if (!Adafruit_PN532::ntag424_encrypt(ntag424_Session.session_key_enc, ive,
                                           padded_payload_length, payload_padded,
                                           payload_encrypted))
      {
        return 0;
      }
      memcpy(apdu + offset, payload_encrypted, padded_payload_length);
#ifdef NTAG424DEBUG
      Serial.println("APDU Payload:");
      Adafruit_PN532::PrintHexChar(apdu, offset);
      Serial.println("CMDDATA ENC:");
      Serial.println(padded_payload_length);
      Serial.println("CMD:");
      Serial.println(ins[0], HEX);
      Adafruit_PN532::PrintHex(payload_encrypted, padded_payload_length);
#endif
      offset += padded_payload_length;
#ifdef NTAG424DEBUG
      Serial.println("APDU PREMAC:");
      Adafruit_PN532::PrintHexChar(apdu, offset);
#endif
      // add CMAC
      Adafruit_PN532::ntag424_MAC(
          ntag424_Session.session_key_mac, ins, cmd_header, cmd_header_length,
          payload_encrypted, padded_payload_length, cmac_short);
      memcpy(apdu + offset, cmac_short, 8);
      offset += 8;
      apdu[offset_lc] = cmd_header_length + padded_payload_length + 8;
#ifdef NTAG424DEBUG
      Serial.println("APDU AFTERMAC:");
      Adafruit_PN532::PrintHexChar(apdu, offset);
#endif
    }
    else
    {
      Adafruit_PN532::ntag424_MAC(ntag424_Session.session_key_mac, ins,
                                  cmd_header, cmd_header_length, cmd_data,
                                  cmd_data_length, cmac_short);
      memcpy(apdu + offset, cmac_short, 8);
      offset += 8;
      apdu[offset_lc] += 8;
#ifdef NTAG424DEBUG
      Serial.println("APDU AFTERMAC:");
      Adafruit_PN532::PrintHexChar(apdu, offset);
#endif
    }
#ifdef NTAG424DEBUG
    Serial.println(offset);
    Serial.println("APDU ENC:");
    Adafruit_PN532::PrintHexChar(apdu, offset);
#endif
  return 1;
}
