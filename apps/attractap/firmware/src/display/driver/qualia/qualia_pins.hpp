#pragma once

// Adafruit Qualia ESP32-S3 RGB666 pin map, captured from arduino-esp32
// variants/adafruit_qualia_s3_rgb666/pins_arduino.h when the firmware moved
// off the Arduino core (the Arduino variant header was the only place these
// constants lived).

// XCA9554 IO expander (I2C 0x3F) pin numbers — panel init SPI is bit-banged
// through the expander, backlight/reset live there too.
#define QUALIA_PCA_TFT_SCK 0
#define QUALIA_PCA_TFT_CS 1
#define QUALIA_PCA_TFT_RESET 2
#define QUALIA_PCA_CPT_IRQ 3
#define QUALIA_PCA_TFT_BACKLIGHT 4
#define QUALIA_PCA_TFT_MOSI 7

#define QUALIA_IOEXPANDER_I2C_ADDR 0x3F

// RGB dot-clock panel GPIOs (TL040WVS03 480x480, RGB666 wiring, 16-bit bus)
#define QUALIA_TFT_DE 2
#define QUALIA_TFT_VSYNC 42
#define QUALIA_TFT_HSYNC 41
#define QUALIA_TFT_PCLK 1

#define QUALIA_TFT_R1 11
#define QUALIA_TFT_R2 10
#define QUALIA_TFT_R3 9
#define QUALIA_TFT_R4 46
#define QUALIA_TFT_R5 3

#define QUALIA_TFT_G0 48
#define QUALIA_TFT_G1 47
#define QUALIA_TFT_G2 21
#define QUALIA_TFT_G3 14
#define QUALIA_TFT_G4 13
#define QUALIA_TFT_G5 12

#define QUALIA_TFT_B1 40
#define QUALIA_TFT_B2 39
#define QUALIA_TFT_B3 38
#define QUALIA_TFT_B4 0
#define QUALIA_TFT_B5 45
