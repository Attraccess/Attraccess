#include "display/i18n.hpp"
#include "projectSelectScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/screenChrome.hpp"
#include "../../shared/headerButton.hpp"
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

   // Header: "‹ Cancel" left, page indicator right; then the title and the resource it is for.
   lv_obj_t *header = ReaderHeader::createFlowHeader(panel, &ProjectSelectScreen::onProjectsCancel, this);
   this->projectsPaginationLabel = ReaderHeader::createPageIndicator(header);
   lv_obj_t *title = nullptr;
   ReaderHeader::createFlowTitle(panel, &title, &this->resourceNameLabel);
   FirmwareI18n::setLabel(title, FirmwareI18n::Message::SelectProject);
   FirmwareI18n::setDynamicLabel(this->resourceNameLabel, this->resourceName.c_str()) /* i18n-data: Server-supplied resource name; preserve exact contents. */;
   lv_obj_set_style_margin_bottom(this->resourceNameLabel, 8, LV_PART_MAIN);

   this->createProjectsSearchRow(panel);

   this->projectsListContainer = lv_obj_create(panel);
   lv_obj_remove_style_all(this->projectsListContainer);
   lv_obj_set_width(this->projectsListContainer, lv_pct(100));
   lv_obj_set_height(this->projectsListContainer, 0);
   lv_obj_set_flex_grow(this->projectsListContainer, 1);
   lv_obj_add_flag(this->projectsListContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_scroll_dir(this->projectsListContainer, LV_DIR_VER);
   lv_obj_set_flex_flow(this->projectsListContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->projectsListContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_row(this->projectsListContainer, 6, LV_PART_MAIN | LV_STATE_DEFAULT);

   const ReaderHeader::FlowFooter footer = ReaderHeader::createFlowFooter(panel, &ProjectSelectScreen::onProjectsPrevPage, &ProjectSelectScreen::onProjectsNextPage, this);
   this->projectsPrevButton = footer.back;
   this->projectsNextButton = footer.next;

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
      // A full page (MAX_PROJECTS_PER_PAGE) fits the list area without scrolling.
      lv_obj_set_height(btn, 40);
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

      lv_obj_set_style_pad_hor(btn, 12, LV_PART_MAIN);
      // One line; a long project name ends in dots inside its button.
      lv_obj_t *label = ScreenChrome::createOneLineLabel(btn, ScreenChrome::ContentWidth - 24, &attractap_font_montserrat_latin1_18);
      lv_obj_center(label);
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

void ProjectSelectScreen::setResourceName(const std::string &name)
{
   this->resourceName = name;
   if (this->resourceNameLabel)
   {
      FirmwareI18n::setDynamicLabel(this->resourceNameLabel, name.c_str()) /* i18n-data: Server-supplied resource name; preserve exact contents. */;
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
   this->resourceNameLabel = nullptr;
   this->projectsPrevButton = nullptr;
   this->projectsNextButton = nullptr;
   this->projectsSearchLabel = nullptr;
   this->projectsSearchClearButton = nullptr;
   this->projectsSearchEditor = nullptr;
   this->projectsSearchTextarea = nullptr;
   this->projectsSearchKeyboard = nullptr;
}
