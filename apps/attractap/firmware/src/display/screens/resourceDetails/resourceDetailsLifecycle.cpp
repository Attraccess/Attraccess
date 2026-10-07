#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <string.h>
#include "resourceDetailsCopy.hpp"

void ResourceDetailsScreen::destroy()
{
   this->disposeProjectsModal();
   this->disposeFormsModal();
   this->disposeSuccessToast();

   if (this->screen)
   {
      lv_obj_del(this->screen);
   }

   this->screen = nullptr;
   sessionHeader.detach();
   actionOverlay.detach();
   this->sessionDetailsContainer = nullptr;
   this->resourceName = nullptr;
   this->resourceDescription = nullptr;
   this->sessionStartTimeLabel = nullptr;
   this->currentUser = nullptr;
   this->sessionControls = nullptr;
   this->projectSelectionRow = nullptr;
   this->projectsButton = nullptr;
   this->projectsButtonLabel = nullptr;
   this->clearProjectButton = nullptr;
   this->projectsModalPanel = nullptr;
   this->projectsListContainer = nullptr;
   this->projectsPaginationLabel = nullptr;
   this->projectsPrevButton = nullptr;
   this->projectsNextButton = nullptr;
   this->startSessionButton = nullptr;
   this->startSessionButtonLabel = nullptr;
   this->stopSessionButton = nullptr;
   this->stopSessionButtonLabel = nullptr;
   this->stopOtherUserNote = nullptr;
   this->doorControls = nullptr;
   this->flowButtonsContainer = nullptr;
   this->formsModalPanel = nullptr;
   this->formsModalContent = nullptr;
   this->formsModalList = nullptr;
   this->formsModalErrorLabel = nullptr;
   this->formsModalProgressLabel = nullptr;
   this->formsEditorOverlay = nullptr;
   this->formsEditorTitleLabel = nullptr;
   this->formsEditorTextarea = nullptr;
   this->formsEditorSpacer = nullptr;
   this->formsEditorKeyboard = nullptr;
   this->formsBackButton = nullptr;
   this->formsNextButton = nullptr;
   this->formsNextLabel = nullptr;
   this->formsNextSpinner = nullptr;
   this->elapsedTime = nullptr;
   this->usageStatsContainer = nullptr;
   this->energyValue = nullptr;
   this->operatingValue = nullptr;

   this->noIntroductionPanel = nullptr;
   this->introducersListLabel = nullptr;
   this->maintenancePanel = nullptr;
   this->maintenanceIntroducersLabel = nullptr;
   this->healthPanel = nullptr;
   this->healthReasonLabel = nullptr;
   this->activeActionButton = nullptr;
   this->activeActionLabel = nullptr;
   this->activeActionSpinner = nullptr;
   this->successToast = nullptr;
   this->formsModalMeta = nullptr;
   this->formsModalPage = nullptr;
   this->formFieldWidgetCount = 0;
}
void ResourceDetailsScreen::applyCachedState()
{
   if (!this->screen)
   {
      return;
   }

   sessionHeader.setUser(this->loginUsernameCache);

   if (this->resourceCacheValid)
   {
      this->setResourceAndUsageDetails(this->resourceCache);
   }

   if (this->userDetailsInitialized)
   {
      this->setUserDetails(this->userDetailsCache);
   }

   this->refreshProjectsButtonLabel();
   this->updateClearProjectButtonState();
   this->updateSessionTimeoutIndicator();
   this->updateElapsedTimeDisplay();
}
