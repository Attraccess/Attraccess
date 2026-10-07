#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>

void ResourceDetailsScreen::onProjectsButtonClick(lv_event_t *e)
{
   auto *self = static_cast<ResourceDetailsScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   self->showProjectsModal();
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
void ResourceDetailsScreen::onProjectsModalClose(lv_event_t *e)
{
   auto *self = static_cast<ResourceDetailsScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   self->hideProjectsModal();
}
void ResourceDetailsScreen::onProjectListItemClick(lv_event_t *e)
{
   auto *evt = static_cast<ProjectButtonEventData *>(lv_event_get_user_data(e));
   if (!evt || !evt->self)
   {
      return;
   }

   ResourceDetailsScreen *self = evt->self;
   if (evt->index >= self->projectsCache.count)
   {
      return;
   }

   const API::Project &project = self->projectsCache.items[evt->index];
   self->selectedProjectId = project.id;
   self->selectedProjectName = project.name;
   self->refreshProjectsButtonLabel();

   if (self->projectSelectionCallback)
   {
      self->projectSelectionCallback(project.id, project.name);
   }

   self->hideProjectsModal();
}
void ResourceDetailsScreen::onProjectListItemDelete(lv_event_t *e)
{
   auto *evt = static_cast<ProjectButtonEventData *>(lv_event_get_user_data(e));
   if (evt)
   {
      delete evt;
   }
}
void ResourceDetailsScreen::onProjectsPrevPage(lv_event_t *e)
{
   auto *self = static_cast<ResourceDetailsScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }

   if (self->projectsCurrentPage <= 1)
   {
      return;
   }

   if (self->projectsPageRequestCallback)
   {
      self->showProjectsLoading();
      self->projectsPageRequestCallback(self->projectsCurrentPage - 1);
   }
}
void ResourceDetailsScreen::onProjectsNextPage(lv_event_t *e)
{
   auto *self = static_cast<ResourceDetailsScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }

   if (!self->projectsHasMore)
   {
      return;
   }

   if (self->projectsPageRequestCallback)
   {
      self->showProjectsLoading();
      self->projectsPageRequestCallback(self->projectsCurrentPage + 1);
   }
}
