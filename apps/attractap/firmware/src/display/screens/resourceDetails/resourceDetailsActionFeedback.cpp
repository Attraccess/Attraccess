#include "display/i18n.hpp"
#include "resourceDetailsScreen.hpp"
#include <lvgl.h>
#include <time.h>
#include <stdio.h>

void ResourceDetailsScreen::showActionProgress(const FirmwareI18n::Text &title)
{
   this->actionInProgress = true;
   this->actionTitle = title.empty() ? FirmwareI18n::Text(FirmwareI18n::Message::PleaseWait) : title;
   actionOverlay.show(this->screen, this->actionTitle, FirmwareI18n::Text::literal(this->resourceCacheValid ? this->resourceCache.name : "") /* i18n-data: Server-supplied resource name in the action overlay; preserve exact contents. */);
}
void ResourceDetailsScreen::hideActionProgress()
{
   actionOverlay.hide();
   this->activeActionButton = nullptr;
   this->activeActionLabel = nullptr;
   this->activeActionSpinner = nullptr;
   this->actionInProgress = false;
}
void ResourceDetailsScreen::hideActionProgressVisual() { actionOverlay.hide(); }
bool ResourceDetailsScreen::showActionError(const FirmwareI18n::Text &text)
{
   if (!this->activeActionButton)
   {
      return false;
   }
   this->actionError.show(this->activeActionButton, text);
   return true;
}
