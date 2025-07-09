#pragma once

// SPI Pins
#define PIN_SPI_SCK 4
#define PIN_SPI_MISO 5
#define PIN_SPI_MOSI 6

// Chip Select Pins
#define PIN_SPI_CS_ETH 3

// I2C Pins
#define PIN_I2C_SDA 8
#define PIN_I2C_SCL 9

// PN532 Pins
#define PIN_PN532_IRQ -1
#define PIN_PN532_RESET -1

// Display configuration
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define SCREEN_RESET -1

// I2C KeyPad configuration
#define I2C_KEYPAD_ADDRESS 0x20

// LEDs
#define PIN_LED 0
#define LED_COUNT 5
#define LED_MAX_BRIGHTNESS 150