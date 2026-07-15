#pragma once

#ifdef DEMO_MODE

#include <functional>
#include <string>
#include "../IScreen.hpp"
#include "../../../logger/logger.hpp"
#include "../../../demo/demo_store.hpp"

class DemoSettingsScreen : public IScreen
{
public:
    DemoSettingsScreen() : _logger("DemoSettingsScreen") {}

    void init() override;
    void onScreenLeave() override;
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;

    // Called by the application when a card is detected during "add card" mode.
    // uid is the hex string of the scanned UID.
    void onCardScanned(const std::string &uid);

    // Application sets this to start/stop NFC card detection for the add-card flow.
    void setStartScanCallback(std::function<void()> cb) { _startScanCb = cb; }
    void setCancelScanCallback(std::function<void()> cb) { _cancelScanCb = cb; }

    // True while waiting for a card to be scanned for the add-card flow.
    bool isWaitingForCard() const { return _waitingForCard; }

private:
    Logger _logger;
    lv_obj_t *_screen = nullptr;
    lv_obj_t *_cardList = nullptr;  // container holding the card rows
    lv_obj_t *_scanOverlay = nullptr;

    bool _waitingForCard = false;

    std::function<void()> _startScanCb;
    std::function<void()> _cancelScanCb;

    void rebuildCardList();
    void showRolePicker(const std::string &uid);
    void showScanOverlay();
    void hideScanOverlay();

    // Event callbacks (static, user_data = this)
    static void onAddCardBtn(lv_event_t *e);
    static void onDeleteCardBtn(lv_event_t *e);
    static void onCancelScanBtn(lv_event_t *e);
    static void onRolePickerBtn(lv_event_t *e);

    // Scanned UID pending role selection
    std::string _pendingUid;
    lv_obj_t *_rolePicker = nullptr;
};

#endif // DEMO_MODE
