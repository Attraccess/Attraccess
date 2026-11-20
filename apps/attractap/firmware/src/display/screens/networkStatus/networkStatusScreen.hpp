#pragma once

#include <functional>
#include <string>

#include "../IScreen.hpp"
#include "../../shared/pinInput/pinInputPage.hpp"

// Live connection health from State::getNetworkQualityState(), opened from the
// maintenance drawer behind the device PIN (ATT-1273). Unlike the connection
// settings it keeps the reader connected, so the values stay current while it
// is open. It is shown on top of the screen the user was on.
class NetworkStatusScreen : public IScreen
{
public:
    void init() override;
    void onScreenLeave() override;
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;
    bool parksOrigin() const override { return true; }

    // Shows the PIN overlay again; called before each opening.
    void lock();
    // Called for Back and for Cancel on the PIN overlay.
    void setOnCloseCallback(std::function<void()> onCloseCallback);

    // Rows, top to bottom.
    enum Row
    {
        RowQuality,
        RowLastMessageAge,
        RowLatestPing,
        RowAveragePing,
        RowPingTrend,
        RowReconnects,
        RowSendQueueDepth,
        RowSendQueueFull,
        RowSendFailures,
        RowConnectionTimeouts,
        RowPingTimeouts,
        RowPingLoss,
        RowMissedHeartbeats,
        RowCount
    };

private:
    lv_obj_t *screen = nullptr;
    lv_obj_t *pinLockOverlay = nullptr;
    PinInputPage pinInputPage;
    bool locked = true;
    std::function<void()> onCloseCallback;

    lv_obj_t *values[RowCount] = {};
    uint32_t lastRefreshMs = 0;

    void refresh();
    bool onPinConfirmed(const std::string &pin);
    void close();
};
