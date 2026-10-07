// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#include "pn532_driver_internal.hpp"



/**************************************************************************/
/*!
    @brief  Setups the HW

    @returns  true if successful, otherwise false
*/
/**************************************************************************/
bool Adafruit_PN532::begin()
{
#ifdef NTAG424DEBUG
  Serial.println("NTAG424DEBUG: On");
  Serial.println("EncBuffer: 52");
#endif
  if (!i2c_dev)
  {
    return false;
  }
  // I2C initialization
  // PN532 will fail address check since its asleep, so suppress
  if (!i2c_dev->begin(false))
  {
    return false;
  }
  reset(); // HW reset - put in known state
  delay(10);
  wakeup(); // hey! wakeup!
  return true;
}



/**************************************************************************/
/*!
    @brief  Perform a hardware reset. Requires reset pin to have been provided.
*/
/**************************************************************************/
void Adafruit_PN532::reset(void)
{
  // RSTPD_N is not wired on any Attractap board — power-on reset only.
}



/**************************************************************************/
/*!
    @brief  Wakeup from LowVbat mode into Normal Mode.
*/
/**************************************************************************/
void Adafruit_PN532::wakeup(void)
{
  // PN532 will clock stretch I2C during SAMConfig as a "wakeup"

  // need to config SAM to stay in Normal Mode
  SAMConfig();
}
