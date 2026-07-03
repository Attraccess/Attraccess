#pragma once

// I2C transport for the vendored Adafruit PN532 driver, replacing
// Adafruit_I2CDevice (BusIO) with the ESP-IDF i2c_master driver. Exposes the
// exact call surface the driver uses: begin() / read(buf, n) / write(buf, n).
// Framing is byte-identical: the PN532 prepends a ready/status byte to every
// I2C read, which the driver already accounts for by reading n+1 bytes.

#include <cstddef>
#include <cstdint>

#include "../utils.hpp"

class Pn532I2cDevice
{
public:
    explicit Pn532I2cDevice(uint8_t address7bit) : address(address7bit) {}

    // addrDetect=false in the driver (the PN532 is asleep at begin and would
    // NAK a probe) — with i2c_master we simply skip probing either way.
    bool begin(bool addrDetect = true)
    {
        (void)addrDetect;
        if (!dev)
        {
            dev = addSharedI2CDevice(address);
        }
        return dev != nullptr;
    }

    bool read(uint8_t *buffer, size_t len)
    {
        if (!dev)
            return false;
        return i2c_master_receive(dev, buffer, len, ATTRACTAP_I2C_XFER_TIMEOUT_MS) == ESP_OK;
    }

    bool write(const uint8_t *buffer, size_t len)
    {
        if (!dev)
            return false;
        return i2c_master_transmit(dev, buffer, len, ATTRACTAP_I2C_XFER_TIMEOUT_MS) == ESP_OK;
    }

private:
    uint8_t address;
    i2c_master_dev_handle_t dev = nullptr;
};
