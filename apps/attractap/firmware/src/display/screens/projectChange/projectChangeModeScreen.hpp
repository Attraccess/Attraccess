#pragma once

#include <cstdint>
#include <functional>
#include <string>

#include "../IScreen.hpp"
#include "../../../api/api.hpp"

// What a project change applies to (ATT-1421), asked after the new project is picked: the whole running session,
// listed first and highlighted, or only the time from now on. Each choice says where the usage goes.
class ProjectChangeModeScreen : public IScreen
{
public:
    struct Config
    {
        std::string resourceName;
        // The project the session is booked to now and the picked one; empty means no project.
        std::string currentProjectName;
        std::string newProjectName;
        // The running record continues an earlier split: moving it leaves the parts before it where they are.
        bool continuation = false;
        std::function<void(API::ProjectChangeMode)> onChoose;
        std::function<void()> onCancel;
    };

    void init() override;
    void onScreenLeave() override;
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;
    bool parksOrigin() const override { return true; }

    void configure(Config config);

private:
    lv_obj_t *screen = nullptr;
    Config config;

    void build();
    void createChoice(lv_obj_t *parent, FirmwareI18n::Message title, const FirmwareI18n::Text &effect, bool highlighted,
                      lv_event_cb_t cb);
    static void onWholeSession(lv_event_t *e);
    static void onFromNowOn(lv_event_t *e);
    static void onCancelClick(lv_event_t *e);
    void choose(API::ProjectChangeMode mode);
};
