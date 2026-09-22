#pragma once

#include "../IScreen.hpp"
#include "../../../api/api.hpp"
#include "display/shared/sessionHeader.hpp"
#include "display/shared/actionOverlay.hpp"
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
    void showActionProgress(const char *title, const char *resource = "");
    void hideActionProgress();
    void showSuccessToast(const char *message);
private:
    lv_obj_t *screen = nullptr, *logo = nullptr, *loginContainer = nullptr, *resourceContainer = nullptr, *footer = nullptr;
    SessionHeader sessionHeader;
    ActionOverlay overlay;
    API::ResourceList cachedResourceList{};
    std::string username, actionTitle, actionResource, successMessage;
    uint32_t successUntil = 0;
    bool busy = false;
    bool footerShowsSuccess = false;
    std::function<void(const API::ResourceBrief &)> selectionCallback;
    std::function<void(const API::ResourceBrief &, ResourceListAction)> actionCallback;
    std::function<void()> logoutCallback;
    void renderRows();
    void addResourceListItem(const API::ResourceBrief &resource);
    struct EventData { ResourceListScreen *self; uint32_t id; bool action; };
    static void onClicked(lv_event_t *event);
};
