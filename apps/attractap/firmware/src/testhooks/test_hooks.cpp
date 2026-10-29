#include "test_hooks.hpp"

#include <cstdio>
#include <functional>

#include <lvgl.h>
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "frame_encoding.hpp"
#include "touch_injector.hpp"
#include "widget_finder.hpp"
#include "../display/display.hpp"
#include "../logger/logger.hpp"
#include "../platform.hpp"
#include "../serial/serialCommandHandler.hpp"

namespace TestHooks
{
    namespace
    {
        Logger logger("TestHooks");
        // Guarded by lv_lock: the LVGL task samples it in the touch read callback.
        TouchInjector injector;

        constexpr uint32_t DEFAULT_TAP_HOLD_MS = 60;
        constexpr uint32_t DEFAULT_SWIPE_MS = 300;
        constexpr uint32_t MAX_SWIPE_MS = 10000;
        // Grace on top of a gesture's own length before giving up on LVGL.
        constexpr uint32_t GESTURE_GRACE_MS = 3000;
        // 768 bytes -> 1024 base64 chars per line.
        constexpr size_t SCREENSHOT_CHUNK_BYTES = 768;

        void reply(const std::string &topic, JsonDocument &doc)
        {
            std::string json;
            serializeJson(doc, json);
            SerialCommandHandler::sendJsonResponse(topic, json);
        }

        void replySuccess(const std::string &topic)
        {
            JsonDocument doc;
            doc["success"] = true;
            reply(topic, doc);
        }

        void replyError(const std::string &topic, const char *error)
        {
            SerialCommandHandler::sendErrorResponse(topic, error);
        }

        lv_display_t *display()
        {
            return lv_display_get_default();
        }

        bool readCoordinate(JsonObject payload, const char *key, int32_t limit, int16_t &out)
        {
            if (!payload[key].is<int>())
            {
                return false;
            }
            int value = payload[key].as<int>();
            if (value < 0 || value >= limit)
            {
                return false;
            }
            out = static_cast<int16_t>(value);
            return true;
        }

        bool readPoint(JsonObject payload, const char *xKey, const char *yKey, int16_t &x, int16_t &y)
        {
            lv_lock();
            int32_t width = lv_display_get_horizontal_resolution(display());
            int32_t height = lv_display_get_vertical_resolution(display());
            lv_unlock();
            return readCoordinate(payload, xKey, width, x) && readCoordinate(payload, yKey, height, y);
        }

        // Missing -> fallback; present but not an integer in [min, max] -> false.
        bool readDuration(JsonObject payload, const char *key, uint32_t fallback, uint32_t min, uint32_t max, uint32_t &out)
        {
            if (payload[key].isNull())
            {
                out = fallback;
                return true;
            }
            if (!payload[key].is<int>())
            {
                return false;
            }
            int value = payload[key].as<int>();
            if (value < static_cast<int>(min) || value > static_cast<int>(max))
            {
                return false;
            }
            out = static_cast<uint32_t>(value);
            return true;
        }

        // Starts a gesture and blocks until LVGL has consumed it (or, for an
        // open-ended press, until the press is held), so the reply means the
        // UI has seen the touch. Returns an error code or nullptr.
        const char *runGesture(const std::function<bool(TouchInjector &)> &start, bool untilHeld)
        {
            lv_lock();
            bool started = start(injector);
            uint32_t budget = injector.plannedDurationMs() + GESTURE_GRACE_MS;
            lv_unlock();
            if (!started)
            {
                return "TOUCH_BUSY";
            }

            uint32_t begin = millis();
            while (true)
            {
                lv_lock();
                bool done = untilHeld ? (injector.holding() || !injector.busy()) : !injector.busy();
                if (!done && millis() - begin > budget)
                {
                    injector.cancel();
                    lv_unlock();
                    return "TOUCH_TIMEOUT";
                }
                lv_unlock();
                if (done)
                {
                    return nullptr;
                }
                vTaskDelay(pdMS_TO_TICKS(5));
            }
        }

        void finishGesture(const std::string &topic, const char *error)
        {
            if (error)
            {
                replyError(topic, error);
            }
            else
            {
                replySuccess(topic);
            }
        }

        void widgetJson(JsonObject out, const WidgetFinder::Widget &widget)
        {
            out["type"] = widget.type;
            if (widget.key >= 0)
            {
                out["key"] = widget.key;
            }
            out["text"] = widget.text();
            JsonArray texts = out["texts"].to<JsonArray>();
            for (const std::string &text : widget.texts)
            {
                texts.add(text);
            }
            out["x"] = widget.area.x1;
            out["y"] = widget.area.y1;
            out["w"] = lv_area_get_width(&widget.area);
            out["h"] = lv_area_get_height(&widget.area);
            out["cx"] = widget.center.x;
            out["cy"] = widget.center.y;
            out["hittable"] = widget.hittable;
            out["disabled"] = widget.disabled;
            out["checked"] = widget.checked;
        }

        void handleWidgetsGet(const std::string &topic)
        {
            lv_lock();
            std::vector<WidgetFinder::Widget> widgets = WidgetFinder::collect(display());
            std::string screen = Display::activeScreenName();
            int32_t width = lv_display_get_horizontal_resolution(display());
            int32_t height = lv_display_get_vertical_resolution(display());
            lv_unlock();

            JsonDocument doc;
            doc["screen"] = screen;
            doc["width"] = width;
            doc["height"] = height;
            JsonArray list = doc["widgets"].to<JsonArray>();
            for (const WidgetFinder::Widget &widget : widgets)
            {
                widgetJson(list.add<JsonObject>(), widget);
            }
            if (doc.overflowed())
            {
                replyError(topic, "OUT_OF_MEMORY");
                return;
            }
            reply(topic, doc);
        }

        void handleWidgetsTap(const std::string &topic, JsonObject payload)
        {
            const char *text = payload["text"].is<const char *>() ? payload["text"].as<const char *>() : nullptr;
            const char *matchName = payload["match"].is<const char *>() ? payload["match"].as<const char *>() : nullptr;
            WidgetFinder::Match match;
            uint32_t index = 0;
            uint32_t holdMs = 0;
            if (!text || !WidgetFinder::parseMatch(matchName, match) ||
                !readDuration(payload, "index", 0, 0, 1000, index) ||
                !readDuration(payload, "holdMs", DEFAULT_TAP_HOLD_MS, 1, TouchInjector::MAX_HOLD_MS, holdMs))
            {
                replyError(topic, "INVALID_PAYLOAD");
                return;
            }

            lv_lock();
            std::vector<WidgetFinder::Widget> widgets = WidgetFinder::collect(display());
            const WidgetFinder::Widget *target = WidgetFinder::find(widgets, text, match, index);
            WidgetFinder::Widget found{};
            if (target)
            {
                found = *target;
            }
            lv_unlock();
            if (!target)
            {
                replyError(topic, "WIDGET_NOT_FOUND");
                return;
            }

            int16_t x = static_cast<int16_t>(found.center.x);
            int16_t y = static_cast<int16_t>(found.center.y);
            const char *error = runGesture([&](TouchInjector &touch)
                                           { return touch.tap(x, y, holdMs); }, false);
            if (error)
            {
                replyError(topic, error);
                return;
            }
            JsonDocument doc;
            doc["success"] = true;
            widgetJson(doc["widget"].to<JsonObject>(), found);
            reply(topic, doc);
        }

        void handleScreenshot(const std::string &topic)
        {
            lv_lock();
            lv_display_t *disp = display();
            // Render pending changes (e.g. a screen loaded just before) first.
            lv_refr_now(disp);
            const uint8_t *frame = Display::frameBuffer();
            uint32_t width = static_cast<uint32_t>(lv_display_get_horizontal_resolution(disp));
            uint32_t height = static_cast<uint32_t>(lv_display_get_vertical_resolution(disp));
            size_t pixels = static_cast<size_t>(width) * height;
            uint8_t *encoded = nullptr;
            size_t size = 0;
            if (frame)
            {
                encoded = static_cast<uint8_t *>(heap_caps_malloc(FrameEncoding::maxRle565Size(pixels), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
                if (encoded)
                {
                    size = FrameEncoding::encodeRle565(reinterpret_cast<const uint16_t *>(frame), pixels, encoded);
                }
            }
            lv_unlock();

            if (!frame)
            {
                replyError(topic, "SCREENSHOT_UNAVAILABLE");
                return;
            }
            if (!encoded)
            {
                replyError(topic, "OUT_OF_MEMORY");
                return;
            }

            uint32_t crc = FrameEncoding::crc32(encoded, size);
            size_t chunks = (size + SCREENSHOT_CHUNK_BYTES - 1) / SCREENSHOT_CHUNK_BYTES;
            printf("RESP %s {\"width\":%lu,\"height\":%lu,\"format\":\"rgb565-rle\",\"size\":%lu,\"crc32\":%lu,\"chunks\":%lu}\n",
                   topic.c_str(), (unsigned long)width, (unsigned long)height, (unsigned long)size,
                   (unsigned long)crc, (unsigned long)chunks);

            static char line[FrameEncoding::base64Size(SCREENSHOT_CHUNK_BYTES) + 1];
            uint32_t lastYield = millis();
            for (size_t i = 0; i < chunks; i++)
            {
                size_t offset = i * SCREENSHOT_CHUNK_BYTES;
                size_t length = (size - offset < SCREENSHOT_CHUNK_BYTES) ? size - offset : SCREENSHOT_CHUNK_BYTES;
                FrameEncoding::base64Encode(encoded + offset, length, line);
                // One printf per line: stdout's lock keeps other tasks' log
                // lines from splitting it.
                printf("RESP ui.screenshot.data {\"seq\":%lu,\"data\":\"%s\"}\n", (unsigned long)i, line);
                // Writing blocks on USB; let the idle task feed the watchdog.
                if (millis() - lastYield > 100)
                {
                    vTaskDelay(1);
                    lastYield = millis();
                }
            }
            printf("RESP ui.screenshot.end {\"chunks\":%lu,\"crc32\":%lu}\n", (unsigned long)chunks, (unsigned long)crc);
            fflush(stdout);
            heap_caps_free(encoded);
            logger.infof("Screenshot sent: %lux%lu, %lu bytes in %lu chunks", (unsigned long)width,
                         (unsigned long)height, (unsigned long)size, (unsigned long)chunks);
        }
    }

    bool injectedTouch(TouchPoint &point)
    {
        TouchInjector::Sample sample;
        if (!injector.sample(millis(), sample))
        {
            return false;
        }
        point.x = sample.x;
        point.y = sample.y;
        point.pressed = sample.pressed;
        return true;
    }

    bool handleCommand(const std::string &topic, JsonObject payload)
    {
        if (topic == "ui.widgets.get")
        {
            handleWidgetsGet(topic);
            return true;
        }

        if (topic == "ui.widgets.tap")
        {
            handleWidgetsTap(topic, payload);
            return true;
        }

        if (topic == "ui.touch.tap" || topic == "ui.touch.press")
        {
            bool isTap = topic == "ui.touch.tap";
            int16_t x = 0;
            int16_t y = 0;
            uint32_t holdMs = 0;
            if (!readPoint(payload, "x", "y", x, y) ||
                !readDuration(payload, "holdMs", isTap ? DEFAULT_TAP_HOLD_MS : 0, isTap ? 1 : 0,
                              TouchInjector::MAX_HOLD_MS, holdMs))
            {
                replyError(topic, "INVALID_PAYLOAD");
                return true;
            }
            const char *error = runGesture([&](TouchInjector &touch)
                                           { return isTap ? touch.tap(x, y, holdMs) : touch.press(x, y, holdMs); },
                                           !isTap && holdMs == 0);
            finishGesture(topic, error);
            return true;
        }

        if (topic == "ui.touch.release")
        {
            lv_lock();
            bool released = injector.release();
            lv_unlock();
            if (!released)
            {
                replyError(topic, "NOT_PRESSED");
                return true;
            }
            finishGesture(topic, runGesture([](TouchInjector &)
                                            { return true; }, false));
            return true;
        }

        if (topic == "ui.touch.swipe")
        {
            int16_t x1 = 0, y1 = 0, x2 = 0, y2 = 0;
            uint32_t durationMs = 0;
            if (!readPoint(payload, "x1", "y1", x1, y1) || !readPoint(payload, "x2", "y2", x2, y2) ||
                !readDuration(payload, "durationMs", DEFAULT_SWIPE_MS, 1, MAX_SWIPE_MS, durationMs))
            {
                replyError(topic, "INVALID_PAYLOAD");
                return true;
            }
            finishGesture(topic, runGesture([&](TouchInjector &touch)
                                            { return touch.swipe(x1, y1, x2, y2, durationMs); }, false));
            return true;
        }

        if (topic == "ui.screenshot.get")
        {
            handleScreenshot(topic);
            return true;
        }

        return false;
    }
}
