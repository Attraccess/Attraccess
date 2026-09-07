#include "resourceDetailsScreen.hpp"
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

   std::string label = "Projekt waehlen";
   if (this->selectedProjectId != 0 && this->selectedProjectName.length() > 0)
   {
      label = "Projekt: " + this->selectedProjectName;
   }

   lv_label_set_text(this->projectsButtonLabel, label.c_str());
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
void ResourceDetailsScreen::ensureProjectsModal()
{
   if (this->projectsModal)
   {
      return;
   }

   lv_obj_t *overlay = lv_obj_create(lv_layer_top());
   this->projectsModal = overlay;
   lv_obj_remove_style_all(overlay);
   lv_obj_add_flag(overlay, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_flag(overlay, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_set_size(overlay, lv_pct(100), lv_pct(100));
   lv_obj_set_align(overlay, LV_ALIGN_CENTER);
   lv_obj_set_style_bg_color(overlay, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(overlay, 160, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_flow(overlay, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(overlay, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

   lv_obj_t *panel = lv_obj_create(overlay);
   this->projectsModalPanel = panel;
   lv_obj_remove_style_all(panel);
   lv_obj_set_width(panel, lv_pct(90));
   lv_obj_set_style_max_width(panel, 400, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_min_height(panel, 370, LV_PART_MAIN | LV_STATE_DEFAULT);
   DisplayTheme::applySurface(panel);
   lv_obj_set_style_pad_left(panel, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(panel, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(panel, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(panel, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_flow(panel, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(panel, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);

   lv_obj_t *header = lv_obj_create(panel);
   lv_obj_remove_style_all(header);
   lv_obj_set_width(header, lv_pct(100));
   lv_obj_set_height(header, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_margin_bottom(header, 12, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *title = lv_label_create(header);
   lv_label_set_text(title, "Projekt auswaehlen");
   lv_obj_set_style_text_font(title, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(title, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *closeButton = lv_button_create(header);
   DisplayTheme::secondaryButton(closeButton);
   lv_obj_set_size(closeButton, 32, 32);
   lv_obj_set_style_pad_all(closeButton, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(closeButton, &ResourceDetailsScreen::onProjectsModalClose, LV_EVENT_CLICKED, this);
   lv_obj_t *closeLabel = lv_label_create(closeButton);
   lv_label_set_text(closeLabel, LV_SYMBOL_CLOSE);
   lv_obj_center(closeLabel);

   this->projectsListContainer = lv_obj_create(panel);
   lv_obj_remove_style_all(this->projectsListContainer);
   lv_obj_set_width(this->projectsListContainer, lv_pct(100));
   lv_obj_set_height(this->projectsListContainer, 240);
   lv_obj_set_style_max_height(this->projectsListContainer, 240, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_grow(this->projectsListContainer, 1);
   lv_obj_add_flag(this->projectsListContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_scroll_dir(this->projectsListContainer, LV_DIR_VER);
   lv_obj_set_flex_flow(this->projectsListContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->projectsListContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_row(this->projectsListContainer, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_margin_bottom(this->projectsListContainer, 12, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *footer = lv_obj_create(panel);
   lv_obj_remove_style_all(footer);
   lv_obj_set_width(footer, lv_pct(100));
   lv_obj_set_height(footer, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(footer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(footer, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

   this->projectsPrevButton = lv_button_create(footer);
   DisplayTheme::secondaryButton(this->projectsPrevButton);
   lv_obj_set_height(this->projectsPrevButton, 36);
   lv_obj_set_width(this->projectsPrevButton, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_left(this->projectsPrevButton, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->projectsPrevButton, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(this->projectsPrevButton, &ResourceDetailsScreen::onProjectsPrevPage, LV_EVENT_CLICKED, this);
   lv_obj_t *prevLabel = lv_label_create(this->projectsPrevButton);
   lv_label_set_text(prevLabel, "Zurueck");

   this->projectsPaginationLabel = lv_label_create(footer);
   lv_label_set_text(this->projectsPaginationLabel, "Seite 1");
   lv_obj_set_style_text_color(this->projectsPaginationLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->projectsNextButton = lv_button_create(footer);
   DisplayTheme::button(this->projectsNextButton);
   lv_obj_set_height(this->projectsNextButton, 36);
   lv_obj_set_width(this->projectsNextButton, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_left(this->projectsNextButton, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->projectsNextButton, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(this->projectsNextButton, &ResourceDetailsScreen::onProjectsNextPage, LV_EVENT_CLICKED, this);
   lv_obj_t *nextLabel = lv_label_create(this->projectsNextButton);
   lv_label_set_text(nextLabel, "Weiter");
   lv_obj_set_style_text_align(nextLabel, LV_TEXT_ALIGN_RIGHT, LV_PART_MAIN | LV_STATE_DEFAULT);
}
void ResourceDetailsScreen::showProjectsModal()
{
   this->ensureProjectsModal();
   if (!this->projectsDataInitialized)
   {
      this->showProjectsLoading();
      if (this->projectsPageRequestCallback)
      {
         uint32_t page = this->projectsCurrentPage == 0 ? 1 : this->projectsCurrentPage;
         this->projectsPageRequestCallback(page);
      }
   }
   else
   {
      this->rebuildProjectsList();
   }
   if (this->projectsModal)
   {
      lv_obj_clear_flag(this->projectsModal, LV_OBJ_FLAG_HIDDEN);
   }
}
void ResourceDetailsScreen::hideProjectsModal()
{
   if (!this->projectsModal)
   {
      return;
   }
   lv_obj_add_flag(this->projectsModal, LV_OBJ_FLAG_HIDDEN);
}
void ResourceDetailsScreen::showProjectsLoading()
{
   if (!this->projectsListContainer)
   {
      return;
   }

   lv_obj_clean(this->projectsListContainer);
   lv_obj_t *loadingLabel = lv_label_create(this->projectsListContainer);
   lv_label_set_text(loadingLabel, "Lade Projekte ...");
   lv_obj_set_style_text_color(loadingLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   if (this->projectsPrevButton)
   {
      lv_obj_add_state(this->projectsPrevButton, LV_STATE_DISABLED);
   }
   if (this->projectsNextButton)
   {
      lv_obj_add_state(this->projectsNextButton, LV_STATE_DISABLED);
   }
   if (this->projectsPaginationLabel)
   {
      lv_label_set_text(this->projectsPaginationLabel, "Lade...");
   }
}
void ResourceDetailsScreen::rebuildProjectsList()
{
   if (!this->projectsListContainer)
   {
      return;
   }

   lv_obj_clean(this->projectsListContainer);

   if (this->projectsCache.count == 0)
   {
      lv_obj_t *emptyLabel = lv_label_create(this->projectsListContainer);
      lv_label_set_text(emptyLabel, this->projectsDataInitialized ? "Keine Projekte verfuegbar" : "Lade Projekte ...");
      lv_obj_set_style_text_color(emptyLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
      this->updateProjectsPaginationControls();
      return;
   }

   for (uint8_t i = 0; i < this->projectsCache.count; i++)
   {
      const API::Project &project = this->projectsCache.items[i];
      lv_obj_t *btn = lv_button_create(this->projectsListContainer);
      lv_obj_set_width(btn, lv_pct(100));
      lv_obj_set_height(btn, 48);
      lv_obj_add_flag(btn, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
      lv_obj_remove_flag(btn, LV_OBJ_FLAG_SCROLLABLE);
      DisplayTheme::secondaryButton(btn);

      if (project.id == this->selectedProjectId && this->selectedProjectId != 0)
      {
         DisplayTheme::button(btn);
      }

      ProjectButtonEventData *evt = new ProjectButtonEventData{this, i};
      lv_obj_add_event_cb(btn, &ResourceDetailsScreen::onProjectListItemClick, LV_EVENT_CLICKED, evt);
      lv_obj_add_event_cb(btn, &ResourceDetailsScreen::onProjectListItemDelete, LV_EVENT_DELETE, evt);

      lv_obj_t *label = lv_label_create(btn);
      if (project.name.length() > 0)
      {
         lv_label_set_text(label, project.name.c_str());
      }
      else
      {
         lv_label_set_text(label, "Unbenanntes Projekt");
      }
      lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
   }

   this->updateProjectsPaginationControls();
}
void ResourceDetailsScreen::updateProjectsPaginationControls()
{
   uint32_t totalPages = 1;
   if (this->projectsPageLimit > 0)
   {
      totalPages = (this->projectsTotalCount + this->projectsPageLimit - 1) / this->projectsPageLimit;
      if (totalPages == 0)
      {
         totalPages = 1;
      }
   }

   if (this->projectsPaginationLabel)
   {
      lv_label_set_text_fmt(this->projectsPaginationLabel, "Seite %u von %u", (unsigned)this->projectsCurrentPage, (unsigned)totalPages);
   }

   if (this->projectsPrevButton)
   {
      if (this->projectsCurrentPage <= 1)
      {
         lv_obj_add_state(this->projectsPrevButton, LV_STATE_DISABLED);
      }
      else
      {
         lv_obj_clear_state(this->projectsPrevButton, LV_STATE_DISABLED);
      }
   }

   if (this->projectsNextButton)
   {
      if (!this->projectsHasMore)
      {
         lv_obj_add_state(this->projectsNextButton, LV_STATE_DISABLED);
      }
      else
      {
         lv_obj_clear_state(this->projectsNextButton, LV_STATE_DISABLED);
      }
   }
}
