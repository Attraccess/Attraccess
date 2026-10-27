#pragma once
class ResourceDetailsScreen;
#include <cstdint>
#include <string>
#include "../../../api/api.hpp"

struct ResourceDetailsProjectState
{
protected:
    struct ProjectButtonEventData
    {
        ResourceDetailsScreen *self;
        uint16_t index;
    };

    API::ProjectsOfUserResponse projectsCache;
    uint32_t selectedProjectId = 0;
    std::string selectedProjectName;
    uint32_t projectsCurrentPage = 1;
    uint32_t projectsTotalCount = 0;
    uint32_t projectsPageLimit = API::MAX_PROJECTS_PER_PAGE;
    bool projectsHasMore = false;
    bool projectsDataInitialized = false;
    lv_obj_t *projectsButton = nullptr;
    lv_obj_t *projectsButtonLabel = nullptr;
    lv_obj_t *clearProjectButton = nullptr;
    lv_obj_t *projectsModal = nullptr;
    lv_obj_t *projectsModalPanel = nullptr;
    lv_obj_t *projectsListContainer = nullptr;
    lv_obj_t *projectsPaginationLabel = nullptr;
    lv_obj_t *projectsPrevButton = nullptr;
    lv_obj_t *projectsNextButton = nullptr;
    // Committed name filter; pagination stays within its results.
    std::string projectsSearchQuery;
    lv_obj_t *projectsSearchLabel = nullptr;
    lv_obj_t *projectsSearchClearButton = nullptr;
    lv_obj_t *projectsSearchEditor = nullptr;
    lv_obj_t *projectsSearchTextarea = nullptr;
    lv_obj_t *projectsSearchKeyboard = nullptr;
};
