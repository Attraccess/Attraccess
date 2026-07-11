#include "gt911_touch.hpp"

#ifdef DISPLAY_DRIVER_GT911

#include "../../../utils.hpp"

bool Gt911Touch::probeAt(uint8_t address)
{
    i2c_master_dev_handle_t candidate = addSharedI2CDevice(address);
    if (!candidate)
    {
        return false;
    }
    dev = candidate;

    uint8_t id[4] = {0};
    if (!readRegs(REG_PRODUCT_ID, id, sizeof(id)) || id[0] != '9' || id[1] != '1' || id[2] != '1')
    {
        i2c_master_bus_rm_device(candidate);
        dev = nullptr;
        return false;
    }
    return true;
}

bool Gt911Touch::begin()
{
    if (dev)
    {
        return true;
    }
    return probeAt(ADDR_PRIMARY) || probeAt(ADDR_SECONDARY);
}

bool Gt911Touch::readRegs(uint16_t reg, uint8_t *buf, size_t len)
{
    if (!dev)
    {
        return false;
    }
    uint8_t regBytes[2] = {(uint8_t)(reg >> 8), (uint8_t)(reg & 0xFF)};
    return i2c_master_transmit_receive(dev, regBytes, sizeof(regBytes), buf, len,
                                       ATTRACTAP_I2C_XFER_TIMEOUT_MS) == ESP_OK;
}

bool Gt911Touch::writeReg8(uint16_t reg, uint8_t value)
{
    if (!dev)
    {
        return false;
    }
    uint8_t frame[3] = {(uint8_t)(reg >> 8), (uint8_t)(reg & 0xFF), value};
    return i2c_master_transmit(dev, frame, sizeof(frame), ATTRACTAP_I2C_XFER_TIMEOUT_MS) == ESP_OK;
}

int Gt911Touch::getPoint(int16_t &x, int16_t &y, bool &stale)
{
    uint8_t status = 0;
    if (!readRegs(REG_STATUS, &status, 1))
    {
        // Bus hiccup — treat like a stale poll; the caller's hold window is
        // capped so a wedged bus cannot leave a press stuck.
        stale = true;
        return 0;
    }

    bool bufferReady = (status & 0x80) != 0;
    uint8_t count = status & 0x0F;
    stale = !bufferReady;

    if (!bufferReady)
    {
        // No new scan since the last read — do not clear the status register.
        return 0;
    }

    int touches = 0;
    if (count >= 1)
    {
        // Point 0: track id, x lo, x hi, y lo, y hi, size lo, size hi, reserved.
        // The firmware only ever uses one touch point (old setMaxTouchPoint(1)).
        uint8_t data[8] = {0};
        if (readRegs(REG_POINT_0, data, sizeof(data)))
        {
            x = (int16_t)(data[1] | (data[2] << 8));
            y = (int16_t)(data[3] | (data[4] << 8));
            touches = 1;
        }
    }

    writeReg8(REG_STATUS, 0); // release the buffer for the next scan
    return touches;
}

#endif // DISPLAY_DRIVER_GT911
