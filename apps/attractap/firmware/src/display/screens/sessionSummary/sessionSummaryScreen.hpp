#pragma once
#include "../IScreen.hpp"

class SessionSummaryScreen : public IScreen {
public:
    // `maintenanceRequestFiled`: 1 or 0 when the stop carried a maintenance request, -1 otherwise.
    void setSummary(const std::string &name, uint32_t durationSeconds, const std::string &charge,
                    int8_t maintenanceRequestFiled = -1);
    // How long the summary stays on its own; longer when it also says what became of a maintenance request.
    uint32_t displayDurationMs() const { return maintenance < 0 ? 3500 : 6000; }
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
    int8_t maintenance = -1;
};
