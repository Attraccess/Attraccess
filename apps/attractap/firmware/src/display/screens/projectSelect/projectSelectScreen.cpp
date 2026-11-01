#include "display/i18n.hpp"
#include "projectSelectScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/screenChrome.hpp"
#include <string>
#include <functional>
#include <lvgl.h>

void ProjectSelectScreen::setProjects(const API::ProjectsOfUserResponse &projects)
{
   if (this->projectsRequestPending &&
       (projects.page != this->projectsPendingPage || projects.search != this->projectsSearchQuery))
   {
      return;
   }
   this->projectsRequestPending = false;
   this->projectsCache = projects;
   this->projectsCurrentPage = projects.page;
   this->projectsTotalCount = projects.total;
   this->projectsPageLimit = projects.limit;
   this->projectsHasMore = projects.hasMore;
   this->projectsSearchQuery = projects.search;
   this->projectsDataInitialized = true;
   this->refreshProjectsSearchField();
   this->projectsLoadFailed = false;
   if (this->screen)
   {
      this->rebuildProjectsList();
   }
}

void ProjectSelectScreen::setProjectsPageRequestCallback(std::function<bool(uint32_t, const std::string &)> callback)
{
   this->projectsPageRequestCallback = callback;
}

void ProjectSelectScreen::buildProjectsView()
{
   if (this->screen)
   {
      return;
   }

   this->screen = ScreenChrome::createScreen();
   lv_obj_t *panel = lv_obj_create(this->screen);
   lv_obj_remove_style_all(panel);
   lv_obj_set_size(panel, lv_pct(100), lv_pct(100));
   lv_obj_remove_flag(panel, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(panel, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(panel, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   lv_obj_t *header = lv_obj_create(panel);
   lv_obj_remove_style_all(header);
   lv_obj_remove_flag(header, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_width(header, lv_pct(100));
   lv_obj_set_height(header, 36);
   lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_margin_bottom(header, 8, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *cancelButton = lv_button_create(header);
   DisplayTheme::secondaryButton(cancelButton);
   lv_obj_set_size(cancelButton, 150, 36);
   lv_obj_set_flex_flow(cancelButton, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(cancelButton, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_pad_column(cancelButton, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(cancelButton, &ProjectSelectScreen::onProjectsCancel, LV_EVENT_CLICKED, this);
   lv_obj_t *cancelIcon = lv_label_create(cancelButton);
   FirmwareI18n::setDynamicLabel(cancelIcon, LV_SYMBOL_LEFT) /* i18n-data: Language-neutral LVGL icon glyph. */;
   lv_obj_t *cancelLabel = lv_label_create(cancelButton);
   FirmwareI18n::setLabel(cancelLabel, FirmwareI18n::Message::Cancel);

   lv_obj_t *title = lv_label_create(header);
   FirmwareI18n::setLabel(title, FirmwareI18n::Message::SelectProject);
   lv_obj_set_style_text_font(title, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(title, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->createProjectsSearchRow(panel);

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
   lv_obj_add_event_cb(this->projectsPrevButton, &ProjectSelectScreen::onProjectsPrevPage, LV_EVENT_CLICKED, this);
   lv_obj_t *prevLabel = lv_label_create(this->projectsPrevButton);
   FirmwareI18n::setLabel(prevLabel, FirmwareI18n::Message::Back);
   lv_obj_set_style_text_font(prevLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);

   this->projectsPaginationLabel = lv_label_create(footer);
   FirmwareI18n::setLabel(this->projectsPaginationLabel, FirmwareI18n::Message::Page1);
   lv_obj_set_style_text_color(this->projectsPaginationLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->projectsNextButton = lv_button_create(footer);
   DisplayTheme::button(this->projectsNextButton);
   lv_obj_set_height(this->projectsNextButton, 36);
   lv_obj_set_width(this->projectsNextButton, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_left(this->projectsNextButton, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->projectsNextButton, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(this->projectsNextButton, &ProjectSelectScreen::onProjectsNextPage, LV_EVENT_CLICKED, this);
   lv_obj_t *nextLabel = lv_label_create(this->projectsNextButton);
   FirmwareI18n::setLabel(nextLabel, FirmwareI18n::Message::Next);
   lv_obj_set_style_text_align(nextLabel, LV_TEXT_ALIGN_RIGHT, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->refreshProjectsSearchField();
}

void ProjectSelectScreen::begin()
{
   this->buildProjectsView();
   if (this->projectsRequestPending)
   {
      // The awaited reply may have been lost while the screen was away.
      this->requestProjects(this->projectsPendingPage);
   }
   else if (!this->projectsDataInitialized)
   {
      this->requestProjects(this->projectsCurrentPage == 0 ? 1 : this->projectsCurrentPage);
   }
   else
   {
      this->rebuildProjectsList();
   }
}
void ProjectSelectScreen::onProjectsCancel(lv_event_t *e)
{
   auto *self = static_cast<ProjectSelectScreen *>(lv_event_get_user_data(e));
   if (self && self->cancelCallback)
   {
      self->cancelCallback();
   }
}
void ProjectSelectScreen::onProjectListItemClick(lv_event_t *e)
{
   auto *evt = static_cast<ProjectButtonEventData *>(lv_event_get_user_data(e));
   if (!evt || !evt->self)
   {
      return;
   }

   ProjectSelectScreen *self = evt->self;
   if (evt->index >= self->projectsCache.count)
   {
      return;
   }

   const API::Project &project = self->projectsCache.items[evt->index];
   self->selectedProjectId = project.id;
   if (self->selectionCallback)
   {
      self->selectionCallback(project.id, project.name);
   }
}

void ProjectSelectScreen::onProjectListItemDelete(lv_event_t *e)
{
   auto *evt = static_cast<ProjectButtonEventData *>(lv_event_get_user_data(e));
   if (evt)
   {
      delete evt;
   }
}

void ProjectSelectScreen::onProjectsPrevPage(lv_event_t *e)
{
   auto *self = static_cast<ProjectSelectScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }

   if (self->projectsCurrentPage <= 1)
   {
      return;
   }

   self->requestProjects(self->projectsCurrentPage - 1);
}

void ProjectSelectScreen::onProjectsNextPage(lv_event_t *e)
{
   auto *self = static_cast<ProjectSelectScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }

   if (!self->projectsHasMore)
   {
      return;
   }

   self->requestProjects(self->projectsCurrentPage + 1);
}

void ProjectSelectScreen::showProjectsLoading()
{
   if (!this->projectsListContainer)
   {
      return;
   }

   lv_obj_clean(this->projectsListContainer);
   lv_obj_t *loadingLabel = lv_label_create(this->projectsListContainer);
   FirmwareI18n::setLabel(loadingLabel, FirmwareI18n::Message::LoadingProjects);
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
      FirmwareI18n::setLabel(this->projectsPaginationLabel, FirmwareI18n::Message::Loading);
   }
}

void ProjectSelectScreen::rebuildProjectsList()
{
   if (!this->projectsListContainer)
   {
      return;
   }
   if (this->projectsRequestPending)
   {
      this->showProjectsLoading();
      return;
   }

   lv_obj_clean(this->projectsListContainer);

   if (this->projectsLoadFailed)
   {
      // The fixed list area carries the failure and its retry: nothing else moves.
      lv_obj_t *failedLabel = lv_label_create(this->projectsListContainer);
      FirmwareI18n::setLabel(failedLabel, FirmwareI18n::Message::ProjectsCouldNotBeLoaded);
      lv_label_set_long_mode(failedLabel, LV_LABEL_LONG_WRAP);
      lv_obj_set_width(failedLabel, lv_pct(100));
      lv_obj_set_style_text_font(failedLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
      lv_obj_set_style_text_color(failedLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_t *retry = lv_button_create(this->projectsListContainer);
      DisplayTheme::button(retry);
      lv_obj_set_size(retry, lv_pct(100), 48);
      lv_obj_add_event_cb(retry, &ProjectSelectScreen::onProjectsRetry, LV_EVENT_CLICKED, this);
      lv_obj_t *retryLabel = lv_label_create(retry);
      FirmwareI18n::setLabel(retryLabel, FirmwareI18n::Message::TryAgain);
      lv_obj_center(retryLabel);
      this->updateProjectsPaginationControls();
      return;
   }

   if (this->projectsCache.count == 0)
   {
      lv_obj_t *emptyLabel = lv_label_create(this->projectsListContainer);
      const auto emptyMessage = !this->projectsDataInitialized ? FirmwareI18n::Message::LoadingProjects
         : this->projectsSearchQuery.empty() ? FirmwareI18n::Message::NoProjectsAvailable
                                             : FirmwareI18n::Message::NoMatchingProjects;
      FirmwareI18n::setLabel(emptyLabel, emptyMessage);
      lv_label_set_long_mode(emptyLabel, LV_LABEL_LONG_WRAP);
      lv_obj_set_width(emptyLabel, lv_pct(100));
      lv_obj_set_style_text_font(emptyLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
      lv_obj_set_style_text_color(emptyLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
      this->updateProjectsPaginationControls();
      return;
   }

   for (uint16_t i = 0; i < this->projectsCache.count; i++)
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
      lv_obj_add_event_cb(btn, &ProjectSelectScreen::onProjectListItemClick, LV_EVENT_CLICKED, evt);
      lv_obj_add_event_cb(btn, &ProjectSelectScreen::onProjectListItemDelete, LV_EVENT_DELETE, evt);

      lv_obj_t *label = lv_label_create(btn);
      if (project.name.length() > 0)
      {
      FirmwareI18n::setDynamicLabel(label, project.name.c_str()) /* i18n-data: Server-supplied project name; preserve exact contents. */;
      }
      else
      {
         FirmwareI18n::setLabel(label, FirmwareI18n::Message::UntitledProject);
      }
      lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   }

   this->updateProjectsPaginationControls();
}

void ProjectSelectScreen::updateProjectsPaginationControls()
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
      FirmwareI18n::setLabel(this->projectsPaginationLabel, FirmwareI18n::Text::format(FirmwareI18n::Message::Pagination, {FirmwareI18n::Text::literal(std::to_string(this->projectsCurrentPage)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */, FirmwareI18n::Text::literal(std::to_string(totalPages)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */}));
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


void ProjectSelectScreen::onProjectsRetry(lv_event_t *e)
{
   auto *self = static_cast<ProjectSelectScreen *>(lv_event_get_user_data(e));
   if (self)
   {
      self->projectsLoadFailed = false;
      self->requestProjects(self->projectsCurrentPage == 0 ? 1 : self->projectsCurrentPage);
   }
}

void ProjectSelectScreen::showLoadError()
{
   this->projectsRequestPending = false;
   this->projectsLoadFailed = true;
   if (this->screen)
   {
      this->rebuildProjectsList();
   }
}

void ProjectSelectScreen::setSelectedProject(uint32_t projectId)
{
   this->selectedProjectId = projectId;
   if (this->screen && !this->projectsRequestPending)
   {
      this->rebuildProjectsList();
   }
}

void ProjectSelectScreen::setCallbacks(std::function<void(uint32_t, const std::string &)> onSelect, std::function<void()> onCancel)
{
   this->selectionCallback = std::move(onSelect);
   this->cancelCallback = std::move(onCancel);
}

void ProjectSelectScreen::init()
{
   this->buildProjectsView();
}

lv_obj_t *ProjectSelectScreen::getScreen()
{
   return this->screen;
}

void ProjectSelectScreen::loop()
{
}

std::string ProjectSelectScreen::getName()
{
   return "ProjectSelectScreen";
}

void ProjectSelectScreen::onScreenLeave()
{
   this->closeProjectsSearchEditor(false);
}

void ProjectSelectScreen::destroy()
{
   if (this->screen)
   {
      lv_obj_del(this->screen);
   }
   this->screen = nullptr;
   this->projectsListContainer = nullptr;
   this->projectsPaginationLabel = nullptr;
   this->projectsPrevButton = nullptr;
   this->projectsNextButton = nullptr;
   this->projectsSearchLabel = nullptr;
   this->projectsSearchClearButton = nullptr;
   this->projectsSearchEditor = nullptr;
   this->projectsSearchTextarea = nullptr;
   this->projectsSearchKeyboard = nullptr;
}
