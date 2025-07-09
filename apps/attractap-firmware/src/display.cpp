#include "display.hpp"

void Display::setup()
{
    this->boot_time = millis();

    Serial.println("[Display] Setup");

#ifdef SCREEN_DRIVER_SH1106
    uint8_t display_init_cmd = SH1106_SWITCHCAPVCC;
#elif SCREEN_DRIVER_SSD1306
    uint8_t display_init_cmd = SSD1306_SWITCHCAPVCC;
#endif

    display.begin(display_init_cmd, 0x3C);

    display.clearDisplay();

    uint8_t boot_logo_width = 80;
    uint8_t boot_logo_height = 48;
    uint8_t x = (display.width() - boot_logo_width) / 2;
    uint8_t y = (display.height() - boot_logo_height) / 2;
    display.drawBitmap(x, y, icon_boot_logo, boot_logo_width, boot_logo_height, WHITE);
    display.display();

    Serial.println("[Display] SSD1306 initialized");
}

void Display::loop()
{
    unsigned long boot_end_time = this->boot_time + 2000;

    if (millis() < boot_end_time)
    {
        return;
    }

    draw_main_elements();

    if (this->error_end_at > millis())
    {
        this->leds->setBlinking(CRGB::Red, 1000);
        this->draw_error_ui();
    }
    else if (this->success_end_at > millis())
    {
        this->leds->setBlinking(CRGB::Green, 1000);
        this->draw_success_ui();
    }
    else if (!this->is_network_connected)
    {
        this->leds->setBlinking(CRGB::Yellow, 500);
        this->draw_network_connecting_ui();
    }
    else if (!this->is_api_connected)
    {
        this->leds->setBlinking(CRGB::Blue, 500);
        this->draw_api_connecting_ui();
    }
    else if (this->is_nfc_tap_enabled)
    {
        this->leds->setBreathing(CRGB::White, 500);
        this->draw_nfc_tap_ui();
    }
    else if (this->is_displaying_text)
    {
        this->leds->setOn(CRGB::Blue);
        this->draw_text_ui();
    }

    display.display();
}

void Display::set_nfc_tap_enabled(bool enabled)
{
    this->is_nfc_tap_enabled = enabled;
}

void Display::set_nfc_tap_text(String text)
{
    this->nfc_tap_text = text;
}

void Display::set_network_connected(bool connected)
{
    this->is_network_connected = connected;
}

void Display::set_api_connected(bool connected)
{
    this->is_api_connected = connected;
}

void Display::set_ip_address(IPAddress ip)
{
    this->ip_address = ip;
}

void Display::set_device_name(String name)
{
    this->device_name = name;
}

void Display::draw_nfc_tap_ui()
{

    uint8_t icon_width = 64;
    uint8_t icon_height = 26;

    // calculate width and height of text
    int16_t x1, y1;
    uint16_t w, h;
    display.getTextBounds(this->nfc_tap_text, 0, 0, &x1, &y1, &w, &h);

    uint8_t center_x = SCREEN_WIDTH / 2;
    uint8_t center_y = SCREEN_HEIGHT / 2;

    // icon first
    display.drawBitmap(center_x - (icon_width / 2), center_y - (icon_height / 2) - h, icon_nfc_tap, icon_width, icon_height, WHITE);

    // text below the icon
    display.setCursor(center_x - (w / 2), center_y + (icon_height / 2) - h + 5);
    display.print(this->nfc_tap_text);
}

void Display::draw_main_elements()
{
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(WHITE);

    // network status, top left
    if (this->is_network_connected)
    {
        display.drawBitmap(1, 0, icon_wifi_on, 16, 16, WHITE);
    }
    else
    {
        display.drawBitmap(1, 0, icon_wifi_off, 16, 16, WHITE);
    }

    // api status, next to network status
    if (this->is_api_connected)
    {
        display.drawBitmap(17, 0, icon_api_connected, 16, 16, WHITE);
    }
    else
    {
        display.drawBitmap(17, 0, icon_api_disconnected, 16, 16, WHITE);
    }

    // device name, bottom left
    int16_t x1, y1;
    uint16_t w, h;
    display.getTextBounds(this->device_name, 0, 0, &x1, &y1, &w, &h);
    display.setCursor(1, SCREEN_HEIGHT - h - 1);
    display.print(this->device_name);
}

void Display::draw_network_connecting_ui()
{
    this->draw_two_line_message("Network", "Connecting...");
}

void Display::draw_api_connecting_ui()
{
    this->draw_two_line_message("wait for API...", this->ip_address.toString());
}

void Display::draw_error_ui()
{
    this->draw_two_line_message("Error", this->error);
}

void Display::draw_success_ui()
{
    this->draw_two_line_message("Success", this->success);
}

void Display::draw_two_line_message(String line1, String line2)
{
    display.setTextSize(1);
    display.setTextColor(WHITE);

    int16_t x1, y1;
    uint16_t w1, h1, w2, h2;

    // Calculate bounds for the first line
    display.getTextBounds(line1, 0, 0, &x1, &y1, &w1, &h1);

    // Calculate bounds for the second line
    display.getTextBounds(line2, 0, 0, &x1, &y1, &w2, &h2);

    // Print first line centered
    display.setCursor(SCREEN_WIDTH / 2 - w1 / 2, SCREEN_HEIGHT / 2 - h1 / 2);
    display.print(line1);

    // Print second line centered
    display.setCursor(SCREEN_WIDTH / 2 - w2 / 2, SCREEN_HEIGHT / 2 - h1 / 2 + h1);
    display.print(line2);
}

void Display::show_error(String error, unsigned long duration)
{
    this->error = error;

    this->error_end_at = millis() + duration;
}

void Display::show_success(String success, unsigned long duration)
{
    this->success = success;

    this->success_end_at = millis() + duration;
}

void Display::show_text(bool show)
{
    this->is_displaying_text = show;
}

void Display::set_text(String lineOne, String lineTwo)
{
    this->text_line_one = lineOne;
    this->text_line_two = lineTwo;
}

void Display::draw_text_ui()
{
    this->draw_two_line_message(this->text_line_one, this->text_line_two);
}