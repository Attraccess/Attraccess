#include "display.hpp"

// Display task function
void Display::taskFn(void *parameter)
{
    Display *display = (Display *)parameter;

    const int REFRESH_RATE_HZ = 60;
    const int MS_PER_SECOND = 1000;
    const int LOOP_DELAY_MS = (MS_PER_SECOND / REFRESH_RATE_HZ) / portTICK_PERIOD_MS;

    for (;;)
    {
        display->loop();
        vTaskDelay(LOOP_DELAY_MS);
    }
}

void Display::setup()
{
    this->boot_time = millis();

    Serial.println("[Display] Setup");

#ifdef SCREEN_DRIVER_SH1106
    uint8_t display_init_cmd = SH1106_SWITCHCAPVCC;
#elif SCREEN_DRIVER_SSD1306
    uint8_t display_init_cmd = SSD1306_SWITCHCAPVCC;
#endif

    this->screen.begin(display_init_cmd, 0x3C);

    this->screen.clearDisplay();

    uint8_t boot_logo_width = 110;
    uint8_t boot_logo_height = 48;
    uint8_t x = (this->screen.width() - boot_logo_width) / 2;
    uint8_t y = (this->screen.height() - boot_logo_height) / 2;
    this->screen.drawBitmap(x, y, icon_boot_logo, boot_logo_width, boot_logo_height, WHITE);
    this->screen.display();

    xTaskCreate(Display::taskFn, "DisplayTask", 4096, this, 1, NULL);

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

    if (!this->is_network_connected)
    {
        this->leds->setBlinking(CRGB::Yellow, 500);
        this->draw_network_connecting_ui();
    }
    else if (!this->is_api_connected)
    {
        this->leds->setBlinking(CRGB::Blue, 500);
        this->draw_api_connecting_ui();
    }
    else if (this->display_state == DISPLAY_STATE_CARD_CHECKING)
    {
        this->leds->setBreathing(CRGB::White, 500);
        this->draw_nfc_tap_ui();
    }
    else if (this->display_state == DISPLAY_STATE_ERROR)
    {
        this->leds->setBlinking(CRGB::Red, 1000);
        this->draw_error_ui();
    }
    else if (this->display_state == DISPLAY_STATE_SUCCESS)
    {
        this->leds->setBlinking(CRGB::Green, 1000);
        this->draw_success_ui();
    }
    else if (this->display_state == DISPLAY_STATE_TEXT)
    {
        this->leds->setOn(CRGB::Blue);
        this->draw_text_ui();
    }
    else if (this->display_state == DISPLAY_STATE_SELECT_ITEM)
    {
        this->leds->setBreathing(CRGB::White, 500);
        this->draw_select_item_ui();
    }
    else if (this->display_state == DISPLAY_STATE_CONFIRM_ACTION)
    {
        this->leds->setBlinking(CRGB::White, 500);
        this->draw_confirm_action_ui();
    }

    this->screen.display();
}

void Display::set_nfc_tap_enabled(bool enabled, String text)
{
    this->nfc_tap_text = text;
    this->set_nfc_tap_enabled(enabled);
}

void Display::set_nfc_tap_enabled(bool enabled)
{
    if (enabled)
    {
        this->display_state = DISPLAY_STATE_CARD_CHECKING;
    }
    else if (this->display_state == DISPLAY_STATE_CARD_CHECKING)
    {
        this->display_state = DISPLAY_STATE_NONE;
    }
}

void Display::set_network_connected(bool connected)
{
    this->is_network_connected = connected;
}

void Display::set_api_connected(bool connected)
{
    this->is_api_connected = connected;
}

void Display::set_wifi_ip_address(const esp_ip4_addr_t &ip)
{
    this->wifi_ip_address = ip;
}

void Display::set_ethernet_ip_address(const esp_ip4_addr_t &ip)
{
    this->ethernet_ip_address = ip;
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
    this->screen.getTextBounds(this->nfc_tap_text, 0, 0, &x1, &y1, &w, &h);

    uint8_t center_x = SCREEN_WIDTH / 2;
    uint8_t center_y = SCREEN_HEIGHT / 2;

    // icon first
    this->screen.drawBitmap(center_x - (icon_width / 2), center_y - (icon_height / 2) - h, icon_nfc_tap, icon_width, icon_height, WHITE);

    // text below the icon
    this->screen.setCursor(center_x - (w / 2), center_y + (icon_height / 2) - h + 5);
    this->screen.print(this->nfc_tap_text);
}

void Display::draw_main_elements()
{
    this->screen.clearDisplay();
    this->screen.setTextSize(1);
    this->screen.setTextColor(WHITE);

    // network status, top left
    if (this->is_network_connected)
    {
        this->screen.drawBitmap(1, 0, icon_wifi_on, 16, 16, WHITE);
    }
    else
    {
        this->screen.drawBitmap(1, 0, icon_wifi_off, 16, 16, WHITE);
    }

    // api status, next to network status
    if (this->is_api_connected)
    {
        this->screen.drawBitmap(17, 0, icon_api_connected, 16, 16, WHITE);
    }
    else
    {
        this->screen.drawBitmap(17, 0, icon_api_disconnected, 16, 16, WHITE);
    }

    // device name, bottom left
    int16_t x1, y1;
    uint16_t w, h;
    this->screen.getTextBounds(this->device_name, 0, 0, &x1, &y1, &w, &h);
    this->screen.setCursor(1, SCREEN_HEIGHT - h - 1);
    this->screen.print(this->device_name);
}

void Display::draw_network_connecting_ui()
{
    this->draw_two_line_message("Network", "Connecting...");
}

void Display::draw_api_connecting_ui()
{
    // Convert WiFi IP to string
    char wifi_ip_str[16];
    snprintf(wifi_ip_str, sizeof(wifi_ip_str), IPSTR, IP2STR(&this->wifi_ip_address));

    // Convert Ethernet IP to string
    char eth_ip_str[16];
    snprintf(eth_ip_str, sizeof(eth_ip_str), IPSTR, IP2STR(&this->ethernet_ip_address));

    this->draw_two_line_message("WiFi: " + String(wifi_ip_str), "ETH: " + String(eth_ip_str));
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
    this->screen.setTextSize(1);
    this->screen.setTextColor(WHITE);

    int16_t x1, y1;
    uint16_t w1, h1, w2, h2;

    // Calculate bounds for the first line
    this->screen.getTextBounds(line1, 0, 0, &x1, &y1, &w1, &h1);

    // Calculate bounds for the second line
    this->screen.getTextBounds(line2, 0, 0, &x1, &y1, &w2, &h2);

    // Print first line centered
    this->screen.setCursor(SCREEN_WIDTH / 2 - w1 / 2, SCREEN_HEIGHT / 2 - h1 / 2);
    this->screen.print(line1);

    // Print second line centered
    this->screen.setCursor(SCREEN_WIDTH / 2 - w2 / 2, SCREEN_HEIGHT / 2 - h1 / 2 + h1);
    this->screen.print(line2);
}

void Display::draw_select_item_ui()
{
    this->draw_two_line_message("Select " + this->select_item_type, "> " + this->select_item_value + " <");
}

void Display::show_error(String error)
{
    this->error = error;
    this->display_state = DISPLAY_STATE_ERROR;
}

void Display::show_success(String success)
{
    this->success = success;
    this->display_state = DISPLAY_STATE_SUCCESS;
}

void Display::show_text(String lineOne, String lineTwo)
{
    this->display_state = DISPLAY_STATE_TEXT;
    this->text_line_one = lineOne;
    this->text_line_two = lineTwo;
}

void Display::show_select_item(String type, JsonArray options, String value)
{
    this->display_state = DISPLAY_STATE_SELECT_ITEM;
    this->select_item_type = type;
    this->select_item_value = value;
    this->select_item_options = options;
}

void Display::draw_text_ui()
{
    this->draw_two_line_message(this->text_line_one, this->text_line_two);
}

void Display::show_confirm_action(String title, String message)
{
    this->display_state = DISPLAY_STATE_CONFIRM_ACTION;
    this->confirm_action_title = title;
    this->confirm_action_message = message;
}

void Display::draw_confirm_action_ui()
{
    this->draw_two_line_message(this->confirm_action_title, this->confirm_action_message);
}