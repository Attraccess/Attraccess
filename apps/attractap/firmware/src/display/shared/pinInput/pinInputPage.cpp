#include "pinInputPage.hpp"
#include "display/theme.hpp"
#include <string>
#include <functional>

#include <cstring>

lv_obj_t *PinInputPage::init(const char *title, lv_obj_t *parent)
{
    this->screen = lv_obj_create(parent);
    lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
    DisplayTheme::applyScreen(this->screen);
    lv_obj_set_style_pad_left(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_right(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_top(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_bottom(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *containerForDevicePinInputAndLabel = lv_obj_create(this->screen);
    lv_obj_remove_style_all(containerForDevicePinInputAndLabel);
    lv_obj_set_width(containerForDevicePinInputAndLabel, lv_pct(100));
    lv_obj_set_height(containerForDevicePinInputAndLabel, lv_pct(25));
    lv_obj_set_align(containerForDevicePinInputAndLabel, LV_ALIGN_CENTER);
    lv_obj_set_flex_flow(containerForDevicePinInputAndLabel, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(containerForDevicePinInputAndLabel, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
    lv_obj_remove_flag(containerForDevicePinInputAndLabel, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(containerForDevicePinInputAndLabel, LV_OBJ_FLAG_SCROLLABLE);

    this->labelForDevicePin = lv_label_create(containerForDevicePinInputAndLabel);
    lv_obj_set_width(this->labelForDevicePin, lv_pct(100));
    lv_obj_set_height(this->labelForDevicePin, LV_SIZE_CONTENT);
    lv_obj_set_align(this->labelForDevicePin, LV_ALIGN_CENTER);
    lv_label_set_text(this->labelForDevicePin, title);
    lv_obj_set_style_text_align(this->labelForDevicePin, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->labelForDevicePin, &lv_font_montserrat_32, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_color(this->labelForDevicePin, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);

    this->devicePin = lv_textarea_create(containerForDevicePinInputAndLabel);
    DisplayTheme::field(this->devicePin);
    lv_obj_set_width(this->devicePin, lv_pct(100));
    lv_obj_set_height(this->devicePin, LV_SIZE_CONTENT);
    lv_obj_set_x(this->devicePin, -128);
    lv_obj_set_y(this->devicePin, -157);
    lv_obj_set_align(this->devicePin, LV_ALIGN_CENTER);
    lv_textarea_set_placeholder_text(this->devicePin, "0000");
    lv_textarea_set_one_line(this->devicePin, true);
    lv_textarea_set_accepted_chars(this->devicePin, "0123456789");
    lv_obj_set_style_text_font(this->devicePin, &lv_font_montserrat_28, LV_PART_MAIN | LV_STATE_DEFAULT);

    // TODO: add a confirmation input in which you need to type the same pin again and only if they match the pin is saved

    this->keyboardForDevicePin = lv_keyboard_create(this->screen);
    lv_keyboard_set_mode(this->keyboardForDevicePin, LV_KEYBOARD_MODE_NUMBER);
    lv_obj_set_width(this->keyboardForDevicePin, lv_pct(100));
    lv_obj_set_height(this->keyboardForDevicePin, lv_pct(70));
    lv_obj_set_x(this->keyboardForDevicePin, -48);
    lv_obj_set_y(this->keyboardForDevicePin, 45);
    lv_obj_set_align(this->keyboardForDevicePin, LV_ALIGN_CENTER);
    DisplayTheme::keyboard(this->keyboardForDevicePin);

    lv_keyboard_set_textarea(this->keyboardForDevicePin, this->devicePin);
    lv_obj_add_event_cb(this->keyboardForDevicePin, PinInputPage::onKeyboardEvent, LV_EVENT_ALL, this);
    lv_obj_add_event_cb(this->devicePin, PinInputPage::onTextChanged, LV_EVENT_VALUE_CHANGED, this);
    return this->screen;
}

void PinInputPage::setOnConfirmCallback(std::function<bool(std::string)> onConfirmCallback)
{
    this->onConfirmCallback = onConfirmCallback;
}

void PinInputPage::setOnCancelCallback(std::function<void()> onCancelCallback)
{
    this->onCancelCallback = onCancelCallback;
}

void PinInputPage::onKeyboardEvent(lv_event_t *e)
{
    PinInputPage *self = static_cast<PinInputPage *>(lv_event_get_user_data(e));
    if (self == nullptr)
    {
        return;
    }

    lv_event_code_t code = lv_event_get_code(e);
    if (code == LV_EVENT_READY)
    {
        self->logger.debug("Keyboard Confirm pressed");
        const char *text = lv_textarea_get_text(self->devicePin);
        if (text != nullptr && strlen(text) >= 4)
        {
            self->logger.debug("Text is not null and has at least 4 characters");

            bool success = false;
            if (self->onConfirmCallback)
            {
                self->logger.debug("Calling onPinConfirmed");
                success = self->onConfirmCallback(std::string(text));
                lv_textarea_set_text(self->devicePin, "");
            }

            lv_obj_set_style_text_color(self->labelForDevicePin, success ? DisplayTheme::text() : DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
        }

        // Keep the keyboard open; prevent default behavior
        lv_event_stop_processing(e);
    }
    else if (code == LV_EVENT_CANCEL)
    {
        // Prevent closing the keyboard
        lv_event_stop_processing(e);
        if (self->onCancelCallback)
        {
            self->onCancelCallback();
            lv_textarea_set_text(self->devicePin, "");
        }
    }
}

void PinInputPage::onTextChanged(lv_event_t *e)
{
    PinInputPage *self = static_cast<PinInputPage *>(lv_event_get_user_data(e));
    if (self == nullptr)
    {
        return;
    }

    if (self->labelForDevicePin == nullptr)
    {
        return;
    }

    const char *text = lv_textarea_get_text(self->devicePin);
    if (text != nullptr && strlen(text) >= 4)
    {
        lv_obj_set_style_text_color(self->labelForDevicePin, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    }
    else
    {
        lv_obj_set_style_text_color(self->labelForDevicePin, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
    }
}
