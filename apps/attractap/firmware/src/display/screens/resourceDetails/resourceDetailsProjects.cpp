#include "display/i18n.hpp"
#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>

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
}
void ResourceDetailsScreen::setOpenProjectsCallback(std::function<void()> callback)
{
   this->openProjectsCallback = callback;
}
void ResourceDetailsScreen::refreshProjectsButtonLabel()
{
   if (!this->projectsButtonLabel)
   {
      return;
   }

   const auto caption = this->selectedProjectId != 0 && !this->selectedProjectName.empty()
      ? FirmwareI18n::Text::format(FirmwareI18n::Message::ProjectName, {FirmwareI18n::Text::literal(this->selectedProjectName) /* i18n-data: Server-supplied project name; preserve exact contents. */})
      : FirmwareI18n::Text(FirmwareI18n::Message::ChooseProject);
   FirmwareI18n::setLabel(this->projectsButtonLabel, caption);
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


void ResourceDetailsScreen::onProjectsButtonClick(lv_event_t *e)
{
   auto *self = static_cast<ResourceDetailsScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   if (self->openProjectsCallback)
   {
      self->openProjectsCallback();
   }
}
void ResourceDetailsScreen::onClearProjectSelectionClick(lv_event_t *e)
{
   auto *self = static_cast<ResourceDetailsScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   self->clearSelectedProject();
}

