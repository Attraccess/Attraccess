#pragma once

#include "../IScreen.hpp"
#include "../../../api/api.hpp"
#include "../../shared/sessionHeader.hpp"
#include "../../shared/actionOverlay.hpp"
#include "resourceListAction.hpp"
#include <functional>

class ResourceListScreen : public IScreen {
public:
    void init() override;
    void onScreenLeave() override;
    void loop() override;
    lv_obj_t *getScreen() override { return screen; }
    std::string getName() override { return "ResourceListScreen"; }
    void destroy() override;
    void setResourceList(const API::ResourceList &resources);
    void setAuthenticatedUser(const std::string &username);
    void setResourceSelectionCallback(std::function<void(const API::ResourceBrief &)> callback) { selectionCallback = std::move(callback); }
    void setActionCallback(std::function<void(const API::ResourceBrief &, ResourceListAction)> callback) { actionCallback = std::move(callback); }
    void setLogoutCallback(std::function<void()> callback) { logoutCallback = std::move(callback); }
    void setSessionTimeoutTime(uint32_t deadline) { sessionHeader.setDeadline(deadline); }
    void setSessionTimeoutPaused(bool paused) { sessionHeader.setPaused(paused); }
    void extendSessionTimeoutBy(uint32_t delta) { sessionHeader.extend(delta); }
    void showActionProgress(const FirmwareI18n::Text &title, const FirmwareI18n::Text &resource = {});
    void hideActionProgress();
    void showSuccessToast(const FirmwareI18n::Text &message);
    // Patches the plugin status line of the rows whose contribution changed (needs lv_lock()).
    void refreshUiSlots();
private:
    lv_obj_t *screen = nullptr, *logo = nullptr, *loginContainer = nullptr, *resourceContainer = nullptr, *footer = nullptr;
    lv_obj_t *clockHeader = nullptr, *clockTime = nullptr, *clockWeekday = nullptr, *clockDate = nullptr;
    int64_t shownClockMinute = -2;
    SessionHeader sessionHeader;
    ActionOverlay overlay;
    API::ResourceList cachedResourceList{};
    std::string username;
    FirmwareI18n::Text actionTitle, actionResource, successMessage;
    uint32_t successUntil = 0;
    bool busy = false;
    bool footerShowsSuccess = false;
    std::function<void(const API::ResourceBrief &)> selectionCallback;
    std::function<void(const API::ResourceBrief &, ResourceListAction)> actionCallback;
    std::function<void()> logoutCallback;
    // Plugin status line per row (resourceList.row.status); the description label stays underneath.
    struct RowStatus { uint32_t id = 0; lv_obj_t *details = nullptr, *description = nullptr, *plugin = nullptr; bool core = true; uint32_t revision = 0; };
    RowStatus rowStatus[API::MAX_RESOURCES];
    uint16_t rowStatusCount = 0;
    void patchRowStatus(RowStatus &row);
    void renderRows();
    void createClockHeader();
    void updateClockHeader();
    void addResourceListItem(const API::ResourceBrief &resource);
    struct EventData { ResourceListScreen *self; uint32_t id; bool action; };
    static void onClicked(lv_event_t *event);
};
