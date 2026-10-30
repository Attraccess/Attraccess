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
    lv_obj_t *screen = nullptr;
    lv_obj_t *codeLabel = nullptr;
    lv_obj_t *hintLabel = nullptr;
};
