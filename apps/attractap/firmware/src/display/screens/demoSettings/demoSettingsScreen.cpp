#ifdef DEMO_MODE

#include "demoSettingsScreen.hpp"
#include "display/theme.hpp"
#include <string>
#include <cstdio>
#include "platform.hpp"

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

void DemoSettingsScreen::init()
{
    if (_screen)
        return;

    _screen = lv_obj_create(NULL);
    lv_obj_remove_flag(_screen, LV_OBJ_FLAG_SCROLLABLE);
    DisplayTheme::applyScreen(_screen);
    lv_obj_set_style_pad_all(_screen, 16, LV_PART_MAIN);
    // Flex column: title bar fixed height, list area grows to fill the rest.
    // (Overlays added later are flagged IGNORE_LAYOUT so they float centered.)
    lv_obj_set_flex_flow(_screen, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(_screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
    lv_obj_set_style_pad_row(_screen, 12, LV_PART_MAIN);

    // Title bar
    lv_obj_t *titleBar = lv_obj_create(_screen);
    lv_obj_remove_flag(titleBar, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(titleBar, lv_pct(100), 56);
    DisplayTheme::applySurface(titleBar);
    lv_obj_set_style_bg_color(titleBar, DisplayTheme::primarySoft(), LV_PART_MAIN);
    lv_obj_set_style_border_width(titleBar, 0, LV_PART_MAIN);
    lv_obj_set_flex_flow(titleBar, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(titleBar, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_hor(titleBar, 16, LV_PART_MAIN);

    lv_obj_t *title = lv_label_create(titleBar);
    lv_label_set_text(title, "Demo Einstellungen");
    lv_obj_set_style_text_color(title, DisplayTheme::onPrimarySoft(), LV_PART_MAIN);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_24, LV_PART_MAIN);

    // Right-aligned action button group (add card, + power off on V4 demo).
    lv_obj_t *actions = lv_obj_create(titleBar);
    lv_obj_remove_flag(actions, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(actions, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_opa(actions, 0, LV_PART_MAIN);
    lv_obj_set_style_border_width(actions, 0, LV_PART_MAIN);
    lv_obj_set_style_pad_all(actions, 0, LV_PART_MAIN);
    lv_obj_set_flex_flow(actions, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(actions, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(actions, 10, LV_PART_MAIN);

    // "Add card" button
    lv_obj_t *addBtn = lv_button_create(actions);
    lv_obj_set_size(addBtn, 160, 40);
    DisplayTheme::button(addBtn);
    lv_obj_add_event_cb(addBtn, &DemoSettingsScreen::onAddCardBtn, LV_EVENT_CLICKED, this);
    lv_obj_t *addLbl = lv_label_create(addBtn);
    lv_label_set_text(addLbl, "Karte hinzufuegen");
    lv_obj_set_align(addLbl, LV_ALIGN_CENTER);
    lv_obj_set_style_text_color(addLbl, DisplayTheme::onPrimary(), LV_PART_MAIN);
    lv_obj_set_style_text_font(addLbl, &lv_font_montserrat_16, LV_PART_MAIN);

#ifdef HAS_POWER_BUTTON
    // Power-off button (V4 hardware with SYS_EN latch only).
    PowerOffButton::create(actions, [this]() { if (_powerOffCb) _powerOffCb(); });
#endif

    // Scrollable card list area — grows to fill all space below the title bar.
    lv_obj_t *listArea = lv_obj_create(_screen);
    lv_obj_set_width(listArea, lv_pct(100));
    lv_obj_set_flex_grow(listArea, 1);
    DisplayTheme::applySurface(listArea);
    lv_obj_set_style_bg_color(listArea, DisplayTheme::surfaceSecondary(), LV_PART_MAIN);
    lv_obj_set_style_border_width(listArea, 0, LV_PART_MAIN);
    lv_obj_set_style_pad_all(listArea, 10, LV_PART_MAIN);
    lv_obj_set_style_pad_row(listArea, 8, LV_PART_MAIN);
    lv_obj_set_flex_flow(listArea, LV_FLEX_FLOW_COLUMN);
    // Vertical scroll only. Without this the list defaults to LV_DIR_ALL and,
    // once it overflows (3rd card), drifts horizontally with no way back short
    // of a reboot — the whole screen appears shifted sideways.
    lv_obj_set_scroll_dir(listArea, LV_DIR_VER);
    lv_obj_set_scrollbar_mode(listArea, LV_SCROLLBAR_MODE_AUTO);

    _cardList = listArea;
    rebuildCardList();
}

void DemoSettingsScreen::onScreenLeave()
{
    hideScanOverlay();
#ifdef HAS_POWER_BUTTON
    PowerOffButton::hideConfirm();
#endif
}

void DemoSettingsScreen::loop()
{
    // Nothing to poll
}

lv_obj_t *DemoSettingsScreen::getScreen()
{
    return _screen;
}

std::string DemoSettingsScreen::getName()
{
    return "DemoSettingsScreen";
}

void DemoSettingsScreen::destroy()
{
    if (!_screen)
        return;
    lv_obj_del(_screen);
    _screen = nullptr;
    _cardList = nullptr;
    _scanOverlay = nullptr;
    _rolePicker = nullptr;
}

// ---------------------------------------------------------------------------
// Card list
// ---------------------------------------------------------------------------

void DemoSettingsScreen::rebuildCardList()
{
    if (!_cardList)
        return;

    lv_obj_clean(_cardList);
    lv_obj_scroll_to_y(_cardList, 0, LV_ANIM_OFF); // self-heal any leftover scroll offset

    uint8_t count = DemoStore::getCardCount();
    if (count == 0)
    {
        lv_obj_t *emptyLbl = lv_label_create(_cardList);
        lv_label_set_text(emptyLbl, "Noch keine Karten registriert.");
        lv_obj_set_style_text_color(emptyLbl, DisplayTheme::muted(), LV_PART_MAIN);
        lv_obj_set_style_text_font(emptyLbl, &lv_font_montserrat_20, LV_PART_MAIN);
        return;
    }

    for (uint8_t i = 0; i < count; i++)
    {
        const DemoStore::DemoCard &card = DemoStore::getCard(i);

        // Row container
        lv_obj_t *row = lv_obj_create(_cardList);
        lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_size(row, lv_pct(100), 60);
        DisplayTheme::applySurface(row);
        lv_obj_set_style_border_width(row, 0, LV_PART_MAIN);
        lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
        lv_obj_set_flex_align(row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
        lv_obj_set_style_pad_hor(row, 12, LV_PART_MAIN);

        // UID label
        char uidShort[15]; // max 14 hex chars for 7-byte UID + null (GCC 14 -Wformat-truncation)
        const char *uid = card.uid;
        size_t uidLen = strlen(uid);
        // Show last 8 hex chars (4 bytes) as short display
        if (uidLen > 8)
            snprintf(uidShort, sizeof(uidShort), "...%s", uid + uidLen - 8);
        else
            snprintf(uidShort, sizeof(uidShort), "%s", uid);

        // Name / label column
        // Name column grows to fill the space left of the delete button so the
        // labels always have a defined width (no overflow pushing the button off).
        lv_obj_t *nameCol = lv_obj_create(row);
        lv_obj_remove_flag(nameCol, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_height(nameCol, lv_pct(100));
        lv_obj_set_flex_grow(nameCol, 1);
        lv_obj_set_style_bg_opa(nameCol, 0, LV_PART_MAIN);
        lv_obj_set_style_border_width(nameCol, 0, LV_PART_MAIN);
        lv_obj_set_style_pad_all(nameCol, 0, LV_PART_MAIN);
        lv_obj_set_flex_flow(nameCol, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_flex_align(nameCol, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

        lv_obj_t *nameLbl = lv_label_create(nameCol);
        lv_obj_set_width(nameLbl, lv_pct(100));
        const char *displayName = (card.label[0] != '\0') ? card.label : uidShort;
        lv_label_set_text(nameLbl, displayName);
        lv_label_set_long_mode(nameLbl, LV_LABEL_LONG_DOT);
        lv_obj_set_style_text_color(nameLbl, DisplayTheme::text(), LV_PART_MAIN);
        lv_obj_set_style_text_font(nameLbl, &lv_font_montserrat_20, LV_PART_MAIN);

        lv_obj_t *roleLbl = lv_label_create(nameCol);
        lv_obj_set_width(roleLbl, lv_pct(100));
        lv_label_set_text(roleLbl, DemoStore::roleName(card.role));
        lv_color_t roleColor = DisplayTheme::muted();
        switch (card.role) {
        case DemoStore::UserRole::INTRODUCED: roleColor = DisplayTheme::success(); break;
        case DemoStore::UserRole::ADMIN:      roleColor = DisplayTheme::warning(); break;
        default:                            roleColor = DisplayTheme::danger(); break;
        }
        lv_obj_set_style_text_color(roleLbl, roleColor, LV_PART_MAIN);
        lv_obj_set_style_text_font(roleLbl, &lv_font_montserrat_16, LV_PART_MAIN);

        // Delete button
        lv_obj_t *delBtn = lv_button_create(row);
        lv_obj_set_size(delBtn, 72, 40);
        DisplayTheme::button(delBtn, DisplayTheme::danger());
        _delPayloads[i] = {this, i};
        lv_obj_add_event_cb(delBtn, &DemoSettingsScreen::onDeleteCardBtn, LV_EVENT_CLICKED, &_delPayloads[i]);
        lv_obj_t *delBtnInner = lv_label_create(delBtn);
        lv_label_set_text(delBtnInner, "Loeschen");
        lv_obj_set_align(delBtnInner, LV_ALIGN_CENTER);
        lv_obj_set_style_text_color(delBtnInner, DisplayTheme::onPrimary(), LV_PART_MAIN);
        lv_obj_set_style_text_font(delBtnInner, &lv_font_montserrat_14, LV_PART_MAIN);
    }
}

// ---------------------------------------------------------------------------
// Scan overlay (waiting for card tap)
// ---------------------------------------------------------------------------

void DemoSettingsScreen::showScanOverlay()
{
    if (_scanOverlay)
        return;

    _scanOverlay = lv_obj_create(_screen);
    lv_obj_add_flag(_scanOverlay, LV_OBJ_FLAG_IGNORE_LAYOUT);
    lv_obj_set_size(_scanOverlay, lv_pct(100), lv_pct(100));
    lv_obj_align(_scanOverlay, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_bg_color(_scanOverlay, lv_color_black(), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(_scanOverlay, 200, LV_PART_MAIN);
    lv_obj_set_style_border_width(_scanOverlay, 0, LV_PART_MAIN);
    lv_obj_set_style_radius(_scanOverlay, 0, LV_PART_MAIN);
    lv_obj_set_flex_flow(_scanOverlay, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(_scanOverlay, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(_scanOverlay, 24, LV_PART_MAIN);

    lv_obj_t *lbl = lv_label_create(_scanOverlay);
    lv_label_set_text(lbl, "Karte ans Lesegeraet halten...");
    lv_obj_set_style_text_color(lbl, DisplayTheme::onPrimary(), LV_PART_MAIN);
    lv_obj_set_style_text_font(lbl, &lv_font_montserrat_24, LV_PART_MAIN);
    lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);

    lv_obj_t *cancelBtn = lv_button_create(_scanOverlay);
    lv_obj_set_size(cancelBtn, 200, 52);
    DisplayTheme::button(cancelBtn);
    lv_obj_add_event_cb(cancelBtn, &DemoSettingsScreen::onCancelScanBtn, LV_EVENT_CLICKED, this);
    lv_obj_t *cancelLbl = lv_label_create(cancelBtn);
    lv_label_set_text(cancelLbl, "Abbrechen");
    lv_obj_set_align(cancelLbl, LV_ALIGN_CENTER);
    lv_obj_set_style_text_color(cancelLbl, DisplayTheme::onPrimary(), LV_PART_MAIN);
    lv_obj_set_style_text_font(cancelLbl, &lv_font_montserrat_20, LV_PART_MAIN);

    _waitingForCard = true;
}

void DemoSettingsScreen::hideScanOverlay()
{
    if (_scanOverlay)
    {
        lv_obj_del(_scanOverlay);
        _scanOverlay = nullptr;
    }
    _waitingForCard = false;
}

// ---------------------------------------------------------------------------
// Role picker (after card scanned)
// ---------------------------------------------------------------------------

void DemoSettingsScreen::showRolePicker(const std::string &uid)
{
    _pendingUid = uid;
    hideScanOverlay();

    if (_rolePicker)
    {
        lv_obj_del(_rolePicker);
        _rolePicker = nullptr;
    }

    _rolePicker = lv_obj_create(_screen);
    lv_obj_add_flag(_rolePicker, LV_OBJ_FLAG_IGNORE_LAYOUT);
    lv_obj_set_size(_rolePicker, lv_pct(90), LV_SIZE_CONTENT);
    lv_obj_align(_rolePicker, LV_ALIGN_CENTER, 0, 0);
    DisplayTheme::applySurface(_rolePicker);
    lv_obj_set_style_border_width(_rolePicker, 0, LV_PART_MAIN);
    lv_obj_set_flex_flow(_rolePicker, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(_rolePicker, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_all(_rolePicker, 20, LV_PART_MAIN);
    lv_obj_set_style_pad_row(_rolePicker, 14, LV_PART_MAIN);

    char titleBuf[64];
    snprintf(titleBuf, sizeof(titleBuf), "Rolle fuer Karte %s", uid.c_str());
    lv_obj_t *titleLbl = lv_label_create(_rolePicker);
    lv_label_set_text(titleLbl, titleBuf);
    lv_obj_set_style_text_color(titleLbl, DisplayTheme::text(), LV_PART_MAIN);
    lv_obj_set_style_text_font(titleLbl, &lv_font_montserrat_20, LV_PART_MAIN);
    lv_label_set_long_mode(titleLbl, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(titleLbl, lv_pct(100));

    struct RoleEntry { const char *label; DemoStore::UserRole role; lv_color_t color; };
    static const RoleEntry roles[] = {
        { "Kein Zugang",  DemoStore::UserRole::NO_PERMISSION, DisplayTheme::danger()  },
        { "Eingewiesen",  DemoStore::UserRole::INTRODUCED,    DisplayTheme::success() },
        { "Admin",        DemoStore::UserRole::ADMIN,        DisplayTheme::warning() },
    };

    for (uint8_t j = 0; j < 3; j++)
    {
        const auto &entry = roles[j];
        lv_obj_t *btn = lv_button_create(_rolePicker);
        lv_obj_set_width(btn, lv_pct(100));
        lv_obj_set_height(btn, 52);
        DisplayTheme::button(btn, entry.color);

        _rolePayloads[j] = {this, entry.role};
        lv_obj_add_event_cb(btn, &DemoSettingsScreen::onRolePickerBtn, LV_EVENT_CLICKED, &_rolePayloads[j]);

        lv_obj_t *lbl = lv_label_create(btn);
        lv_label_set_text(lbl, entry.label);
        lv_obj_set_align(lbl, LV_ALIGN_CENTER);
        lv_obj_set_style_text_color(lbl, DisplayTheme::onPrimary(), LV_PART_MAIN);
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_24, LV_PART_MAIN);
    }
}

// ---------------------------------------------------------------------------
// Event handlers (static)
// ---------------------------------------------------------------------------

void DemoSettingsScreen::onAddCardBtn(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED)
        return;
    DemoSettingsScreen *self = static_cast<DemoSettingsScreen *>(lv_event_get_user_data(e));
    if (!self)
        return;
    self->showScanOverlay();
    if (self->_startScanCb)
        self->_startScanCb();
}

void DemoSettingsScreen::onDeleteCardBtn(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED)
        return;
    DelPayload *pl = static_cast<DelPayload *>(lv_event_get_user_data(e));
    if (!pl)
        return;
    DemoStore::deleteCard(pl->idx);
    pl->screen->rebuildCardList();
}

void DemoSettingsScreen::onCancelScanBtn(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED)
        return;
    DemoSettingsScreen *self = static_cast<DemoSettingsScreen *>(lv_event_get_user_data(e));
    if (!self)
        return;
    self->hideScanOverlay();
    if (self->_cancelScanCb)
        self->_cancelScanCb();
}

void DemoSettingsScreen::onRolePickerBtn(lv_event_t *e)
{
    if (lv_event_get_code(e) != LV_EVENT_CLICKED)
        return;
    RolePickerPayload *pl = static_cast<RolePickerPayload *>(lv_event_get_user_data(e));
    if (!pl)
        return;
    DemoSettingsScreen *self = pl->screen;
    DemoStore::addCard(self->_pendingUid.c_str(), pl->role);
    if (self->_rolePicker)
    {
        lv_obj_del(self->_rolePicker);
        self->_rolePicker = nullptr;
    }
    self->_pendingUid.clear();
    self->rebuildCardList();
}

// ---------------------------------------------------------------------------
// Public: card scanned callback (called by Application on the main loop)
// ---------------------------------------------------------------------------

void DemoSettingsScreen::onCardScanned(const std::string &uid)
{
    _waitingForCard = false;
    if (_cancelScanCb)
        _cancelScanCb(); // let application disable NFC detection
    showRolePicker(uid);
}


#endif // DEMO_MODE
