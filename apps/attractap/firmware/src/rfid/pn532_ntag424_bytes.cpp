// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"


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
