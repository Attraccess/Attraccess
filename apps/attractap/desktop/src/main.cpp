#include "host_runtime.hpp"
#include "profile_store.hpp"
#include "sdl_display.hpp"

#include <chrono>
#include <limits>
#include <stdexcept>
#include <thread>

namespace
{
void flush(lv_display_t *display, const lv_area_t *area, uint8_t *pxMap)
{
    static_cast<SdlDisplay *>(lv_display_get_user_data(display))->flush(area, pxMap);
    lv_display_flush_ready(display);
}

void readTouch(lv_indev_t *indev, lv_indev_data_t *data)
{
    TouchPoint point{};
    auto *display = static_cast<SdlDisplay *>(lv_indev_get_user_data(indev));
    data->state = display->readTouch(point) ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
    data->point.x = point.x;
    data->point.y = point.y;
}

uint32_t parseReaderId(const char *value)
{
    size_t parsed = 0;
    const auto readerId = std::stoull(value, &parsed);
    if (value[parsed] != '\0' || readerId > std::numeric_limits<uint32_t>::max())
        throw std::invalid_argument("Reader ID must be an unsigned 32-bit integer");
    return static_cast<uint32_t>(readerId);
}
}

int main(int argc, char **argv)
{
    const std::string endpoint = argc > 1 ? argv[1] : "https://localhost";
    const uint32_t readerId = argc > 2 ? parseReaderId(argv[2]) : 0;
    ProfileStore profile(endpoint, readerId);
    if (profile.get("api.host").empty())
        profile.put("api.host", endpoint);
    if (profile.get("api.readerId").empty())
        profile.put("api.readerId", std::to_string(readerId));
    HostRuntime runtime;
    SdlDisplay driver;
    driver.begin();

    lv_init();
    lv_tick_set_cb(+[] { static HostRuntime clock; return clock.millis(); });
    auto *display = lv_display_create(SdlDisplay::Width, SdlDisplay::Height);
    lv_display_set_user_data(display, &driver);
    lv_display_set_flush_cb(display, flush);
    static lv_color_t buffer[SdlDisplay::Width * 80];
    lv_display_set_buffers(display, buffer, nullptr, sizeof(buffer), LV_DISPLAY_RENDER_MODE_PARTIAL);
    auto *input = lv_indev_create();
    lv_indev_set_type(input, LV_INDEV_TYPE_POINTER);
    lv_indev_set_user_data(input, &driver);
    lv_indev_set_read_cb(input, readTouch);

    auto *label = lv_label_create(lv_screen_active());
    lv_label_set_text(label, "Attractap\nDesktop simulator");
    lv_obj_center(label);

    while (driver.pollEvents())
    {
        runtime.dispatch();
        lv_timer_handler();
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    return 0;
}
