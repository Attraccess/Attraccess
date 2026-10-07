// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"

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
