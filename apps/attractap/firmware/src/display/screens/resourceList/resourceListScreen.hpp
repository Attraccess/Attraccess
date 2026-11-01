#pragma once

#include "../IScreen.hpp"
#include "../../../api/api.hpp"
#include "../../shared/sessionHeader.hpp"
#include "../../shared/actionOverlay.hpp"
#include "../../shared/buttonError.hpp"
#include <map>
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
    // Shows `text` in place on the action button of the resource's row; false when the row has none.
    bool showActionError(uint32_t resourceId, const FirmwareI18n::Text &text);
private:
    lv_obj_t *screen = nullptr, *logo = nullptr, *loginContainer = nullptr, *resourceContainer = nullptr, *footer = nullptr;
    lv_obj_t *clockHeader = nullptr, *clockTime = nullptr, *clockWeekday = nullptr, *clockDate = nullptr;
    int64_t shownClockMinute = -2;
    SessionHeader sessionHeader;
    ActionOverlay overlay;
    API::ResourceList cachedResourceList{};
    std::string username;
    FirmwareI18n::Text actionTitle, actionResource;
    ButtonError rowError;
    struct ActionButton { lv_obj_t *button; ResourceListAction action; };
    std::map<uint32_t, ActionButton> actionButtons;
    uint32_t errorResourceId = 0;
    ResourceListAction errorAction = ResourceListAction::None;
    FirmwareI18n::Text errorText;
    uint32_t errorUntil = 0;
    bool busy = false;
    std::function<void(const API::ResourceBrief &)> selectionCallback;
    std::function<void(const API::ResourceBrief &, ResourceListAction)> actionCallback;
    std::function<void()> logoutCallback;
    void renderRows();
    bool applyActionError();
    void createClockHeader();
    void updateClockHeader();
    void addResourceListItem(const API::ResourceBrief &resource);
    struct EventData { ResourceListScreen *self; uint32_t id; bool action; };
    static void onClicked(lv_event_t *event);
};
