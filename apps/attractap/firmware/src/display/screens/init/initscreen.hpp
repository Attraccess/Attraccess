#pragma once

#include <lvgl.h>
#include "../../images/logo_400w_png.hpp"
#include "../IScreen.hpp"
#include <string>
#include <functional>
#include "../../../state/state.hpp"

class InitScreen : public IScreen
{
public:
    void init();
    void onScreenLeave();
    lv_obj_t *getScreen() override;
    void loop() override;
    std::string getName() override;
    void destroy() override;

    /* Boot screen is shown once at startup; keeping it alive is harmless and
     * avoids a rebuild if the firmware returns to it (PERFORMANCE_ANALYSIS.md M4). */
    bool shouldAutoUnload() const override { return false; }

    void setOnOpenSettingsCallback(std::function<void()> onOpenSettingsCallback);

private:
    std::function<void()> onOpenSettingsCallback;
    lv_obj_t *screen = nullptr;
    void finalizeState(lv_obj_t *spinner, lv_obj_t *label, lv_color_t color);
    void markStateAsSuccess(lv_obj_t *spinner, lv_obj_t *label);
    void markStateAsError(lv_obj_t *spinner, lv_obj_t *label);
    void markStateAsWarning(lv_obj_t *spinner, lv_obj_t *label);
    void resetState(lv_obj_t *spinner, lv_obj_t *label);

    // Per-row visual state, cached so loop() only touches LVGL styles on a real
    // transition. Re-applying the same spinner/label styles every tick forces a
    // style refresh + invalidation each refresh cycle (ATT-554 item 5).
    enum class StageState
    {
        UNSET,
        PENDING,
        SUCCESS,
        WARNING,
    };
    void applyStage(lv_obj_t *spinner, lv_obj_t *label, StageState newState, StageState &cached);

    StageState wifiStage = StageState::UNSET;
    StageState ethernetStage = StageState::UNSET;
    StageState apiConnectionStage = StageState::UNSET;
    StageState apiAuthenticationStage = StageState::UNSET;

    // The connecting screen is up exactly while WiFi/TLS work runs; rebuilding
    // its Strings every loop tick is wasted heap churn. 4 Hz is plenty for a
    // status screen with a 1 Hz countdown.
    uint32_t lastLoopRefreshMs = 0;
    static constexpr uint32_t LOOP_REFRESH_INTERVAL_MS = 250;

    static void onOpenSettingsButtonEvent(lv_event_t *e);

    static std::string formatIp(esp_ip4_addr_t ip);

    lv_obj_t *wifiSpinner = nullptr;
    lv_obj_t *wifiLabel = nullptr;

    lv_obj_t *ethernetSpinner = nullptr;
    lv_obj_t *ethernetLabel = nullptr;

    lv_obj_t *apiConnectionSpinner = nullptr;
    lv_obj_t *apiConnectionLabel = nullptr;

    lv_obj_t *apiAuthenticationSpinner = nullptr;
    lv_obj_t *apiAuthenticationLabel = nullptr;

    // Connection / cert-detection progress detail lines.
    lv_obj_t *serverTargetLabel = nullptr;
    lv_obj_t *certLabel = nullptr;
    lv_obj_t *connectionStateLabel = nullptr;
};