#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>

void ResourceDetailsScreen::disposeProjectsModal()
{
   if (this->projectsModal)
   {
      lv_obj_del(this->projectsModal);
   }
   this->projectsModal = nullptr;
   this->projectsModalPanel = nullptr;
   this->projectsListContainer = nullptr;
   this->projectsPaginationLabel = nullptr;
   this->projectsPrevButton = nullptr;
   this->projectsNextButton = nullptr;
}
void ResourceDetailsScreen::setProjects(const API::ProjectsOfUserResponse &projects)
{
   this->projectsCache = projects;
   this->projectsCurrentPage = projects.page;
   this->projectsTotalCount = projects.total;
   this->projectsPageLimit = projects.limit;
   this->projectsHasMore = projects.hasMore;
   this->projectsDataInitialized = true;
   if (this->projectsModal && !lv_obj_has_flag(this->projectsModal, LV_OBJ_FLAG_HIDDEN))
   {
      this->rebuildProjectsList();
   }
   this->refreshProjectsButtonLabel();
}
void ResourceDetailsScreen::setProjectsPageRequestCallback(std::function<void(uint32_t)> callback)
{
   this->projectsPageRequestCallback = callback;
}
void ResourceDetailsScreen::setProjectSelectionCallback(std::function<void(uint32_t, const std::string &)> callback)
{
   this->projectSelectionCallback = callback;
}
void ResourceDetailsScreen::setSelectedProject(uint32_t projectId, const char *projectName)
{
   this->selectedProjectId = projectId;
   if (projectName)
   {
      this->selectedProjectName = projectName;
   }
   else
   {
      this->selectedProjectName = "";
   }
   this->refreshProjectsButtonLabel();
   this->updateClearProjectButtonState();
   if (this->projectsModal && !lv_obj_has_flag(this->projectsModal, LV_OBJ_FLAG_HIDDEN))
   {
      this->rebuildProjectsList();
   }
}
void ResourceDetailsScreen::refreshProjectsButtonLabel()
{
   if (!this->projectsButtonLabel)
   {
      return;
   }

   std::string label = "Projekt wählen";
   if (this->selectedProjectId != 0 && this->selectedProjectName.length() > 0)
   {
      label = "Projekt: " + this->selectedProjectName;
   }

   lv_label_set_text(this->projectsButtonLabel, label.c_str());
   lv_obj_set_style_text_font(this->projectsButtonLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);
}
void ResourceDetailsScreen::updateClearProjectButtonState()
{
   if (!this->clearProjectButton)
   {
      return;
   }

   if (this->selectedProjectId == 0)
   {
      lv_obj_add_state(this->clearProjectButton, LV_STATE_DISABLED);
   }
   else
   {
      lv_obj_clear_state(this->clearProjectButton, LV_STATE_DISABLED);
   }
}
void ResourceDetailsScreen::clearSelectedProject()
{
   if (this->selectedProjectId == 0 && this->selectedProjectName.length() == 0)
   {
      return;
   }

   this->setSelectedProject(0, nullptr);

   if (this->projectSelectionCallback)
   {
      std::string empty;
      this->projectSelectionCallback(0, empty);
   }
}
