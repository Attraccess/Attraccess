#pragma once

#include <string>

#include "../IScreen.hpp"
#include "../../../state/state.hpp"

// Shown by a reader that is not registered yet: the code an admin types into Attraccess to approve it.
class PendingApprovalScreen : public IScreen
{
public:
    void init();
    void onScreenLeave();
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;

private:
    // loop() runs every main-loop tick; only touch the labels when what they show changes.
    void resetShown();

    lv_obj_t *screen = nullptr;
    lv_obj_t *titleLabel = nullptr;
    lv_obj_t *codeLabel = nullptr;
    lv_obj_t *hintLabel = nullptr;
    bool hasShown = false;
    bool shownRejected = false;
    std::string shownCode;
    uint32_t shownSeconds = 0;
};
