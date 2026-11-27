#pragma once

#include <functional>
#include <string>

#include "../IScreen.hpp"

// "Is the machine OK?", asked before the card holder ends their own session. A routed screen shown over the one the
// stop came from; Cancel keeps the session running.
class MaintenanceCheckScreen : public IScreen
{
public:
    struct Callbacks
    {
        std::function<void()> onMachineOk;
        std::function<void()> onNeedsMaintenance;
        std::function<void()> onCancel;
    };

    void init() override;
    void onScreenLeave() override {}
    void loop() override {}
    lv_obj_t *getScreen() override { return screen; }
    std::string getName() override { return "MaintenanceCheckScreen"; }
    void destroy() override;
    bool parksOrigin() const override { return true; }

    void configure(const std::string &resourceName, Callbacks callbacks);

    // The three buttons act exactly as a tap does (host tests).
    void machineOk();
    void needsMaintenance();
    void cancel();

private:
    lv_obj_t *screen = nullptr;
    std::string resourceName;
    Callbacks callbacks;

    void build();
};
