#ifdef DEMO_MODE

#include "demoSettingsScreen.hpp"
#include "display/theme.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include <string>
#include <cstdio>
#include "platform.hpp"
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

#endif
