#pragma once

#ifdef HAS_WS2812_LED

#include <cstdint>
#include "led_strip.h"

/**
 * Minimal Adafruit_NeoPixel-compatible facade over the ESP-IDF led_strip
 * component (RMT backend, GRB/800kHz — the old NEO_GRB + NEO_KHZ800 config).
 * Implements exactly the subset led.cpp uses. Pixels are stored unscaled and
 * the global brightness is applied at show() time, which is the behavior the
 * animation code was written against.
 */
class Ws2812Strip
{
public:
    Ws2812Strip(uint16_t count, int gpio) : _count(count), _gpio(gpio) {}

    void begin()
    {
        led_strip_config_t stripConfig = {};
        stripConfig.strip_gpio_num = _gpio;
        stripConfig.max_leds = _count;
        stripConfig.led_model = LED_MODEL_WS2812;
        stripConfig.color_component_format = LED_STRIP_COLOR_COMPONENT_FMT_GRB;

        led_strip_rmt_config_t rmtConfig = {};
        rmtConfig.resolution_hz = 10 * 1000 * 1000;

        if (led_strip_new_rmt_device(&stripConfig, &rmtConfig, &_strip) != ESP_OK)
        {
            _strip = nullptr;
        }
        _pixels = new uint32_t[_count]();
    }

    static uint32_t Color(uint8_t r, uint8_t g, uint8_t b)
    {
        return ((uint32_t)r << 16) | ((uint32_t)g << 8) | b;
    }

    uint16_t numPixels() const { return _count; }

    void setBrightness(uint8_t brightness) { _brightness = brightness; }

    void setPixelColor(uint16_t index, uint32_t color)
    {
        if (_pixels && index < _count)
        {
            _pixels[index] = color;
        }
    }

    void show()
    {
        if (!_strip || !_pixels)
        {
            return;
        }
        for (uint16_t i = 0; i < _count; i++)
        {
            uint32_t c = _pixels[i];
            uint8_t r = (uint8_t)((((c >> 16) & 0xFF) * _brightness) / 255);
            uint8_t g = (uint8_t)((((c >> 8) & 0xFF) * _brightness) / 255);
            uint8_t b = (uint8_t)(((c & 0xFF) * _brightness) / 255);
            led_strip_set_pixel(_strip, i, r, g, b);
        }
        led_strip_refresh(_strip);
    }

private:
    uint16_t _count;
    int _gpio;
    uint8_t _brightness = 255;
    led_strip_handle_t _strip = nullptr;
    uint32_t *_pixels = nullptr;
};

#endif
