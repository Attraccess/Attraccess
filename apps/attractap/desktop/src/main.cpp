#include "host_runtime.hpp"
#include "profile_store.hpp"
#include "sdl_display.hpp"
#include "virtual_nfc.hpp"

#include <chrono>
#include <array>
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

std::string uidText(const VirtualNfc::Card &card)
{
    static constexpr char Hex[] = "0123456789ABCDEF";
    std::string value;
    for (uint8_t index = 0; index < card.uidLength; ++index)
    {
        if (index > 0)
            value += ':';
        value += Hex[card.uid[index] >> 4];
        value += Hex[card.uid[index] & 0x0F];
    }
    return value;
}

bool parseUid(const char *text, std::array<uint8_t, 7> &uid, uint8_t &length)
{
    std::string compact;
    for (const char *cursor = text; *cursor != '\0'; ++cursor)
    {
        if (*cursor != ':' && *cursor != ' ' && *cursor != '-')
            compact += *cursor;
    }
    if (compact.size() < 8 || compact.size() > 14 || compact.size() % 2 != 0)
        return false;
    for (size_t index = 0; index < compact.size(); index += 2)
    {
        const auto hexValue = [](char character) -> int
        {
            if (character >= '0' && character <= '9') return character - '0';
            if (character >= 'a' && character <= 'f') return character - 'a' + 10;
            if (character >= 'A' && character <= 'F') return character - 'A' + 10;
            return -1;
        };
        const int high = hexValue(compact[index]);
        const int low = hexValue(compact[index + 1]);
        if (high < 0 || low < 0)
            return false;
        uid[index / 2] = static_cast<uint8_t>((high << 4) | low);
    }
    length = static_cast<uint8_t>(compact.size() / 2);
    return true;
}

struct SimulatorControls
{
    VirtualNfc &nfc;
    lv_obj_t *uid = nullptr;
    lv_obj_t *type = nullptr;
    lv_obj_t *slot = nullptr;
    lv_obj_t *keyVersion = nullptr;
    lv_obj_t *authenticationFault = nullptr;
    lv_obj_t *writeFault = nullptr;
    lv_obj_t *status = nullptr;
    lv_obj_t *slotStatus = nullptr;

    static SimulatorControls *from(lv_event_t *event)
    {
        return static_cast<SimulatorControls *>(lv_event_get_user_data(event));
    }

    void refresh()
    {
        const auto &card = nfc.card();
        lv_textarea_set_text(uid, uidText(card).c_str());
        lv_dropdown_set_selected(type, static_cast<uint32_t>(card.type));
        lv_obj_set_state(authenticationFault, card.failAuthentication ? LV_STATE_CHECKED : LV_STATE_DEFAULT, true);
        lv_obj_set_state(writeFault, card.failWrite ? LV_STATE_CHECKED : LV_STATE_DEFAULT, true);
        const uint32_t selectedSlot = lv_dropdown_get_selected(slot);
        lv_dropdown_set_selected(keyVersion, card.keyVersions[selectedSlot]);
        lv_label_set_text_fmt(status, "Card is %s", card.present ? "present" : "removed");
        lv_label_set_text_fmt(slotStatus, "Slot %u: version %u (%s)", selectedSlot,
                              card.keyVersions[selectedSlot],
                              card.keys[selectedSlot] == VirtualNfc::factoryKey() ? "factory key" : "stored key");
    }

    static void saveCard(lv_event_t *event)
    {
        auto *controls = from(event);
        auto card = controls->nfc.card();
        if (!parseUid(lv_textarea_get_text(controls->uid), card.uid, card.uidLength))
        {
            lv_label_set_text(controls->status, "UID must be 4 to 7 bytes of hexadecimal");
            return;
        }
        card.type = static_cast<VirtualNfc::CardType>(lv_dropdown_get_selected(controls->type));
        controls->nfc.setCard(card);
        controls->refresh();
    }

    static void newCard(lv_event_t *event)
    {
        auto *controls = from(event);
        VirtualNfc::Card card;
        for (auto &key : card.keys)
            key = VirtualNfc::factoryKey();
        controls->nfc.setCard(card);
        controls->refresh();
    }

    static void togglePresence(lv_event_t *event)
    {
        auto *controls = from(event);
        controls->nfc.setPresent(!controls->nfc.card().present);
        controls->refresh();
    }

    static void setFaults(lv_event_t *event)
    {
        auto *controls = from(event);
        controls->nfc.setFaults(lv_obj_has_state(controls->authenticationFault, LV_STATE_CHECKED),
                                lv_obj_has_state(controls->writeFault, LV_STATE_CHECKED));
        controls->refresh();
    }

    static void resetSlot(lv_event_t *event)
    {
        auto *controls = from(event);
        controls->nfc.resetKeySlot(static_cast<uint8_t>(lv_dropdown_get_selected(controls->slot)));
        controls->refresh();
    }

    static void setKeyVersion(lv_event_t *event)
    {
        auto *controls = from(event);
        controls->nfc.setKeyVersion(static_cast<uint8_t>(lv_dropdown_get_selected(controls->slot)),
                                    static_cast<uint8_t>(lv_dropdown_get_selected(controls->keyVersion)));
        controls->refresh();
    }

    static void slotChanged(lv_event_t *event)
    {
        from(event)->refresh();
    }
};

lv_obj_t *button(lv_obj_t *parent, const char *text, int x, int y, int width, lv_event_cb_t callback, SimulatorControls *controls)
{
    auto *result = lv_button_create(parent);
    lv_obj_set_pos(result, x, y);
    lv_obj_set_size(result, width, 34);
    auto *label = lv_label_create(result);
    lv_label_set_text(label, text);
    lv_obj_center(label);
    lv_obj_add_event_cb(result, callback, LV_EVENT_CLICKED, controls);
    return result;
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
    VirtualNfc nfc(profile);
    HostRuntime runtime;
    SdlDisplay driver;
    driver.begin();

    lv_init();
    lv_tick_set_cb(+[] { static HostRuntime clock; return clock.millis(); });
    auto *display = lv_display_create(SdlDisplay::Width, SdlDisplay::Height);
    lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565);
    lv_display_set_user_data(display, &driver);
    lv_display_set_flush_cb(display, flush);
    static std::array<uint16_t, SdlDisplay::Width * 80> buffer;
    lv_display_set_buffers(display, buffer.data(), nullptr, buffer.size() * sizeof(buffer.front()), LV_DISPLAY_RENDER_MODE_PARTIAL);
    auto *input = lv_indev_create();
    lv_indev_set_type(input, LV_INDEV_TYPE_POINTER);
    lv_indev_set_user_data(input, &driver);
    lv_indev_set_read_cb(input, readTouch);

    auto *screen = lv_screen_active();
    auto *title = lv_label_create(screen);
    lv_label_set_text(title, "Attractap desktop simulator - Virtual NFC card");
    lv_obj_set_pos(title, 12, 10);

    SimulatorControls controls{nfc};
    auto *uidLabel = lv_label_create(screen);
    lv_label_set_text(uidLabel, "UID");
    lv_obj_set_pos(uidLabel, 12, 43);
    controls.uid = lv_textarea_create(screen);
    lv_textarea_set_one_line(controls.uid, true);
    lv_obj_set_pos(controls.uid, 52, 36);
    lv_obj_set_size(controls.uid, 250, 34);

    auto *typeLabel = lv_label_create(screen);
    lv_label_set_text(typeLabel, "Type");
    lv_obj_set_pos(typeLabel, 12, 87);
    controls.type = lv_dropdown_create(screen);
    lv_dropdown_set_options(controls.type, "Unknown\nNTAG424\nDESFire");
    lv_obj_set_pos(controls.type, 52, 80);
    lv_obj_set_size(controls.type, 140, 34);
    button(screen, "Save card", 314, 36, 150, SimulatorControls::saveCard, &controls);
    button(screen, "New factory card", 314, 80, 150, SimulatorControls::newCard, &controls);

    button(screen, "Present / remove", 12, 132, 180, SimulatorControls::togglePresence, &controls);
    controls.status = lv_label_create(screen);
    lv_obj_set_pos(controls.status, 206, 141);

    auto *slotLabel = lv_label_create(screen);
    lv_label_set_text(slotLabel, "Key slot");
    lv_obj_set_pos(slotLabel, 12, 190);
    controls.slot = lv_dropdown_create(screen);
    lv_dropdown_set_options(controls.slot, "0\n1\n2\n3\n4\n5");
    lv_obj_set_pos(controls.slot, 82, 182);
    lv_obj_set_size(controls.slot, 70, 34);
    lv_obj_add_event_cb(controls.slot, SimulatorControls::slotChanged, LV_EVENT_VALUE_CHANGED, &controls);
    button(screen, "Reset selected slot", 166, 182, 180, SimulatorControls::resetSlot, &controls);
    controls.slotStatus = lv_label_create(screen);
    lv_obj_set_pos(controls.slotStatus, 12, 230);

    auto *versionLabel = lv_label_create(screen);
    lv_label_set_text(versionLabel, "Version");
    lv_obj_set_pos(versionLabel, 12, 260);
    controls.keyVersion = lv_dropdown_create(screen);
    lv_dropdown_set_options(controls.keyVersion, "0 free\n1 enrolled\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15");
    lv_obj_set_pos(controls.keyVersion, 82, 252);
    lv_obj_set_size(controls.keyVersion, 140, 34);
    lv_obj_add_event_cb(controls.keyVersion, SimulatorControls::setKeyVersion, LV_EVENT_VALUE_CHANGED, &controls);

    controls.authenticationFault = lv_checkbox_create(screen);
    lv_checkbox_set_text(controls.authenticationFault, "Fail authentication");
    lv_obj_set_pos(controls.authenticationFault, 12, 310);
    lv_obj_add_event_cb(controls.authenticationFault, SimulatorControls::setFaults, LV_EVENT_VALUE_CHANGED, &controls);
    controls.writeFault = lv_checkbox_create(screen);
    lv_checkbox_set_text(controls.writeFault, "Fail key writes");
    lv_obj_set_pos(controls.writeFault, 12, 350);
    lv_obj_add_event_cb(controls.writeFault, SimulatorControls::setFaults, LV_EVENT_VALUE_CHANGED, &controls);

    auto *help = lv_label_create(screen);
    lv_label_set_text(help, "Keys are never entered here. Enrollment writes the server-issued key\nthrough the adapter; resetting a slot restores its factory key and version 0.");
    lv_obj_set_pos(help, 12, 400);
    controls.refresh();

    while (driver.pollEvents())
    {
        runtime.dispatch();
        lv_timer_handler();
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    return 0;
}
