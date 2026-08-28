#include "resourceListScreen.hpp"
#include "platform.hpp"
#include <string>
#include <functional>

void ResourceListScreen::init()
{
   if (this->screen)
   {
      return;
   }
   this->screen = lv_obj_create(NULL);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_bg_image_src(this->screen, &lockscreen_background_image, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_left(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *logo = lv_image_create(this->screen);
   lv_image_set_src(logo, &logo_40h);
   lv_obj_set_height(logo, 40);
   lv_obj_set_width(logo, lv_pct(100));
   lv_obj_set_align(logo, LV_ALIGN_CENTER);
    lv_obj_add_flag(logo, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(logo, LV_OBJ_FLAG_SCROLLABLE);

    this->loginContainer = lv_obj_create(this->screen);
    lv_obj_remove_style_all(this->loginContainer);
    lv_obj_set_width(this->loginContainer, lv_pct(100));
    lv_obj_set_height(this->loginContainer, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(this->loginContainer, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(this->loginContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
    lv_obj_set_style_pad_column(this->loginContainer, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *logoutButton = lv_button_create(this->loginContainer);
    lv_obj_set_width(logoutButton, 70);
    lv_obj_set_style_bg_color(logoutButton, lv_color_hex(0xF31260), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_add_event_cb(logoutButton, &ResourceListScreen::onLogoutClicked, LV_EVENT_CLICKED, this);
    lv_obj_t *logoutLabel = lv_label_create(logoutButton);
    lv_label_set_text(logoutLabel, "Abmelden");
    lv_obj_set_style_text_font(logoutLabel, &lv_font_montserrat_10, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_center(logoutLabel);

    lv_obj_t *userAndTimeoutContainer = lv_obj_create(this->loginContainer);
    lv_obj_remove_style_all(userAndTimeoutContainer);
    lv_obj_set_flex_grow(userAndTimeoutContainer, 1);
    lv_obj_set_flex_flow(userAndTimeoutContainer, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(userAndTimeoutContainer, 5, LV_PART_MAIN | LV_STATE_DEFAULT);

    this->loginUserLabel = lv_label_create(userAndTimeoutContainer);
    lv_obj_set_width(this->loginUserLabel, lv_pct(100));
    lv_label_set_text(this->loginUserLabel, this->loginUsernameCache.c_str());
    lv_obj_set_style_text_font(this->loginUserLabel, &lv_font_montserrat_10, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_color(this->loginUserLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);

    this->sessionTimeoutIndicator = lv_bar_create(userAndTimeoutContainer);
    lv_bar_set_mode(this->sessionTimeoutIndicator, LV_BAR_MODE_SYMMETRICAL);
    lv_bar_set_range(this->sessionTimeoutIndicator, 0, 30);
    lv_bar_set_value(this->sessionTimeoutIndicator, 30, LV_ANIM_OFF);
    lv_bar_set_start_value(this->sessionTimeoutIndicator, 30, LV_ANIM_OFF);
    lv_obj_set_size(this->sessionTimeoutIndicator, lv_pct(100), 10);
    lv_obj_set_style_bg_color(this->sessionTimeoutIndicator, lv_color_hex(0xF31260), LV_PART_INDICATOR | LV_STATE_DEFAULT);
    if (!this->authenticated)
    {
       lv_obj_add_flag(this->loginContainer, LV_OBJ_FLAG_HIDDEN);
    }

   this->resourceContainer = lv_obj_create(this->screen);
   lv_obj_remove_style_all(resourceContainer);
   lv_obj_set_width(resourceContainer, lv_pct(100));
   lv_obj_set_height(resourceContainer, 380);
   lv_obj_set_align(resourceContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(resourceContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(resourceContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(resourceContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_set_flex_grow(resourceContainer, 1);
   lv_obj_add_flag(resourceContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_scroll_dir(resourceContainer, LV_DIR_VER);
   lv_obj_set_scrollbar_mode(resourceContainer, LV_SCROLLBAR_MODE_AUTO);
   lv_obj_set_style_pad_row(resourceContainer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);

    if (this->hasCachedResourceList)
   {
      this->setResourceList(this->cachedResourceList);
   }
}

void ResourceListScreen::setResourceList(const API::ResourceList &resourceList)
{
   this->cachedResourceList = resourceList;
   this->hasCachedResourceList = true;

   if (!this->resourceContainer)
   {
      return;
   }
   // Clear only the resource items while keeping static UI (logo, container) intact
   if (this->resourceContainer)
   {
      lv_obj_clean(this->resourceContainer);
   }

   for (uint16_t i = 0; i < resourceList.count; ++i)
   {
      this->addResourceListItem(resourceList.items[i]);
   }
}

void ResourceListScreen::setAuthenticated(bool authenticated)
{
   if (this->authenticated == authenticated)
   {
      return;
    }
    this->authenticated = authenticated;
    if (this->loginContainer)
    {
       if (authenticated)
       {
          lv_obj_clear_flag(this->loginContainer, LV_OBJ_FLAG_HIDDEN);
       }
       else
       {
          lv_obj_add_flag(this->loginContainer, LV_OBJ_FLAG_HIDDEN);
          this->hideActionProgress();
       }
    }
   if (this->hasCachedResourceList)
   {
      this->setResourceList(this->cachedResourceList);
   }
}

void ResourceListScreen::addResourceListItem(const API::ResourceBrief &resource)
{
   const bool hasDirectAction = this->authenticated && this->resourceActionAvailableCallback &&
                                this->resourceActionAvailableCallback(resource);
    lv_obj_t *resourceButton = hasDirectAction
                                     ? lv_obj_create(this->resourceContainer)
                                     : lv_button_create(this->resourceContainer);
    lv_obj_set_width(resourceButton, lv_pct(100));
    lv_obj_set_height(resourceButton, hasDirectAction ? 80 : LV_SIZE_CONTENT);
   // lv_obj_set_x(resourceButton, -18);
   // lv_obj_set_y(resourceButton, 24);
   lv_obj_set_align(resourceButton, LV_ALIGN_CENTER);
    lv_obj_set_flex_flow(resourceButton, hasDirectAction ? LV_FLEX_FLOW_ROW : LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(resourceButton, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_add_flag(resourceButton, LV_OBJ_FLAG_SCROLL_ON_FOCUS);
   lv_obj_remove_flag(resourceButton, LV_OBJ_FLAG_SCROLLABLE);

   lv_obj_set_style_border_opa(resourceButton, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_border_width(resourceButton, hasDirectAction ? 0 : 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_border_side(resourceButton, LV_BORDER_SIDE_RIGHT, LV_PART_MAIN | LV_STATE_DEFAULT);
   // Status priority mirrors the web resource list: in use > maintenance > available.
   if (resource.hasActiveUsage)
   {
      lv_obj_set_style_border_color(resourceButton, lv_color_hex(0xF31260), LV_PART_MAIN | LV_STATE_DEFAULT);
   }
   else if (resource.isUnderMaintenance)
   {
      lv_obj_set_style_border_color(resourceButton, lv_color_hex(0xF5A524), LV_PART_MAIN | LV_STATE_DEFAULT);
   }
   else
   {
      lv_obj_set_style_border_color(resourceButton, lv_color_hex(0x00FF00), LV_PART_MAIN | LV_STATE_DEFAULT);
   }

    lv_obj_t *detailsButton = resourceButton;
     if (hasDirectAction)
     {
        // The row itself is only a layout container. Styling it like a card adds
        // a white gutter around the two action halves.
        lv_obj_set_style_bg_opa(resourceButton, LV_OPA_TRANSP, LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_pad_all(resourceButton, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
        detailsButton = lv_button_create(resourceButton);
        lv_obj_set_width(detailsButton, lv_pct(75));
       lv_obj_set_height(detailsButton, lv_pct(100));
       lv_obj_set_flex_flow(detailsButton, LV_FLEX_FLOW_COLUMN);
       lv_obj_set_flex_align(detailsButton, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

       lv_obj_t *actionButton = lv_button_create(resourceButton);
        lv_obj_set_width(actionButton, lv_pct(25));
       lv_obj_set_height(actionButton, lv_pct(100));
       lv_obj_set_style_bg_color(actionButton,
                                  lv_color_hex(resource.hasActiveUsage ? 0xF31260 : 0x17C964),
                                  LV_PART_MAIN | LV_STATE_DEFAULT);
       lv_obj_t *actionLabel = lv_label_create(actionButton);
       lv_obj_center(actionLabel);
       lv_label_set_text(actionLabel, resource.hasActiveUsage ? "Stop" : "Start");
       lv_obj_set_style_text_font(actionLabel, &lv_font_montserrat_20, LV_PART_MAIN | LV_STATE_DEFAULT);

       ResourceEventData *actionEvent = new ResourceEventData{this, resource, false};
       lv_obj_add_event_cb(actionButton, &ResourceListScreen::onResourceClicked, LV_EVENT_CLICKED, actionEvent);
       lv_obj_add_event_cb(actionButton, &ResourceListScreen::onContainerDelete, LV_EVENT_DELETE, actionEvent);
    }

    lv_obj_t *resourceNameLabel = lv_label_create(detailsButton);
   lv_obj_set_width(resourceNameLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(resourceNameLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(resourceNameLabel, LV_ALIGN_CENTER);
   lv_label_set_text(resourceNameLabel, resource.name);
   lv_obj_remove_flag(resourceNameLabel, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_remove_flag(resourceNameLabel, LV_OBJ_FLAG_SCROLL_ELASTIC);
   lv_obj_remove_flag(resourceNameLabel, LV_OBJ_FLAG_SCROLL_MOMENTUM);
   lv_obj_remove_flag(resourceNameLabel, LV_OBJ_FLAG_SCROLL_CHAIN);
   lv_obj_set_style_text_font(resourceNameLabel, &lv_font_montserrat_24, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_min_width(resourceNameLabel, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_max_width(resourceNameLabel, 370, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_label_set_long_mode(resourceNameLabel, LV_LABEL_LONG_SCROLL);

    lv_obj_t *resourceDescriptionContainer = lv_label_create(detailsButton);
   lv_obj_set_height(resourceDescriptionContainer, 14);
   lv_obj_set_width(resourceDescriptionContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(resourceDescriptionContainer, LV_ALIGN_CENTER);
   lv_label_set_text(resourceDescriptionContainer, resource.description);
   lv_obj_remove_flag(resourceDescriptionContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_remove_flag(resourceDescriptionContainer, LV_OBJ_FLAG_SCROLL_ELASTIC);
   lv_obj_remove_flag(resourceDescriptionContainer, LV_OBJ_FLAG_SCROLL_MOMENTUM);
   lv_obj_remove_flag(resourceDescriptionContainer, LV_OBJ_FLAG_SCROLL_CHAIN);
   lv_obj_set_style_text_font(resourceDescriptionContainer, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_min_width(resourceDescriptionContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_max_width(resourceDescriptionContainer, 300, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_label_set_long_mode(resourceDescriptionContainer, LV_LABEL_LONG_DOT);

   // Prepare event data with a copy of the resource brief (small fixed struct)
    if (this->authenticated)
    {
       ResourceEventData *detailsEvent = new ResourceEventData{this, resource, true};
       lv_obj_add_event_cb(detailsButton, &ResourceListScreen::onResourceClicked, LV_EVENT_CLICKED, detailsEvent);
       lv_obj_add_event_cb(detailsButton, &ResourceListScreen::onContainerDelete, LV_EVENT_DELETE, detailsEvent);
    }
}

void ResourceListScreen::setNoResourcesMessage()
{
   lv_obj_t *noResourcesMessage = lv_label_create(this->screen);
   lv_obj_set_width(noResourcesMessage, lv_pct(100));
   lv_obj_set_height(noResourcesMessage, LV_SIZE_CONTENT);
   lv_obj_set_align(noResourcesMessage, LV_ALIGN_CENTER);
   lv_label_set_text(noResourcesMessage, "Keine Ressourcen mit diesem Reader verknuepft, bitte konfigurieren Sie den Reader in der Attraccess Administration");
   lv_obj_set_style_text_font(noResourcesMessage, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(noResourcesMessage, lv_color_hex(0xff0000), LV_PART_MAIN | LV_STATE_DEFAULT);
}

lv_obj_t *ResourceListScreen::getScreen()
{
   return this->screen;
}

void ResourceListScreen::loop()
{
    this->updateSessionTimeoutIndicator();
}

void ResourceListScreen::setLoginUsername(const std::string &username)
{
    this->loginUsernameCache = username;
    if (this->loginUserLabel)
    {
       lv_label_set_text(this->loginUserLabel, username.c_str());
    }
}

void ResourceListScreen::setSessionTimeoutTime(uint32_t sessionTimeoutTime)
{
    this->sessionTimeoutTime = sessionTimeoutTime;
    this->updateSessionTimeoutIndicator();
}

void ResourceListScreen::setSessionTimeoutPaused(bool paused)
{
    if (paused == this->sessionTimeoutPaused)
    {
       return;
    }
    this->sessionTimeoutPaused = paused;
    if (paused)
    {
       this->pauseFrozenAtMs = millis();
    }
    else
    {
       this->updateSessionTimeoutIndicator();
    }
}

void ResourceListScreen::extendSessionTimeoutBy(uint32_t ms)
{
    this->sessionTimeoutTime += ms;
    this->updateSessionTimeoutIndicator();
}

void ResourceListScreen::updateSessionTimeoutIndicator()
{
    if (!this->sessionTimeoutIndicator)
    {
       return;
    }
    uint32_t now = this->sessionTimeoutPaused ? this->pauseFrozenAtMs : millis();
    uint32_t remainingMillis = this->sessionTimeoutTime > now
                                   ? this->sessionTimeoutTime - now + 1000
                                   : 0;
    long remainingSeconds = remainingMillis / 1000;
    lv_bar_set_value(this->sessionTimeoutIndicator,
                     remainingSeconds < 0 ? 0 : (remainingSeconds > 30 ? 30 : remainingSeconds),
                     LV_ANIM_ON);
}

void ResourceListScreen::showActionProgress(const char *text)
{
    if (!this->actionOverlay)
    {
       this->actionOverlay = lv_obj_create(this->screen);
       lv_obj_remove_style_all(this->actionOverlay);
       lv_obj_add_flag(this->actionOverlay, LV_OBJ_FLAG_IGNORE_LAYOUT);
       lv_obj_add_flag(this->actionOverlay, LV_OBJ_FLAG_CLICKABLE);
       lv_obj_set_size(this->actionOverlay, lv_pct(100), lv_pct(100));
       lv_obj_set_align(this->actionOverlay, LV_ALIGN_CENTER);
       lv_obj_set_style_bg_color(this->actionOverlay, lv_color_black(), LV_PART_MAIN | LV_STATE_DEFAULT);
       lv_obj_set_style_bg_opa(this->actionOverlay, 128, LV_PART_MAIN | LV_STATE_DEFAULT);
       lv_obj_set_flex_flow(this->actionOverlay, LV_FLEX_FLOW_COLUMN);
       lv_obj_set_flex_align(this->actionOverlay, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
       lv_obj_t *spinner = lv_spinner_create(this->actionOverlay);
       lv_obj_set_size(spinner, 48, 48);
       this->actionOverlayLabel = lv_label_create(this->actionOverlay);
       lv_obj_set_style_text_color(this->actionOverlayLabel, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
    }
    lv_label_set_text(this->actionOverlayLabel, text ? text : "Bitte warten");
    lv_obj_move_foreground(this->actionOverlay);
    lv_obj_clear_flag(this->actionOverlay, LV_OBJ_FLAG_HIDDEN);
}

void ResourceListScreen::hideActionProgress()
{
    if (this->actionOverlay)
    {
       lv_obj_add_flag(this->actionOverlay, LV_OBJ_FLAG_HIDDEN);
    }
}

void ResourceListScreen::setResourceDetailsCallback(std::function<void(const API::ResourceBrief &)> callback)
{
    this->resourceDetailsCallback = callback;
}

void ResourceListScreen::setResourceActionCallback(std::function<void(const API::ResourceBrief &)> callback)
{
    this->resourceActionCallback = callback;
}

void ResourceListScreen::setResourceActionAvailableCallback(std::function<bool(const API::ResourceBrief &)> callback)
{
    this->resourceActionAvailableCallback = callback;
}

void ResourceListScreen::setLogoutCallback(std::function<void()> callback)
{
    this->logoutCallback = callback;
}

void ResourceListScreen::onResourceClicked(lv_event_t *e)
{
   ResourceEventData *evt = static_cast<ResourceEventData *>(lv_event_get_user_data(e));
   if (!evt)
      return;
   lv_event_code_t code = lv_event_get_code(e);

   if (code == LV_EVENT_CLICKED)
   {
      if (!evt->self)
         return;

       if (evt->opensDetails && evt->self->resourceDetailsCallback)
       {
          evt->self->logger.infof("Opening resource details: %s", evt->resource.name);
          evt->self->resourceDetailsCallback(evt->resource);
       }
       else if (!evt->opensDetails && evt->self->resourceActionCallback)
       {
          evt->self->logger.infof("Starting or stopping resource: %s", evt->resource.name);
          evt->self->resourceActionCallback(evt->resource);
       }
   }
}

void ResourceListScreen::onContainerDelete(lv_event_t *e)
{
   ResourceEventData *evt = static_cast<ResourceEventData *>(lv_event_get_user_data(e));
   if (!evt)
      return;

   delete evt;
}

void ResourceListScreen::onLogoutClicked(lv_event_t *e)
{
   ResourceListScreen *self = static_cast<ResourceListScreen *>(lv_event_get_user_data(e));
   if (self && self->logoutCallback)
   {
      self->logoutCallback();
   }
}

std::string ResourceListScreen::getName()
{
   return "ResourceListScreen";
}

void ResourceListScreen::onScreenLeave()
{
}

void ResourceListScreen::destroy()
{
   if (!this->screen)
   {
      return;
   }
   lv_obj_del(this->screen);
   this->screen = nullptr;
   this->resourceContainer = nullptr;
}
