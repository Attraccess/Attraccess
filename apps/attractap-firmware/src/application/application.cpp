#include "application.hpp"
#include "../serial/serialCommandHandler.hpp"
#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#endif

void Application::networkTask(void *parameter)
{
    while (true)
    {
        Network::loop();
        vTaskDelay(100 / portTICK_PERIOD_MS);
    }
}

void Application::setup()
{
    // Confirm OTA image on first boot after update to avoid rollback
    const esp_partition_t *running = esp_ota_get_running_partition();
    esp_ota_img_states_t ota_state;
    if (esp_ota_get_state_partition(running, &ota_state) == ESP_OK)
    {
        if (ota_state == ESP_OTA_IMG_PENDING_VERIFY)
        {
            // Minimal diagnostic succeeded; mark image valid
            esp_ota_mark_app_valid_cancel_rollback();
        }
    }

    Settings::setup();
    SerialCommandHandler::setup();
    Network::setup();
    this->beeper.setup();

#ifdef HAS_LVGL_DISPLAY
    Display::setup();
#endif

    this->nfc.setup();
    this->api.setup();

#ifdef HAS_LVGL_DISPLAY
    this->api.onDeviceName([this](String deviceName)
                           { Display::setDeviceName(deviceName); });
#endif
    this->api.setResourceListUpdateCallback([this](const API::ResourceList &resourceList)
                                            {
#ifdef HAS_LVGL_DISPLAY
                                                struct ResourceListAsyncPayload
                                                {
                                                    Application *self;
                                                    API::ResourceList list;
                                                };

                                                this->handleResourceListUpdate(resourceList);
#else
                                                if (resourceList.count > 0)
                                                {
                                                    this->selectedResourceId = resourceList.items[0].id;
                                                    this->resourceIsDoor = resourceList.items[0].type == 1;
                                                }
#endif
                                            });

    this->api.setCardAuthenticationDetailsResponseCallback([this](API::CardAuthenticationDetailsResponse response)
                                                           {
                                                               if (response.error.length() > 0)
                                                               {
                                                                   this->logger.errorf("Authentication failed: %s", response.error.c_str());
                                                                   this->beeper.errorBeep();
                                                                   this->nfc.enableCardDetection();
                                                                   this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
                                                                   return;
                                                               }

                                                               if (response.keyLen != 16)
                                                               {
                                                                   this->logger.error("Invalid key bytes provided");
                                                                   this->beeper.errorBeep();
                                                                   this->nfc.enableCardDetection();
                                                                   this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
                                                                   return;
                                                               }

                                                               this->cardAuthenticationData = response;
#ifdef HAS_LVGL_DISPLAY
                                                           if (this->currentProjectsUser != response.username)
                                                           {
                                                               this->clearProjectSelection();
                                                           }
                                                           this->currentProjectsUser = response.username;
                                                           this->requestProjectsPage(1);
#endif

                                                               this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD; });

#ifdef HAS_LVGL_DISPLAY
    // Insufficient balance special-case (with SumUp capability flag)
    this->api.setInsufficientBalanceCallback([this](bool sumUpEnabled)
                                             {
                                                 this->beeper.errorBeep();
                                                 
                                                 struct Payload { Application *self; bool enabled; };
                                                 Payload *pl = new Payload{this, sumUpEnabled}; if (!pl) return;
                                                 lv_async_call([](void *u){
                                                     auto *p = (Payload*)u; if (!p || !p->self) { if (p) delete p; return; }
                                                     p->self->endActionPause();
                                                     Display::resourceDetailsScreen.hideActionProgress();
                                                     if (p->enabled) {
                                                         Display::showInsufficientBalancePopup(
                                                             [self = p->self](uint32_t amountCents){ self->api.requestBillingTopup(amountCents); },
                                                             [](){});
                                                     } else {
                                                         Display::showErrorPopup("Fehler", "INSUFFICIENT_BALANCE");
                                                     }
                                                     delete p;
                                                 }, pl); });
#endif

    // Generic error fallback for all other errors
    this->api.setErrorCallback([this](const char *title, const char *message)
                               {
                                   this->beeper.errorBeep();

#ifdef HAS_LVGL_DISPLAY
                                   if (this->state == APPLICATION_STATE_LOCKED)
#else
                                   if (this->state == APPLICATION_STATE_WAIT_FOR_CARD)
#endif
                                   {
                                       this->nfc.enableCardDetection();
                                   }

#ifdef HAS_LVGL_DISPLAY
                                   // Ensure UI operations on LVGL thread
                                   struct ErrPayload
                                   {
                                       Application *self;
                                       String t;
                                       String m;
                                   };
                                   ErrPayload *p = new ErrPayload();
                                   if (!p)
                                       return;
                                   p->self = this;
                                   p->t = String(title);
                                   p->m = String(message);
                                   lv_async_call([](void *u)
                                                 {
                                       auto *pl = (ErrPayload *)u;
                                       if (!pl || !pl->self) { if (pl) delete pl; return; }
                                       pl->self->endActionPause();
                                       Display::resourceDetailsScreen.hideActionProgress();
                                       Display::showErrorPopup(pl->t, pl->m);
                                       if (pl && pl->self)
                                       {
                                           pl->self->pendingActionType = PENDING_ACTION_NONE;
                                           pl->self->hasPendingFormRequest = false;
                                           Display::resourceDetailsScreen.hideFormsModal();
                                       }
                                       delete pl; }, p);
#endif
                               });

#ifdef HAS_LVGL_DISPLAY
    // Generic action result handling: stop overlay and show success toast
    this->api.setActionResultCallback([this](const char *type, bool success)
                                      {
                                          struct ActionResultPayload
                                          {
                                              Application *self;
                                              bool ok;
                                              String eventType;
                                          };
                                          ActionResultPayload *p = new ActionResultPayload();
                                          if (!p)
                                          {
                                              return;
                                          }
                                      p->self = this;
                                      p->ok = success;
                                      if (type)
                                      {
                                          p->eventType = String(type);
                                      }
                                      lv_async_call([](void *u)
                                                    {
                                                        ActionResultPayload *pl = static_cast<ActionResultPayload *>(u);
                                                        if (pl && pl->self)
                                                        {
                                                            pl->self->endActionPause();
                                                        }
                                                        Display::resourceDetailsScreen.hideActionProgress();
                                                        if (pl && pl->ok)
                                                        {
                                                            Display::resourceDetailsScreen.showSuccessToast("Erfolgreich");
                                                        }
                                                        if (pl && pl->self && pl->ok)
                                                        {
                                                            pl->self->onActionResult(pl->eventType);
                                                        }
                                                        if (pl)
                                                        {
                                                            delete pl;
                                                        } },
                                                    p); });
#endif

    this->api.setFirmwareUpdateMetaCallback([this](String availableVersion)
                                            { 
                                                this->externalState = EXTERNAL_STATE_FIRMWARE_UPDATE;
                                                this->availableFirmwareVersion = String(availableVersion); });

    this->api.setFirmwareUpdateProgressCallback([this](int percent)
                                                {
                                                    this->logger.debugf("Got firmware update pct %d", percent);
                                                    this->externalState = EXTERNAL_STATE_FIRMWARE_UPDATE;
                                                    this->firmwareUpdateProgressPct = percent; });

#ifdef HAS_LVGL_DISPLAY
    Display::resourceDetailsScreen.setButtonClickCallback([this](ResourceDetailsScreen::ButtonClickEventData evt)
                                                          { this->handleResourceDetailsButtonClick(evt); });

    Display::resourceDetailsScreen.setProjectsPageRequestCallback([this](uint32_t page)
                                                                  { this->requestProjectsPage(page); });
    Display::resourceDetailsScreen.setProjectSelectionCallback(
        [this](uint32_t projectId, const String &projectName)
        { this->handleProjectSelection(projectId, projectName); });
    Display::resourceDetailsScreen.setFormsSubmitCallback(
        [this](const API::FormSubmissionList &submissions)
        { this->handleFormsSubmit(submissions); });
    Display::resourceDetailsScreen.setFormsCancelCallback([this]()
                                                          { this->handleFormsCancel(); });

    Display::setPinScreen.setOnPinConfirmedCallback([this](String pin)
                                                    { Settings::setDevicePin(pin); });

    Display::connectionConfigurationScreen.setOnCancelPinLockCallback([this]()
                                                                      { 
    Display::transitionToScreen(&Display::initScreen);
    this->state = APPLICATION_STATE_BOOT;
    this->api.enableConnectionAttempts(); });

    Display::connectionConfigurationScreen.setOnSaveCallback([this](const ConnectionConfigurationScreen::ConnectionConfig &cfg)
                                                             { this->handleConnectionConfigurationSave(cfg); });

    Display::initScreen.setOnOpenSettingsCallback([this]()
                                                  {
    this->state = APPLICATION_STATE_CONFIGURATION_REQUIRED;
    this->api.disableConnectionAttempts();
    Display::connectionConfigurationScreen.enablePinLock();
    Display::transitionToScreen(&Display::connectionConfigurationScreen); });

    Display::resourceListScreen.setResourceSelectionCallback([this](const API::ResourceBrief &resource)
                                                             { this->selectResource(resource); });

    Display::setTouchCallback([this](int16_t x, int16_t y)
                              { this->handleTouch(x, y); });

    this->api.setEnrollNewCardGetAvailableKeyNoCallback([this](String username)
                                                        {
                                                            this->apiEnrollNewCardGetAvailableKeyNoData = {
                                                                username = username,
                                                            };
                                                            this->externalState = EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO; });

    this->api.setEnrollNewCardCallback([this](uint8_t keyNo, String key)
                                       {
                                           uint8_t keyBytes[16] = {0};
                                           stringToHexArray(key, keyBytes, 16);

                                           this->apiEnrollNewCardData = {
                                               .keyNo = keyNo,
                                               .keyBytes = {0},
                                           };
                                           memcpy(this->apiEnrollNewCardData.keyBytes, keyBytes, 16);

                                           this->externalState = EXTERNAL_STATE_ENROLL_NEW_CARD; });

    this->api.setProjectsOfUserResponseCallback([this](const API::ProjectsOfUserResponse &projectsOfUserResponse)
                                                {
                                                    this->projectsOfUserResponse = projectsOfUserResponse;
                                                    this->projectsCurrentPage = projectsOfUserResponse.page;
                                                    this->projectsTotalCount = projectsOfUserResponse.total;
                                                    this->projectsHasMore = projectsOfUserResponse.hasMore;
                                                    this->projectsOfUserResponseUpdated = true; });

    this->api.setResourceFormsRequestCallback([this](const API::ResourceUsageFormRequest &request)
                                              {
                                                  // DO NOT copy the large struct here - websocket task has limited stack/heap.
                                                  // Just set a flag; the LVGL async handler will do the copy on the main thread.
                                                  (void)request; // The data is in api.getFormRequestScratch()
                                                  this->pendingFormRequestReady = true;
                                                  // Schedule the copy + UI update on LVGL thread
                                                  lv_async_call([](void *u)
                                                                {
                                                                    auto *self = static_cast<Application *>(u);
                                                                    if (self && self->pendingFormRequestReady)
                                                                    {
                                                                        self->pendingFormRequestReady = false;
                                                                        // Copy from API's scratch buffer on the main thread (safe stack/heap)
                                                                        self->pendingFormRequest = self->api.getFormRequestScratch();
                                                                        self->handleFormsRequest(self->pendingFormRequest);
                                                                    } },
                                                                this); });
#endif

    auto cardDetectionCallback = [this](uint8_t *uid, uint8_t uidLength)
    {
        this->logger.infof("Card detected: %s", hexToString(uid, uidLength).c_str());

#ifndef HAS_LVGL_DISPLAY
        this->cardDetected = true;
        this->cardRemoved = false;
        this->cardPresentationWasLong = false;
        this->cardDetectionTimeMs = millis();
#endif

#ifdef HAS_LVGL_DISPLAY
        if (this->state == APPLICATION_STATE_LOCKED)
#else
        if (this->state == APPLICATION_STATE_WAIT_FOR_CARD)
#endif
        {
            this->api.requestCardAuthenticationData(
                uid,
                uidLength,
                this->selectedResourceId);
            return;
        }

#ifdef HAS_LVGL_DISPLAY
        if (this->state == APPLICATION_STATE_ENROLLMENT)
        {

            bool success = this->nfc.changeKey(
                this->apiEnrollNewCardData.keyNo,
                this->nfc.FACTORY_KEY,
                this->nfc.FACTORY_KEY,
                this->apiEnrollNewCardData.keyBytes);

            if (success)
            {
                this->beeper.successBeep();
                this->externalState = EXTERNAL_STATE_NONE;
            }
            else
            {
                this->beeper.errorBeep();
            }

            this->api.sendEnrollNewCard(success);

            this->externalState = EXTERNAL_STATE_NONE;
            return;
        }
#endif

        if (this->state == APPLICATION_STATE_AUTHENTICATE_CARD)
        {
            this->processCardAuthenticationData();
            return;
        }
    };
    this->nfc.setCardDetectionCallback(cardDetectionCallback);

#ifndef HAS_LVGL_DISPLAY
    this->nfc.setCardRemovalCallback([this](uint32_t presentationTimeMs)
                                     {
                                        this->logger.debugf("Card removed after %d ms", presentationTimeMs); 
                                        this->cardRemoved = true;

                                        // log inmportant vars (cardDetected, cardRemoved, cardPresentationTimeMs, state)
                                        this->logger.debugf("cardDetected: %d", this->cardDetected);
                                        this->logger.debugf("cardRemoved: %d", this->cardRemoved);
                                        this->logger.debugf("unlocked: %d", this->unlocked);
                                        this->logger.debugf("state: %d", this->state); });
#endif

    xTaskCreate(Application::networkTask, "NetworkTask", 4096, nullptr, tskIDLE_PRIORITY, nullptr);

#ifdef HAS_LVGL_DISPLAY
    this->bootTime = millis();
#endif
}

void Application::loop()
{
    SerialCommandHandler::loop();

#ifdef HAS_LVGL_DISPLAY
    Display::loop();
#endif

    nfc.loop();
    this->api.loop();

    this->processState();
}

void Application::processState()
{
    AttraccessApiConfig attraccessApiConfig = Settings::getAttraccessApiConfig();
    bool connectionIsConfigured = !attraccessApiConfig.hostname.isEmpty() && attraccessApiConfig.hostname != "" && attraccessApiConfig.port > 0;

    if (!connectionIsConfigured)
    {
        this->logger.debug("Connection is not configured, showing connection configuration screen");
        if (this->state != APPLICATION_STATE_CONFIGURATION_REQUIRED)
        {
            this->logger.debug("Connection is not configured, showing connection configuration screen");
            this->state = APPLICATION_STATE_CONFIGURATION_REQUIRED;

#ifdef HAS_LVGL_DISPLAY
            Display::connectionConfigurationScreen.disablePinLock();
            Display::transitionToScreen(&Display::connectionConfigurationScreen);
#endif
        }

        return;
    }

    if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED)
    {
        this->api.enableConnectionAttempts();
    }

#ifdef HAS_LVGL_DISPLAY
    if (!this->bootDone && millis() - this->bootTime > APPLICATION_BOOT_SCREEN_DURATION)
    {
        this->logger.debug("Boot screen duration reached, hiding boot screen");
        this->bootDone = true;
    }

    if (!this->bootDone)
    {
        return;
    }

    bool pinIsSet = Settings::getDeviceConfig().passCode != "0000";
    if (!pinIsSet)
    {
        if (this->state == APPLICATION_STATE_PIN_NOT_SET)
        {
            return;
        }

        this->logger.debug("PIN is not set, showing pin screen");
        this->state = APPLICATION_STATE_PIN_NOT_SET;

        Display::transitionToScreen(&Display::setPinScreen);
        return;
    }
#endif

    State::ApiState apiState = State::getApiState();
    State::NetworkState networkState = State::getNetworkState();
    State::WebsocketState websocketState = State::getWebsocketState();
    if (!apiState.authenticated || (!networkState.ethernet_connected && !networkState.wifi_connected) || !websocketState.connected)
    {
#ifdef HAS_LVGL_DISPLAY
        this->resetSessionOnDisconnect();
#endif
        if (this->state == APPLICATION_STATE_INIT)
        {
            return;
        }

        this->logger.debug("API state is not authenticated, network state is not connected, websocket state is not connected, showing init screen");
        this->state = APPLICATION_STATE_INIT;

#ifdef HAS_LVGL_DISPLAY
        Display::transitionToScreen(&Display::initScreen);
#endif
        return;
    }

#ifdef HAS_LVGL_DISPLAY
    if (this->externalState == EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO)
    {
        if (this->state == APPLICATION_STATE_ENROLLMENT)
        {
            uint32_t now = millis();
            if (now - this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs > 30000)
            {
                this->logger.error("Enroll new card get available key number timeout reached");
                this->externalState = EXTERNAL_STATE_NONE;
                return;
            }

            uint8_t uid[7] = {0};
            uint8_t uidLength = 0;
            uint8_t keyNo = 0;
            bool success = this->nfc.getAvailableKeyNo(uid, &uidLength, &keyNo);

            if (success)
            {
                this->api.sendEnrollNewCardAvailableKeyNo(uid, uidLength, keyNo);
                this->externalState = EXTERNAL_STATE_NONE;
            }
            return;
        }

        this->nfc.disableCardDetection();
#ifdef HAS_LVGL_DISPLAY
        Display::enrollmentScreen.setUserName(this->apiEnrollNewCardGetAvailableKeyNoData.username);
#endif
        this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs = millis();
#ifdef HAS_LVGL_DISPLAY
        Display::enrollmentScreen.setEnrollmentTimeoutTime(this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs + 30000);
        Display::transitionToScreen(&Display::enrollmentScreen);
#endif

        this->state = APPLICATION_STATE_ENROLLMENT;

        return;
    }

    if (this->externalState == EXTERNAL_STATE_ENROLL_NEW_CARD)
    {
        if (this->state == APPLICATION_STATE_ENROLLMENT)
        {
            return;
        }

        this->nfc.enableCardDetection();
        this->state = APPLICATION_STATE_ENROLLMENT;
        return;
    }
#endif

#ifndef HAS_LVGL_DISPLAY
    if (this->cardDetected && !this->cardRemoved)
    {
        unsigned long currentPresentationDurationMs = millis() - this->cardDetectionTimeMs;
        if (currentPresentationDurationMs > NFC_CARD_LONG_PRESENTATION_TIME_MS && !this->cardPresentationWasLong)
        {
            this->beeper.indicateBeep();
            this->cardPresentationWasLong = true;
        }
    }
#endif

    if (this->externalState == EXTERNAL_STATE_AUTHENTICATE_CARD)
    {
        if (this->state == APPLICATION_STATE_AUTHENTICATE_CARD)
        {
            return;
        }

#ifdef HAS_LVGL_DISPLAY
        Display::resourceDetailsScreen.setUserDetails(
            ResourceDetailsScreen::UserDetails{
                .username = this->cardAuthenticationData.username,
                .canManageResource = this->cardAuthenticationData.canManageResource,
                .hasIntroduction = this->cardAuthenticationData.hasIntroduction,
                .isIntroducer = this->cardAuthenticationData.isIntroducer});
#endif

        this->state = APPLICATION_STATE_AUTHENTICATE_CARD;

#ifndef HAS_LVGL_DISPLAY
        // For non-display mode, process authentication immediately since the card is still present
        // and won't trigger another detection event
        this->processCardAuthenticationData();
#else
        this->nfc.enableCardDetection();
#endif
        return;
    }

    if (this->externalState == EXTERNAL_STATE_FIRMWARE_UPDATE)
    {
        if (this->state == APPLICATION_STATE_FIRMWARE_UPDATE)
        {
            this->logger.debugf("Updating firmware update progress %d", this->firmwareUpdateProgressPct);
#ifdef HAS_LVGL_DISPLAY
            Display::firmwareUpdateScreen.setProgress(this->firmwareUpdateProgressPct);
            Display::firmwareUpdateScreen.setAvailableVersion(this->availableFirmwareVersion);
#endif
            return;
        }

#ifdef HAS_LVGL_DISPLAY
        Display::transitionToScreen(&Display::firmwareUpdateScreen);
#endif
        this->state = APPLICATION_STATE_FIRMWARE_UPDATE;
        return;
    }

#ifdef HAS_LVGL_DISPLAY
    if (this->resourceCount == 0)
    {
        if (this->state == APPLICATION_STATE_NO_RESOURCES)
        {
            return;
        }

        this->logger.debug("Resource count is 0, showing no resources screen");
        this->state = APPLICATION_STATE_NO_RESOURCES;

        Display::transitionToScreen(&Display::noResourcesScreen);
        return;
    }

    if (this->resourceCount == 1 && !this->resourceIsSelected)
    {
        this->logger.debug("Resource count is 1 and resource is not selected, selecting resource");
        this->selectResource(resourceList.items[0]);
        return;
    }

    if (this->resourceCount > 0 && !this->resourceIsSelected)
    {
        if (this->resourceListUpdated)
        {
// Update UI with the list
#ifdef HAS_LVGL_DISPLAY
            Display::resourceListScreen.setResourceList(this->resourceList);
#endif
            this->resourceListUpdated = false;
        }

        if (this->state == APPLICATION_STATE_RESOURCE_LIST)
        {
            return;
        }

        this->logger.debug("Resource count is greater than 0 and resource is not selected, showing resource list");
        this->state = APPLICATION_STATE_RESOURCE_LIST;
#ifdef HAS_LVGL_DISPLAY
        Display::transitionToScreen(&Display::resourceListScreen);
#endif
        return;
    }

    if (this->selectedResourceChanged)
    {
        for (uint16_t i = 0; i < this->resourceList.count; ++i)
        {
            if (this->resourceList.items[i].id == this->selectedResourceId)
            {
                API::ResourceBrief resource = this->resourceList.items[i];

                Display::lockscreen.setResourceName(resource.name);
                Display::lockscreen.setUsageInfo(resource.hasActiveUsage, resource.activeUser);

                // Directly pass the native struct to the screen so it can avoid String conversions
                Display::resourceDetailsScreen.setResourceAndUsageDetails(resource);

                break;
            }
        }
        this->selectedResourceChanged = false;
    }

    uint32_t now = millis();
    if (!this->unlocked)
    {
        if (this->state == APPLICATION_STATE_LOCKED)
        {

            if (now - this->timeOfResourceSelectionMs > this->RESOURCE_SELECTION_TIMEOUT_MS)
            {
                this->logger.debug("Resource selection timeout reached, showing resource list");
                this->resourceIsSelected = false;
            }
            return;
        }

        this->logger.debug("Card is not detected, showing lockscreen");
        this->state = APPLICATION_STATE_LOCKED;
#ifdef HAS_LVGL_DISPLAY
        Display::transitionToScreen(&Display::lockscreen, [this]()
                                    { 
                                        this->logger.debug("Lockscreen transition complete, enabling card detection");
                                        this->nfc.enableCardDetection(); });
#else
        this->nfc.enableCardDetection();
#endif
        return;
    }

    if (this->state == APPLICATION_STATE_UNLOCKED)
    {
        // Subtract any accumulated pause time while actions were in-progress
        uint32_t effectiveElapsed = now - this->timeOfUnlockedMs;
        if (effectiveElapsed > this->accumulatedPauseMs)
        {
            effectiveElapsed -= this->accumulatedPauseMs;
        }
        else
        {
            effectiveElapsed = 0;
        }
        if (effectiveElapsed > this->UNLOCKED_TIMEOUT_MS)
        {
            this->logger.debug("Unlocked timeout reached, locking");
            this->unlocked = false;
            this->resourceIsSelected = this->resourceCount == 1;
        }

        if (this->projectsOfUserResponseUpdated)
        {
#ifdef HAS_LVGL_DISPLAY
            Display::resourceDetailsScreen.setProjects(this->projectsOfUserResponse);
            Display::resourceDetailsScreen.setSelectedProject(this->selectedProjectId, this->selectedProjectName.c_str());
#endif
            this->projectsOfUserResponseUpdated = false;
        }

        return;
    }

    this->logger.debug("Resource is unlocked, showing resource details screen");
    this->state = APPLICATION_STATE_UNLOCKED;
    this->restartSessionTimeout();

    Display::transitionToScreen(&Display::resourceDetailsScreen);
#else

    // Process unlocked card actions for non-display mode
    if (this->state == APPLICATION_STATE_AUTHENTICATE_CARD)
    {
        if (!this->cardDetected)
        {
            return;
        }

        if (!this->unlocked)
        {
            return;
        }

        if (!this->cardRemoved)
        {
            return;
        }

        this->logger.debug("Card detected and removed and unlocked, processing");

        // Reset state flags before triggering action
        this->unlocked = false;
        this->cardDetected = false;
        this->cardRemoved = false;

        if (this->resourceIsDoor)
        {
            if (this->cardPresentationWasLong)
            {
                this->api.lockDoor(this->selectedResourceId);
            }
            else
            {
                this->api.unlockDoor(this->selectedResourceId);
            }
        }
        else
        {
            if (this->cardPresentationWasLong)
            {
                this->api.stopResourceUsageSession(this->selectedResourceId);
            }
            else
            {
                this->api.startResourceUsageSession(this->selectedResourceId);
            }
        }

        // Reset state back to waiting for card
        this->state = APPLICATION_STATE_WAIT_FOR_CARD;
        this->nfc.enableCardDetection();
        return;
    }

    if (this->state != APPLICATION_STATE_WAIT_FOR_CARD)
    {
        this->logger.debug("Waiting for card detection");
        this->state = APPLICATION_STATE_WAIT_FOR_CARD;
        this->nfc.enableCardDetection();
        return;
    }
#endif
}

#ifdef HAS_LVGL_DISPLAY
void Application::handleConnectionConfigurationSave(const ConnectionConfigurationScreen::ConnectionConfig &cfg)
{
    // split cfg.host into hostname and port (if no port present, use 443)
    String hostname = cfg.host;
    String port = "443";
    if (cfg.host.indexOf(":") != -1)
    {
        hostname = cfg.host.substring(0, cfg.host.indexOf(":"));
        port = cfg.host.substring(cfg.host.indexOf(":") + 1);
    }
    Settings::saveNetworkConfig(cfg.ssid, cfg.password);
    Settings::saveAttraccessApiConfig(hostname, port.toInt(), cfg.useSSL);

    Settings::setDevicePin(cfg.devicePin);
    Settings::setBeeperEnabled(cfg.beeperEnabled);
};

void Application::handleResourceListUpdate(const API::ResourceList &resourceList)
{
    this->logger.infof("Resource list updated: %d resources", resourceList.count);

    this->resourceList = resourceList;
    this->resourceCount = resourceList.count;
    this->resourceListUpdated = true;

    // If a resource is already selected, try to find it in the new list and refresh the details screen.
    if (this->resourceIsSelected)
    {
        this->logger.info("Resource is selected, trying to find it in the new list");
        for (uint16_t i = 0; i < this->resourceList.count; ++i)
        {
            const auto &obj = this->resourceList.items[i];
            if (obj.id == this->selectedResourceId)
            {
                this->logger.infof("Resource found in the new list, refreshing the details screen: %s", obj.name);
                this->selectResource(obj);
                break;
            }
        }
    }
}
#endif

void Application::processCardAuthenticationData()
{
    this->logger.infof("Trying to authenticate with keyNo: %u", this->cardAuthenticationData.keyNo);
    if (this->cardAuthenticationData.keyLen != 16)
    {
        this->logger.error("Invalid key bytes provided");
        this->beeper.errorBeep();
        this->nfc.enableCardDetection();
        this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
        return;
    }

    bool authenticated = this->nfc.authenticate(this->cardAuthenticationData.keyNo, this->cardAuthenticationData.keyBytes);

    if (!authenticated)
    {
        this->logger.error("Authentication failed");
        this->beeper.errorBeep();
        this->nfc.enableCardDetection();
        this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
        return;
    }

    this->beeper.successBeep();
    this->logger.info("Authentication successful");

    this->externalState = EXTERNAL_STATE_NONE;

    this->unlocked = true;

#ifndef HAS_LVGL_DISPLAY
    // Enable card detection to detect card removal in non-display mode
    this->nfc.enableCardDetection();
#endif
}

#ifdef HAS_LVGL_DISPLAY
void Application::selectResource(const API::ResourceBrief &resource)
{
    this->logger.infof("Resource selected: %s", resource.name);
    this->resourceIsSelected = true;
    this->selectedResourceId = resource.id;
    this->restartResourceSelectionTimeout();
    this->selectedResourceChanged = true;
}

void Application::requestProjectsPage(uint32_t page)
{
    if (page == 0)
    {
        page = 1;
    }
    this->api.requestProjectsOfUser(page);
}

void Application::clearProjectSelection()
{
    this->selectedProjectId = 0;
    this->selectedProjectName = "";
    this->projectsCurrentPage = 1;
    this->projectsTotalCount = 0;
    this->projectsHasMore = false;
    this->projectsOfUserResponse.count = 0;
    this->projectsOfUserResponse.page = 1;
    this->projectsOfUserResponse.total = 0;
    this->projectsOfUserResponse.limit = API::MAX_PROJECTS_PER_PAGE;
    this->projectsOfUserResponse.hasMore = false;
    this->projectsOfUserResponseUpdated = true;
    Display::resourceDetailsScreen.setSelectedProject(0, nullptr);
}

void Application::handleProjectSelection(uint32_t projectId, const String &projectName)
{
    this->selectedProjectId = projectId;
    this->selectedProjectName = projectName;
    Display::resourceDetailsScreen.setSelectedProject(projectId, projectName.c_str());
}

void Application::handleFormsRequest(const API::ResourceUsageFormRequest &request)
{
    // Note: 'request' is already a reference to this->pendingFormRequest from the callback,
    // so we don't need to copy it again. Just set the flag and show the modal.
    (void)request; // Suppress unused parameter warning; we use pendingFormRequest directly
    this->hasPendingFormRequest = true;
    Display::resourceDetailsScreen.hideActionProgress();
    // Pass the stored copy since showFormsModal stores a pointer
    Display::resourceDetailsScreen.showFormsModal(this->pendingFormRequest);
}

void Application::handleFormsSubmit(const API::FormSubmissionList &submissions)
{
    if (this->pendingActionType == PENDING_ACTION_NONE)
    {
        this->handleFormsCancel();
        return;
    }

    this->formSubmissionBuffer = submissions;
    this->hasPendingFormRequest = false;
    Display::resourceDetailsScreen.hideFormsModal();
    Display::resourceDetailsScreen.showActionProgress("Sende Formular");

    if (this->pendingActionType == PENDING_ACTION_START_SESSION)
    {
        this->api.startResourceUsageSession(this->pendingActionResourceId, this->pendingActionProjectId, &this->formSubmissionBuffer);
    }
    else if (this->pendingActionType == PENDING_ACTION_STOP_SESSION)
    {
        this->api.stopResourceUsageSession(this->pendingActionResourceId, &this->formSubmissionBuffer);
    }
}

void Application::handleFormsCancel()
{
    if (!this->hasPendingFormRequest)
    {
        return;
    }
    this->hasPendingFormRequest = false;
    this->pendingActionType = PENDING_ACTION_NONE;
    Display::resourceDetailsScreen.hideFormsModal();
    Display::resourceDetailsScreen.hideActionProgress();
    this->endActionPause();
}

void Application::onActionResult(const String &eventType)
{
    if (eventType == "START_RESOURCE_USAGE_SESSION" || eventType == "STOP_RESOURCE_USAGE_SESSION")
    {
        this->pendingActionType = PENDING_ACTION_NONE;
        this->hasPendingFormRequest = false;
        Display::resourceDetailsScreen.hideFormsModal();
    }
}

void Application::handleTouch(int16_t x, int16_t y)
{
    if (this->state == APPLICATION_STATE_UNLOCKED)
    {
        this->restartSessionTimeout();
    }
}

void Application::restartSessionTimeout()
{
    uint32_t now = millis();
    Display::resourceDetailsScreen.setSessionTimeoutTime(now + this->UNLOCKED_TIMEOUT_MS);
    this->timeOfUnlockedMs = now;
    this->resetPauseAccounting();
}

void Application::handleResourceDetailsButtonClick(ResourceDetailsScreen::ButtonClickEventData evt)
{
    this->logger.infof("Resource details button clicked: %d", evt.buttonClickType);

    if (this->state != APPLICATION_STATE_UNLOCKED)
    {
        return;
    }

    switch (evt.buttonClickType)
    {
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_START_SESSION:
        Display::resourceDetailsScreen.showActionProgress("Starte Sitzung");
        this->beginActionPause();
        this->pendingActionType = PENDING_ACTION_START_SESSION;
        this->pendingActionResourceId = this->selectedResourceId;
        this->pendingActionProjectId = this->selectedProjectId;
        this->hasPendingFormRequest = false;
        this->api.startResourceUsageSession(this->selectedResourceId, this->selectedProjectId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_STOP_SESSION:
        Display::resourceDetailsScreen.showActionProgress("Beende Sitzung");
        this->beginActionPause();
        this->pendingActionType = PENDING_ACTION_STOP_SESSION;
        this->pendingActionResourceId = this->selectedResourceId;
        this->pendingActionProjectId = 0;
        this->hasPendingFormRequest = false;
        this->api.stopResourceUsageSession(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_LOCK_DOOR:
        Display::resourceDetailsScreen.showActionProgress("Sperre Tuer");
        this->beginActionPause();
        this->api.lockDoor(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLOCK_DOOR:
        Display::resourceDetailsScreen.showActionProgress("Entsperre Tuer");
        this->beginActionPause();
        this->api.unlockDoor(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLATCH_DOOR:
        Display::resourceDetailsScreen.showActionProgress("Oeffne Tuer-Riegel");
        this->beginActionPause();
        this->api.unlatchDoor(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_FLOW_BUTTON:
        Display::resourceDetailsScreen.showActionProgress("Aktion Ausfuehren");
        this->beginActionPause();
        this->api.triggerFlowButton(this->selectedResourceId, evt.flowButtonId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_LOGOUT:
        if (this->resourceCount > 1)
        {
            this->resourceIsSelected = false;
        }
        this->unlocked = false;
        this->currentProjectsUser = "";
        this->clearProjectSelection();
        this->pendingActionType = PENDING_ACTION_NONE;
        this->hasPendingFormRequest = false;
        Display::resourceDetailsScreen.hideFormsModal();
        break;
    }
}

void Application::restartResourceSelectionTimeout()
{
    uint32_t now = millis();
    this->timeOfResourceSelectionMs = now;
}

void Application::beginActionPause()
{
    this->actionInProgressCount++;
    if (this->actionInProgressCount == 1)
    {
        this->pauseStartMs = millis();
        // Freeze the UI indicator
        Display::resourceDetailsScreen.setSessionTimeoutPaused(true);
    }
}

void Application::endActionPause()
{
    if (this->actionInProgressCount == 0)
    {
        return;
    }
    this->actionInProgressCount--;
    if (this->actionInProgressCount == 0)
    {
        uint32_t now = millis();
        uint32_t delta = (now >= this->pauseStartMs) ? (now - this->pauseStartMs) : 0;
        this->accumulatedPauseMs += delta;
        // Extend the UI deadline by the same delta and unfreeze
        Display::resourceDetailsScreen.extendSessionTimeoutBy(delta);
        Display::resourceDetailsScreen.setSessionTimeoutPaused(false);
    }
}

void Application::resetPauseAccounting()
{
    this->pauseStartMs = 0;
    this->accumulatedPauseMs = 0;
    this->actionInProgressCount = 0;
    // Ensure not paused visually
    Display::resourceDetailsScreen.setSessionTimeoutPaused(false);
}

void Application::resetSessionOnDisconnect()
{
    bool sessionActive = this->unlocked ||
                         this->resourceIsSelected ||
                         this->pendingActionType != PENDING_ACTION_NONE ||
                         this->hasPendingFormRequest ||
                         this->pendingFormRequestReady ||
                         this->currentProjectsUser.length() > 0;

    if (!sessionActive)
    {
        return;
    }

    this->logger.info("Connectivity lost; resetting session state");

    // Ensure any in-progress UI overlays are dismissed
    Display::resourceDetailsScreen.hideActionProgress();
    Display::resourceDetailsScreen.hideFormsModal();
    this->resetPauseAccounting();

    this->pendingActionType = PENDING_ACTION_NONE;
    this->pendingActionResourceId = 0;
    this->pendingActionProjectId = 0;
    this->hasPendingFormRequest = false;
    this->pendingFormRequestReady = false;

    this->clearProjectSelection();
    this->currentProjectsUser = "";

    this->selectedResourceId = 0;
    this->resourceIsSelected = false;
    this->selectedResourceChanged = false;

    this->unlocked = false;
    this->externalState = EXTERNAL_STATE_NONE;
    this->nfc.enableCardDetection();
}
#endif