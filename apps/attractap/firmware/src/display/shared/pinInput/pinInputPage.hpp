#pragma once

#include <lvgl.h>
#include <functional>
#include <string>
#include "../../../logger/logger.hpp"

class PinInputPage
{
public:
    PinInputPage() : logger("PinInputPage") {}

    lv_obj_t *init(const char *title, lv_obj_t *parent = NULL);
    void setOnConfirmCallback(std::function<bool(std::string)> onConfirmCallback);
    void setOnCancelCallback(std::function<void()> onCancelCallback);

private:
    lv_obj_t *screen;
    Logger logger;

    std::function<bool(std::string)> onConfirmCallback;
    std::function<void()> onCancelCallback;

    lv_obj_t *devicePin;
    lv_obj_t *keyboardForDevicePin;
    lv_obj_t *labelForDevicePin;

    static void onKeyboardEvent(lv_event_t *e);
    static void onTextChanged(lv_event_t *e);
};