#pragma once

#include "../IScreen.hpp"
#include "../../../logger/logger.hpp"
#include "../../../api/api.hpp"
#include "../../images/logo_400w_png.hpp"

class FirmwareUpdateScreen : public IScreen
{
public:
    FirmwareUpdateScreen() : logger("FirmwareUpdateScreen") {}
    void init() override;
    void loop() override;
    lv_obj_t *getScreen() override { return screen; }
    String getName() override { return "FirmwareUpdate"; }

    void setVersions(const char *current, const char *available);
    void setProgress(int percent);

private:
    Logger logger;
    lv_obj_t *screen = nullptr;
    lv_obj_t *title = nullptr;
    lv_obj_t *versionsLabel = nullptr;
    lv_obj_t *progressBar = nullptr;
};
