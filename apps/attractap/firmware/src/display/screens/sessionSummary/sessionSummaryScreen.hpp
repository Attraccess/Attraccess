#pragma once
#include "../IScreen.hpp"

class SessionSummaryScreen : public IScreen {
public:
    void setSummary(const std::string &name, uint32_t durationSeconds, const std::string &charge);
    void clearSummary();
    void init() override;
    void destroy() override;
    void loop() override {}
    void onScreenLeave() override {}
    std::string getName() override { return "SessionSummaryScreen"; }
    lv_obj_t *getScreen() override { return screen; }
private:
    lv_obj_t *screen = nullptr;
    std::string name, duration, charge;
};
