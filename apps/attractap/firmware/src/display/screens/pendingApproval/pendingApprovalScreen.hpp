#pragma once

#include <string>

#include "../IScreen.hpp"
#include "../../../state/state.hpp"
#include "../../../logger/logger.hpp"

// Shown by a reader that is not paired yet: the rotating code (and its QR) an admin approves in
// Attraccess. After an admin removed the pairing it shows "Pairing removed" until the new request has a code.
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

    // `<appUrl>/?enroll=<code without hyphen>`; empty without an app URL or code.
    static std::string buildEnrollUrl(const std::string &appUrl, const std::string &code);

private:
    // loop() runs every main-loop tick; only touch the widgets when what they show changes.
    void resetShown();
    void updateQrCode(const std::string &url);
    void showQrCode(bool visible);

    enum class View : uint8_t
    {
        Code,
        Waiting,
        Failed,
        Removed,
    };

    lv_obj_t *screen = nullptr;
    lv_obj_t *titleLabel = nullptr;
    lv_obj_t *qrCard = nullptr;
    lv_obj_t *qrCode = nullptr;
    lv_obj_t *codeLabel = nullptr;
    lv_obj_t *instructionLabel = nullptr;
    lv_obj_t *hintLabel = nullptr;
    bool hasShown = false;
    View shownView = View::Code;
    bool shownQr = false;
    std::string shownCode;
    uint32_t shownSeconds = 0;
    std::string qrUrl;
    Logger logger;
};
