#pragma once

#include <cstdint>
#include <functional>
#include <string>

#include "../IScreen.hpp"
#include "../../theme.hpp"
#include "../../../utils.hpp"
#include "../../../api/api.hpp"

// Project picker with search and pagination, a routed screen shown over the
// resource details. The application feeds it the pages the server returns.
class ProjectSelectScreen : public IScreen
{
public:
    void init() override;
    void onScreenLeave() override;
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;
    bool parksOrigin() const override { return true; }

    // Called before the screen is shown: starts or refreshes loading.
    void begin();
    void setProjects(const API::ProjectsOfUserResponse &projects);
    // The project list could not be loaded: the list area offers "Try again".
    void showLoadError();
    void refreshProjects();
    void resetProjectsSearch();
    void setSelectedProject(uint32_t projectId);
    // The resource the project is chosen for, shown under the title.
    void setResourceName(const std::string &name);
    void setProjectsPageRequestCallback(std::function<bool(uint32_t, const std::string &)> callback);
    void setCallbacks(std::function<void(uint32_t, const std::string &)> onSelect, std::function<void()> onCancel);

private:
    struct ProjectButtonEventData
    {
        ProjectSelectScreen *self;
        uint16_t index;
    };

    lv_obj_t *screen = nullptr;
    API::ProjectsOfUserResponse projectsCache;
    uint32_t selectedProjectId = 0;
    uint32_t projectsCurrentPage = 1;
    uint32_t projectsTotalCount = 0;
    uint32_t projectsPageLimit = API::MAX_PROJECTS_PER_PAGE;
    bool projectsHasMore = false;
    bool projectsDataInitialized = false;
    bool projectsLoadFailed = false;
    lv_obj_t *projectsListContainer = nullptr;
    lv_obj_t *projectsPaginationLabel = nullptr;
    lv_obj_t *resourceNameLabel = nullptr;
    std::string resourceName;
    lv_obj_t *projectsPrevButton = nullptr;
    lv_obj_t *projectsNextButton = nullptr;
    // Committed name filter; pagination stays within its results.
    std::string projectsSearchQuery;
    // Results for any other page or query are stale while a request is pending.
    bool projectsRequestPending = false;
    uint32_t projectsPendingPage = 0;
    lv_obj_t *projectsSearchLabel = nullptr;
    lv_obj_t *projectsSearchClearButton = nullptr;
    lv_obj_t *projectsSearchEditor = nullptr;
    lv_obj_t *projectsSearchTextarea = nullptr;
    lv_obj_t *projectsSearchKeyboard = nullptr;

    std::function<bool(uint32_t, const std::string &)> projectsPageRequestCallback;
    std::function<void(uint32_t, const std::string &)> selectionCallback;
    std::function<void()> cancelCallback;

    static void onProjectsCancel(lv_event_t *e);
    static void onProjectListItemClick(lv_event_t *e);
    static void onProjectListItemDelete(lv_event_t *e);
    static void onProjectsPrevPage(lv_event_t *e);
    static void onProjectsNextPage(lv_event_t *e);
    static void onProjectsRetry(lv_event_t *e);
    static void onProjectsSearchFieldClick(lv_event_t *e);
    static void onProjectsSearchClear(lv_event_t *e);
    static void onProjectsSearchKeyboardEvent(lv_event_t *e);
    static void onProjectsSearchEditorCancel(lv_event_t *e);

    void buildProjectsView();
    void rebuildProjectsList();
    void showProjectsLoading();
    void updateProjectsPaginationControls();
    void requestProjects(uint32_t page);
    void createProjectsSearchRow(lv_obj_t *panel);
    void createProjectsSearchEditor(lv_obj_t *overlay);
    void refreshProjectsSearchField();
    void openProjectsSearchEditor();
    void closeProjectsSearchEditor(bool commit);
    void applyProjectsSearch(const std::string &query);
};
