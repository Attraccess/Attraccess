#pragma once

#include <string>

#include "../IScreen.hpp"
#include "../../../state/state.hpp"
#include "../../../logger/logger.hpp"

// Shown by a reader that is not registered yet: the code an admin types into Attraccess to approve it.
class PendingApprovalScreen : public IScreen
{
public:
    PendingApprovalScreen() : logger("PendingApprovalScreen") {}
    void init();
    void onScreenLeave();
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;
    // The QR of the enrollment link; null before init(). Visible only while it shows the current link.
    lv_obj_t *getQrCode() const { return this->qrCode; }
    bool isQrVisible() const;

private:
    lv_obj_t *screen = nullptr;
    lv_obj_t *codeLabel = nullptr;
    lv_obj_t *hintLabel = nullptr;
    lv_obj_t *scanHintLabel = nullptr;
    lv_obj_t *qrCard = nullptr;
    lv_obj_t *qrCode = nullptr;
    std::string qrUrl;
    Logger logger;

    void updateQrCode(const std::string &url);
    void showQrCode(bool visible);
};
