#include "display/i18n.hpp"
#include "projectSelectScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <lvgl.h>

// Project name search on the project picker: a tap-to-edit search field
// opens a fullscreen keyboard editor; the committed query filters every page.

static constexpr uint32_t PROJECT_SEARCH_MAX_LENGTH = 64;

void ProjectSelectScreen::requestProjects(uint32_t page)
{
   this->showProjectsLoading();
   this->projectsRequestPending = true;
   this->projectsPendingPage = page;
   if (!this->projectsPageRequestCallback || this->projectsPageRequestCallback(page, this->projectsSearchQuery))
   {
      return;
   }

   // Nothing was sent: keep showing the last results under their own query.
   this->projectsRequestPending = false;
   this->projectsSearchQuery = this->projectsCache.search;
   this->refreshProjectsSearchField();
   this->rebuildProjectsList();
}

void ProjectSelectScreen::refreshProjects()
{
   this->requestProjects(1);
}

void ProjectSelectScreen::resetProjectsSearch()
{
   this->closeProjectsSearchEditor(false);
   this->projectsSearchQuery.clear();
   this->projectsRequestPending = false;
   this->projectsLoadFailed = false;
   // The projects belong to the user whose session ended: never show them to the next one.
   this->projectsCache = API::ProjectsOfUserResponse{};
   this->projectsDataInitialized = false;
   this->projectsCurrentPage = 1;
   this->projectsTotalCount = 0;
   this->projectsHasMore = false;
   this->refreshProjectsSearchField();
   if (this->screen)
   {
      this->rebuildProjectsList();
   }
}

void ProjectSelectScreen::createProjectsSearchRow(lv_obj_t *panel)
{
   lv_obj_t *row = lv_obj_create(panel);
   lv_obj_remove_style_all(row);
   lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_width(row, lv_pct(100));
   lv_obj_set_height(row, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(row, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_pad_column(row, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_margin_bottom(row, 8, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *field = lv_obj_create(row);
   lv_obj_remove_style_all(field);
   lv_obj_add_flag(field, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(field, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_grow(field, 1);
   lv_obj_set_height(field, 44);
   DisplayTheme::field(field);
   lv_obj_set_style_pad_hor(field, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_ver(field, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(field, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_flow(field, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(field, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_add_event_cb(field, &ProjectSelectScreen::onProjectsSearchFieldClick, LV_EVENT_CLICKED, this);

   this->projectsSearchLabel = lv_label_create(field);
   lv_obj_set_flex_grow(this->projectsSearchLabel, 1);
   lv_label_set_long_mode(this->projectsSearchLabel, LV_LABEL_LONG_DOT);
   lv_obj_set_style_text_font(this->projectsSearchLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *icon = lv_label_create(field);
   FirmwareI18n::setLabel(icon, FirmwareI18n::Text::literal(LV_SYMBOL_KEYBOARD) /* i18n-data: Language-neutral LVGL icon glyph. */);
   lv_obj_set_style_text_color(icon, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

   this->projectsSearchClearButton = lv_button_create(row);
   DisplayTheme::secondaryButton(this->projectsSearchClearButton);
   lv_obj_set_height(this->projectsSearchClearButton, 44);
   lv_obj_set_width(this->projectsSearchClearButton, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_hor(this->projectsSearchClearButton, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_event_cb(this->projectsSearchClearButton, &ProjectSelectScreen::onProjectsSearchClear, LV_EVENT_CLICKED, this);
   lv_obj_t *clearLabel = lv_label_create(this->projectsSearchClearButton);
   FirmwareI18n::setLabel(clearLabel, FirmwareI18n::Message::ClearSearch);
   lv_obj_set_style_text_font(clearLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_center(clearLabel);
}

void ProjectSelectScreen::createProjectsSearchEditor(lv_obj_t *overlay)
{
   // Fullscreen like the form field editor, so the keyboard never covers the query.
   // Created on first use: most sessions never search, and keyboards are heavy.
   lv_obj_t *editor = lv_obj_create(overlay);
   this->projectsSearchEditor = editor;
   lv_obj_remove_style_all(editor);
   lv_obj_add_flag(editor, LV_OBJ_FLAG_IGNORE_LAYOUT);
   lv_obj_add_flag(editor, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_add_flag(editor, LV_OBJ_FLAG_HIDDEN);
   lv_obj_remove_flag(editor, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_size(editor, lv_pct(100), lv_pct(100));
   lv_obj_set_align(editor, LV_ALIGN_CENTER);
   DisplayTheme::applyScreen(editor);
   lv_obj_set_style_pad_top(editor, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_left(editor, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(editor, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(editor, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_row(editor, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_flow(editor, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(editor, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   lv_obj_t *header = lv_obj_create(editor);
   lv_obj_remove_style_all(header);
   lv_obj_remove_flag(header, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_width(header, lv_pct(100));
   lv_obj_set_height(header, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

   lv_obj_t *title = lv_label_create(header);
   FirmwareI18n::setLabel(title, FirmwareI18n::Message::SearchProjects);
   lv_obj_set_style_text_color(title, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(title, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *cancelButton = lv_button_create(header);
   lv_obj_remove_style_all(cancelButton);
   lv_obj_set_size(cancelButton, 34, 34);
   DisplayTheme::secondaryButton(cancelButton);
   lv_obj_t *cancelLabel = lv_label_create(cancelButton);
   FirmwareI18n::setLabel(cancelLabel, FirmwareI18n::Text::literal(LV_SYMBOL_CLOSE) /* i18n-data: Language-neutral LVGL icon glyph. */);
   lv_obj_center(cancelLabel);
   lv_obj_add_event_cb(cancelButton, &ProjectSelectScreen::onProjectsSearchEditorCancel, LV_EVENT_CLICKED, this);

   this->projectsSearchTextarea = lv_textarea_create(editor);
   lv_obj_set_width(this->projectsSearchTextarea, lv_pct(100));
   lv_textarea_set_one_line(this->projectsSearchTextarea, true);
   lv_textarea_set_max_length(this->projectsSearchTextarea, PROJECT_SEARCH_MAX_LENGTH);
   FirmwareI18n::setPlaceholder(this->projectsSearchTextarea, FirmwareI18n::Message::SearchProjects);
   DisplayTheme::field(this->projectsSearchTextarea);
   lv_obj_set_style_text_font(this->projectsSearchTextarea, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Keeps the keyboard pinned to the bottom below the one-line textarea.
   lv_obj_t *spacer = lv_obj_create(editor);
   lv_obj_remove_style_all(spacer);
   lv_obj_remove_flag(spacer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_remove_flag(spacer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_set_width(spacer, lv_pct(100));
   lv_obj_set_flex_grow(spacer, 1);

   this->projectsSearchKeyboard = lv_keyboard_create(editor);
   DisplayTheme::keyboard(this->projectsSearchKeyboard);
   lv_obj_set_width(this->projectsSearchKeyboard, lv_pct(100));
   lv_obj_set_height(this->projectsSearchKeyboard, lv_pct(45));
   lv_keyboard_set_mode(this->projectsSearchKeyboard, LV_KEYBOARD_MODE_TEXT_LOWER);
   lv_obj_add_event_cb(this->projectsSearchKeyboard, &ProjectSelectScreen::onProjectsSearchKeyboardEvent, LV_EVENT_ALL, this);
}

void ProjectSelectScreen::refreshProjectsSearchField()
{
   if (!this->projectsSearchLabel)
   {
      return;
   }

   const bool hasQuery = !this->projectsSearchQuery.empty();
   if (hasQuery)
   {
      FirmwareI18n::setDynamicLabel(this->projectsSearchLabel, this->projectsSearchQuery.c_str()) /* i18n-data: Search text entered by the user; preserve exact contents. */;
   }
   else
   {
      FirmwareI18n::setLabel(this->projectsSearchLabel, FirmwareI18n::Message::SearchProjects);
   }
   lv_obj_set_style_text_color(this->projectsSearchLabel, hasQuery ? DisplayTheme::text() : DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

   if (this->projectsSearchClearButton)
   {
      if (hasQuery)
      {
         lv_obj_clear_flag(this->projectsSearchClearButton, LV_OBJ_FLAG_HIDDEN);
      }
      else
      {
         lv_obj_add_flag(this->projectsSearchClearButton, LV_OBJ_FLAG_HIDDEN);
      }
   }
}

void ProjectSelectScreen::openProjectsSearchEditor()
{
   if (!this->screen)
   {
      return;
   }
   if (!this->projectsSearchEditor)
   {
      this->createProjectsSearchEditor(this->screen);
   }
   lv_textarea_set_text(this->projectsSearchTextarea, this->projectsSearchQuery.c_str());
   lv_textarea_set_cursor_pos(this->projectsSearchTextarea, LV_TEXTAREA_CURSOR_LAST);
   lv_keyboard_set_textarea(this->projectsSearchKeyboard, this->projectsSearchTextarea);
   lv_obj_clear_flag(this->projectsSearchEditor, LV_OBJ_FLAG_HIDDEN);
   lv_obj_move_foreground(this->projectsSearchEditor);
}

void ProjectSelectScreen::closeProjectsSearchEditor(bool commit)
{
   if (!this->projectsSearchEditor || lv_obj_has_flag(this->projectsSearchEditor, LV_OBJ_FLAG_HIDDEN))
   {
      return;
   }
   std::string query;
   if (commit && this->projectsSearchTextarea)
   {
      const char *text = lv_textarea_get_text(this->projectsSearchTextarea);
      query = text ? text : "";
      trimString(query);
   }
   if (this->projectsSearchKeyboard)
   {
      lv_keyboard_set_textarea(this->projectsSearchKeyboard, nullptr);
   }
   lv_obj_add_flag(this->projectsSearchEditor, LV_OBJ_FLAG_HIDDEN);
   if (commit)
   {
      this->applyProjectsSearch(query);
   }
}

void ProjectSelectScreen::applyProjectsSearch(const std::string &query)
{
   if (query == this->projectsSearchQuery && this->projectsDataInitialized && !this->projectsRequestPending)
   {
      return;
   }
   // A new query always starts at the first page of its results.
   this->projectsSearchQuery = query;
   this->refreshProjectsSearchField();
   this->requestProjects(1);
}

void ProjectSelectScreen::onProjectsSearchFieldClick(lv_event_t *e)
{
   auto *self = static_cast<ProjectSelectScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   self->openProjectsSearchEditor();
}

void ProjectSelectScreen::onProjectsSearchClear(lv_event_t *e)
{
   auto *self = static_cast<ProjectSelectScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   self->applyProjectsSearch("");
}

void ProjectSelectScreen::onProjectsSearchKeyboardEvent(lv_event_t *e)
{
   auto code = lv_event_get_code(e);
   if (code != LV_EVENT_READY && code != LV_EVENT_CANCEL)
   {
      return;
   }
   auto *self = static_cast<ProjectSelectScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   // Checkmark searches, keyboard-hide discards the edit.
   self->closeProjectsSearchEditor(code == LV_EVENT_READY);
}

void ProjectSelectScreen::onProjectsSearchEditorCancel(lv_event_t *e)
{
   auto *self = static_cast<ProjectSelectScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   self->closeProjectsSearchEditor(false);
}
