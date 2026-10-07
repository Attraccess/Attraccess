#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>

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
      lv_label_set_text(emptyLabel, this->projectsDataInitialized ? "Keine Projekte verfügbar" : "Lade Projekte ...");
      lv_obj_set_style_text_font(emptyLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
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
      lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);
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
