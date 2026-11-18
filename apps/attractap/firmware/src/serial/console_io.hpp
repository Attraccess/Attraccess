#pragma once

// The console port the Serial Configurator talks to: USB-Serial-JTAG on the ESP32-S3 readers, UART0 (GPIO1/3, a
// 3.3 V USB-TTL adapter on the serial pads) on the classic ESP32 BLE bridge. Log output reaches the same port
// through stdout (the ESP-IDF console).

#include <cstdint>

#include "sdkconfig.h"
#if CONFIG_ESP_CONSOLE_UART
#include "driver/uart.h"
#include "driver/uart_vfs.h"
#else
#include "driver/usb_serial_jtag.h"
#endif

namespace console_io
{
    inline void install()
    {
#if CONFIG_ESP_CONSOLE_UART
        // Driver-backed stdout, so log lines and RESP lines from different tasks never interleave mid-byte.
        uart_driver_install(static_cast<uart_port_t>(CONFIG_ESP_CONSOLE_UART_NUM), 512, 1024, 0, nullptr, 0);
        uart_vfs_dev_use_driver(CONFIG_ESP_CONSOLE_UART_NUM);
#else
        usb_serial_jtag_driver_config_t usbConfig = {
            .tx_buffer_size = 1024,
            .rx_buffer_size = 512,
        };
        usb_serial_jtag_driver_install(&usbConfig);
#endif
    }

    // Non-blocking: one received byte, if any.
    inline bool readByte(uint8_t &byte)
    {
#if CONFIG_ESP_CONSOLE_UART
        return uart_read_bytes(static_cast<uart_port_t>(CONFIG_ESP_CONSOLE_UART_NUM), &byte, 1, 0) == 1;
#else
        return usb_serial_jtag_read_bytes(&byte, 1, 0) == 1;
#endif
    }
}
