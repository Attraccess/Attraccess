#ifdef DEMO_MODE

#include "demoSettingsScreen.hpp"
#include <string>
#include <cstdio>
#include "platform.hpp"

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------
#define DEMO_BG      0x1A1A2E
#define DEMO_PANEL   0x16213E
#define DEMO_ACCENT  0x0F3460
#define DEMO_CARD_BG 0x1F2B47
#define DEMO_TEXT    0xE0E0E0
#define DEMO_TITLE   0x9EB8D9
#define DEMO_GREEN   0x4CD964
#define DEMO_YELLOW  0xFFC107
#define DEMO_RED     0xFF5252
#define DEMO_BTN_ADD 0x2E7D32
#define DEMO_BTN_DEL 0xC62828
#define DEMO_BTN_SCAN 0x1565C0

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

void DemoSettingsScreen::init()
{
    if (_screen)
        return;

    _screen = lv_obj_create(NULL);
    lv_obj_remove_flag(_screen, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(_screen, lv_color_hex(DEMO_BG), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(_screen, 255, LV_PART_MAIN);
    lv_obj_set_style_pad_all(_screen, 16, LV_PART_MAIN);

    // Title bar
    lv_obj_t *titleBar = lv_obj_create(_screen);
    lv_obj_remove_flag(titleBar, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(titleBar, lv_pct(100), 56);
    lv_obj_align(titleBar, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_color(titleBar, lv_color_hex(DEMO_ACCENT), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(titleBar, 255, LV_PART_MAIN);
    lv_obj_set_style_border_width(titleBar, 0, LV_PART_MAIN);
    lv_obj_set_style_radius(titleBar, 12, LV_PART_MAIN);
    lv_obj_set_flex_flow(titleBar, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(titleBar, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_hor(titleBar, 16, LV_PART_MAIN);

    lv_obj_t *title = lv_label_create(titleBar);
    lv_label_set_text(title, "Demo Einstellungen");
    lv_obj_set_style_text_color(title, lv_color_hex(DEMO_TEXT), LV_PART_MAIN);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_24, LV_PART_MAIN);

    // "Add card" button in title bar
    lv_obj_t *addBtn = lv_button_create(titleBar);
    lv_obj_set_size(addBtn, 160, 40);
    lv_obj_set_style_bg_color(addBtn, lv_color_hex(DEMO_BTN_ADD), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(addBtn, 255, LV_PART_MAIN);
    lv_obj_set_style_radius(addBtn, 8, LV_PART_MAIN);
    lv_obj_add_event_cb(addBtn, &DemoSettingsScreen::onAddCardBtn, LV_EVENT_CLICKED, this);
    lv_obj_t *addLbl = lv_label_create(addBtn);
    lv_label_set_text(addLbl, "Karte hinzufuegen");
    lv_obj_set_align(addLbl, LV_ALIGN_CENTER);
    lv_obj_set_style_text_color(addLbl, lv_color_hex(DEMO_TEXT), LV_PART_MAIN);
    lv_obj_set_style_text_font(addLbl, &lv_font_montserrat_16, LV_PART_MAIN);

    // Scrollable card list area
    lv_obj_t *listArea = lv_obj_create(_screen);
    lv_obj_set_size(listArea, lv_pct(100), lv_pct(100) - 80);
    lv_obj_align(listArea, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_set_style_bg_color(listArea, lv_color_hex(DEMO_PANEL), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(listArea, 255, LV_PART_MAIN);
    lv_obj_set_style_border_width(listArea, 0, LV_PART_MAIN);
    lv_obj_set_style_radius(listArea, 12, LV_PART_MAIN);
    lv_obj_set_style_pad_all(listArea, 10, LV_PART_MAIN);
    lv_obj_set_style_pad_row(listArea, 8, LV_PART_MAIN);
    lv_obj_set_flex_flow(listArea, LV_FLEX_FLOW_COLUMN);

    _cardList = listArea;
    rebuildCardList();
}

void DemoSettingsScreen::onScreenLeave()
{
    hideScanOverlay();
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

    uint8_t count = DemoStore::getCardCount();
    if (count == 0)
    {
        lv_obj_t *emptyLbl = lv_label_create(_cardList);
        lv_label_set_text(emptyLbl, "Noch keine Karten registriert.");
        lv_obj_set_style_text_color(emptyLbl, lv_color_hex(DEMO_TITLE), LV_PART_MAIN);
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
        lv_obj_set_style_bg_color(row, lv_color_hex(DEMO_CARD_BG), LV_PART_MAIN);
        lv_obj_set_style_bg_opa(row, 255, LV_PART_MAIN);
        lv_obj_set_style_border_width(row, 0, LV_PART_MAIN);
        lv_obj_set_style_radius(row, 8, LV_PART_MAIN);
        lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
        lv_obj_set_flex_align(row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
        lv_obj_set_style_pad_hor(row, 12, LV_PART_MAIN);

        // UID label
        char uidShort[10];
        const char *uid = card.uid;
        size_t uidLen = strlen(uid);
        // Show last 8 hex chars (4 bytes) as short display
        if (uidLen > 8)
            snprintf(uidShort, sizeof(uidShort), "...%s", uid + uidLen - 8);
        else
            snprintf(uidShort, sizeof(uidShort), "%s", uid);

        // Name / label column
        lv_obj_t *nameCol = lv_obj_create(row);
        lv_obj_remove_flag(nameCol, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_size(nameCol, LV_SIZE_CONTENT, lv_pct(100));
        lv_obj_set_style_bg_opa(nameCol, 0, LV_PART_MAIN);
        lv_obj_set_style_border_width(nameCol, 0, LV_PART_MAIN);
        lv_obj_set_style_pad_all(nameCol, 0, LV_PART_MAIN);
        lv_obj_set_flex_flow(nameCol, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_flex_align(nameCol, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

        lv_obj_t *nameLbl = lv_label_create(nameCol);
        const char *displayName = (card.label[0] != '\0') ? card.label : uidShort;
        lv_label_set_text(nameLbl, displayName);
        lv_obj_set_style_text_color(nameLbl, lv_color_hex(DEMO_TEXT), LV_PART_MAIN);
        lv_obj_set_style_text_font(nameLbl, &lv_font_montserrat_20, LV_PART_MAIN);

        lv_obj_t *roleLbl = lv_label_create(nameCol);
        lv_label_set_text(roleLbl, DemoStore::roleName(card.role));
        uint32_t roleColor = DEMO_TITLE;
        switch (card.role) {
        case DemoStore::UserRole::INTRODUCED: roleColor = DEMO_GREEN; break;
        case DemoStore::UserRole::ADMIN:      roleColor = DEMO_YELLOW; break;
        default:                              roleColor = DEMO_RED; break;
        }
        lv_obj_set_style_text_color(roleLbl, lv_color_hex(roleColor), LV_PART_MAIN);
        lv_obj_set_style_text_font(roleLbl, &lv_font_montserrat_16, LV_PART_MAIN);

        // Delete button
        lv_obj_t *delBtn = lv_button_create(row);
        lv_obj_set_size(delBtn, 72, 40);
        lv_obj_set_style_bg_color(delBtn, lv_color_hex(DEMO_BTN_DEL), LV_PART_MAIN);
        lv_obj_set_style_bg_opa(delBtn, 255, LV_PART_MAIN);
        lv_obj_set_style_radius(delBtn, 8, LV_PART_MAIN);
        // Allocate payload on heap; freed in the event handler
        struct DelPayload { DemoSettingsScreen *screen; uint8_t idx; };
        DelPayload *dp = new DelPayload{this, i};
        lv_obj_add_event_cb(delBtn, &DemoSettingsScreen::onDeleteCardBtn, LV_EVENT_CLICKED, dp);
        lv_obj_t *delBtnInner = lv_label_create(delBtn);
        lv_label_set_text(delBtnInner, "Loeschen");
        lv_obj_set_align(delBtnInner, LV_ALIGN_CENTER);
        lv_obj_set_style_text_color(delBtnInner, lv_color_hex(DEMO_TEXT), LV_PART_MAIN);
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
    lv_obj_set_size(_scanOverlay, lv_pct(100), lv_pct(100));
    lv_obj_align(_scanOverlay, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_bg_color(_scanOverlay, lv_color_hex(0x000000), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(_scanOverlay, 200, LV_PART_MAIN);
    lv_obj_set_style_border_width(_scanOverlay, 0, LV_PART_MAIN);
    lv_obj_set_style_radius(_scanOverlay, 0, LV_PART_MAIN);
    lv_obj_set_flex_flow(_scanOverlay, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(_scanOverlay, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(_scanOverlay, 24, LV_PART_MAIN);

    lv_obj_t *lbl = lv_label_create(_scanOverlay);
    lv_label_set_text(lbl, "Karte ans Lesegeraet halten...");
    lv_obj_set_style_text_color(lbl, lv_color_hex(DEMO_TEXT), LV_PART_MAIN);
    lv_obj_set_style_text_font(lbl, &lv_font_montserrat_24, LV_PART_MAIN);
    lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);

    lv_obj_t *cancelBtn = lv_button_create(_scanOverlay);
    lv_obj_set_size(cancelBtn, 200, 52);
    lv_obj_set_style_bg_color(cancelBtn, lv_color_hex(DEMO_BTN_SCAN), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(cancelBtn, 255, LV_PART_MAIN);
    lv_obj_set_style_radius(cancelBtn, 10, LV_PART_MAIN);
    lv_obj_add_event_cb(cancelBtn, &DemoSettingsScreen::onCancelScanBtn, LV_EVENT_CLICKED, this);
    lv_obj_t *cancelLbl = lv_label_create(cancelBtn);
    lv_label_set_text(cancelLbl, "Abbrechen");
    lv_obj_set_align(cancelLbl, LV_ALIGN_CENTER);
    lv_obj_set_style_text_color(cancelLbl, lv_color_hex(DEMO_TEXT), LV_PART_MAIN);
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

struct RolePickerPayload
{
    DemoSettingsScreen *screen;
    DemoStore::UserRole role;
};

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
    lv_obj_set_size(_rolePicker, lv_pct(90), LV_SIZE_CONTENT);
    lv_obj_align(_rolePicker, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_bg_color(_rolePicker, lv_color_hex(DEMO_PANEL), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(_rolePicker, 255, LV_PART_MAIN);
    lv_obj_set_style_border_width(_rolePicker, 0, LV_PART_MAIN);
    lv_obj_set_style_radius(_rolePicker, 16, LV_PART_MAIN);
    lv_obj_set_flex_flow(_rolePicker, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(_rolePicker, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_all(_rolePicker, 20, LV_PART_MAIN);
    lv_obj_set_style_pad_row(_rolePicker, 14, LV_PART_MAIN);

    char titleBuf[64];
    snprintf(titleBuf, sizeof(titleBuf), "Rolle fuer Karte %s", uid.c_str());
    lv_obj_t *titleLbl = lv_label_create(_rolePicker);
    lv_label_set_text(titleLbl, titleBuf);
    lv_obj_set_style_text_color(titleLbl, lv_color_hex(DEMO_TEXT), LV_PART_MAIN);
    lv_obj_set_style_text_font(titleLbl, &lv_font_montserrat_20, LV_PART_MAIN);
    lv_label_set_long_mode(titleLbl, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(titleLbl, lv_pct(100));

    struct RoleEntry { const char *label; DemoStore::UserRole role; uint32_t color; };
    static const RoleEntry roles[] = {
        { "Kein Zugang",  DemoStore::UserRole::NO_PERMISSION, DEMO_RED    },
        { "Eingewiesen",  DemoStore::UserRole::INTRODUCED,    DEMO_GREEN  },
        { "Admin",        DemoStore::UserRole::ADMIN,         DEMO_YELLOW },
    };

    for (const auto &entry : roles)
    {
        lv_obj_t *btn = lv_button_create(_rolePicker);
        lv_obj_set_width(btn, lv_pct(100));
        lv_obj_set_height(btn, 52);
        lv_obj_set_style_bg_color(btn, lv_color_hex(entry.color), LV_PART_MAIN);
        lv_obj_set_style_bg_opa(btn, 220, LV_PART_MAIN);
        lv_obj_set_style_radius(btn, 10, LV_PART_MAIN);

        // Allocate payload on heap; freed in the event handler
        RolePickerPayload *pl = new RolePickerPayload{this, entry.role};
        lv_obj_add_event_cb(btn, &DemoSettingsScreen::onRolePickerBtn, LV_EVENT_CLICKED, pl);

        lv_obj_t *lbl = lv_label_create(btn);
        lv_label_set_text(lbl, entry.label);
        lv_obj_set_align(lbl, LV_ALIGN_CENTER);
        lv_obj_set_style_text_color(lbl, lv_color_hex(DEMO_TEXT), LV_PART_MAIN);
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
    struct DelPayload { DemoSettingsScreen *screen; uint8_t idx; };
    DelPayload *pl = static_cast<DelPayload *>(lv_event_get_user_data(e));
    if (!pl)
        return;
    DemoSettingsScreen *self = pl->screen;
    uint8_t idx = pl->idx;
    delete pl;
    DemoStore::deleteCard(idx);
    self->rebuildCardList();
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
    DemoStore::UserRole role = pl->role;
    std::string uid = self->_pendingUid;
    delete pl;

    DemoStore::addCard(uid.c_str(), role);

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
