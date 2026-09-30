#pragma once

#include <cstdint>
#include "driver/i2c_master.h"

/**
 * Minimal GT911 touch reader on the shared i2c_master bus.
 *
 * Replaces the vendored SensorLib TouchDrvGT911 with exactly what the
 * firmware uses: probe at 0x5D then 0x14, poll one touch point, and expose
 * the stale-sample flag the ATT-541 ghost-release suppression depends on
 * (SensorLib was locally patched to add isLastSampleStale(); the managed
 * esp_lcd_touch_gt911 component has no such concept, hence first-party).
 *
 * Callers must hold I2CBusGuard around begin() and getPoint(): one point
 * read is a status-read -> point-read -> status-clear conversation of up to
 * three transactions that must not interleave with PN532 traffic (ATT-554).
 */
class Gt911Touch
{
public:
    static constexpr uint8_t ADDR_PRIMARY = 0x5D;
    static constexpr uint8_t ADDR_SECONDARY = 0x14;

    // Probes both addresses (product ID register must read "911").
    // Returns true when the controller was found.
    bool begin();

    /**
     * Polls the controller for one touch point.
     *
     * @param x     out: X coordinate (panel-native orientation)
     * @param y     out: Y coordinate
     * @param stale out: true when the controller had no fresh sample since the
     *              last read (buffer-ready flag clear) — the caller holds the
     *              previous press through such polls
     * @return number of active touches in the fresh sample (0 or 1), 0 when stale
     */
    int getPoint(int16_t &x, int16_t &y, bool &stale);

    bool found() const { return dev != nullptr; }

private:
    static constexpr uint16_t REG_PRODUCT_ID = 0x8140;
    static constexpr uint16_t REG_STATUS = 0x814E;
    static constexpr uint16_t REG_POINT_0 = 0x814F;

    i2c_master_dev_handle_t dev = nullptr;

    bool probeAt(uint8_t address);
    bool readRegs(uint16_t reg, uint8_t *buf, size_t len);
    bool writeReg8(uint16_t reg, uint8_t value);
};
