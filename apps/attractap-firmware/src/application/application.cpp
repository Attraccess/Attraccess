#include "application.hpp"
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
    Network::setup();
    this->ioExpander.setup();
    Display::setup();
    this->nfc.setup();
    this->api.setup();

    this->api.onDeviceName([this](String deviceName)
                           { Display::setDeviceName(deviceName); });

    this->api.setResourceListUpdateCallback([this](const API::ResourceList &resourceList)
                                            {
                                                struct ResourceListAsyncPayload
                                                {
                                                    Application *self;
                                                    API::ResourceList list;
                                                };

                                                this->handleResourceListUpdate(resourceList); });

    this->api.setCardAuthenticationDetailsResponseCallback([this](API::CardAuthenticationDetailsResponse response)
                                                           {
                                                               if (response.error.length() > 0)
                                                               {
                                                                   this->logger.errorf("Authentication failed: %s", response.error.c_str());
                                                                   this->ioExpander.errorBeep();
                                                                   this->nfc.enableCardDetection();
                                                                   this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
                                                                   return;
                                                               }

                                                               if (response.keyLen != 16)
                                                               {
                                                                   this->logger.error("Invalid key bytes provided");
                                                                   this->ioExpander.errorBeep();
                                                                   this->nfc.enableCardDetection();
                                                                   this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
                                                                   return;
                                                               }

                                                               this->cardAuthenticationData = response;
                                                           if (this->currentProjectsUser != response.username)
                                                           {
                                                               this->clearProjectSelection();
                                                           }
                                                           this->currentProjectsUser = response.username;
                                                           this->requestProjectsPage(1);

                                                               this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD; });

    // Insufficient balance special-case (with SumUp capability flag)
    this->api.setInsufficientBalanceCallback([this](bool sumUpEnabled)
                                             {
                                                 this->ioExpander.errorBeep();
                                                 
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

    // Generic error fallback for all other errors
    this->api.setErrorCallback([this](const char *title, const char *message)
                               {
                                   this->ioExpander.errorBeep();

                                   if (this->state == APPLICATION_STATE_LOCKED) {
                                       this->nfc.enableCardDetection();
                                   }

                                   // Ensure UI operations on LVGL thread
                                   struct ErrPayload { Application *self; String t; String m; };
                                   ErrPayload *p = new ErrPayload();
                                   if (!p) return;
                                   p->self = this; p->t = String(title); p->m = String(message);
                                   lv_async_call([](void *u){
                                       auto *pl = (ErrPayload *)u;
                                       if (!pl || !pl->self) { if (pl) delete pl; return; }
                                       pl->self->endActionPause();
                                       Display::resourceDetailsScreen.hideActionProgress();
                                       Display::showErrorPopup(pl->t, pl->m);
                                       delete pl;
                                   }, p); });

    // Generic action result handling: stop overlay and show success toast
    this->api.setActionResultCallback([this](const char *type, bool success)
                                      {
                                          (void)type;
                                          struct ActionResultPayload { Application *self; bool ok; };
                                          ActionResultPayload *p = new ActionResultPayload();
                                          if (!p) return;
                                          p->self = this; p->ok = success;
                                          lv_async_call([](void *u){
                                              ActionResultPayload *pl = (ActionResultPayload*)u;
                                              if (pl && pl->self) {
                                                  pl->self->endActionPause();
                                              }
                                              Display::resourceDetailsScreen.hideActionProgress();
                                              if (pl && pl->ok)
                                              {
                                                  Display::resourceDetailsScreen.showSuccessToast("Erfolgreich");
                                              }
                                              if (pl) delete pl;
                                          }, p); });

    this->api.setFirmwareUpdateMetaCallback([this](String availableVersion)
                                            { 
                                                this->externalState = EXTERNAL_STATE_FIRMWARE_UPDATE;
                                                this->availableFirmwareVersion = String(availableVersion); });

    this->api.setFirmwareUpdateProgressCallback([this](int percent)
                                                {
                                                    this->logger.debugf("Got firmware update pct %d", percent);
                                                    this->externalState = EXTERNAL_STATE_FIRMWARE_UPDATE;
                                                    this->firmwareUpdateProgressPct = percent; });

    Display::resourceDetailsScreen.setButtonClickCallback([this](ResourceDetailsScreen::ButtonClickEventData evt)
                                                          { this->handleResourceDetailsButtonClick(evt); });
    Display::resourceDetailsScreen.setProjectsPageRequestCallback([this](uint32_t page)
                                                                  { this->requestProjectsPage(page); });
    Display::resourceDetailsScreen.setProjectSelectionCallback(
        [this](uint32_t projectId, const String &projectName)
        { this->handleProjectSelection(projectId, projectName); });

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

    Display::setPinScreen.setOnPinConfirmedCallback([this](String pin)
                                                    { Settings::setDevicePin(pin); });

    Display::connectionConfigurationScreen.setOnCancelPinLockCallback([this]()
                                                                      { 
                                           Display::transitionToScreen(&Display::initScreen);
                                           this->state = APPLICATION_STATE_BOOT;
                                           this->api.enableConnectionAttempts(); });

    Display::connectionConfigurationScreen.setOnSaveCallback([this](const ConnectionConfigurationScreen::ConnectionConfig &cfg)
                                                             { this->handleConnectionConfigurationSave(cfg);
                                                       this->state = APPLICATION_STATE_BOOT;
                                                       this->api.enableConnectionAttempts(); });

    Display::initScreen.setOnOpenSettingsCallback([this]()
                                                  {
                                           this->state = APPLICATION_STATE_CONFIGURATION_REQUIRED;
                                           this->api.disableConnectionAttempts();
                                           Display::connectionConfigurationScreen.enablePinLock();
                                           Display::transitionToScreen(&Display::connectionConfigurationScreen); });

    Display::resourceListScreen.setResourceSelectionCallback([this](const API::ResourceBrief &resource)
                                                             { this->selectResource(resource); });

    this->api.setProjectsOfUserResponseCallback([this](const API::ProjectsOfUserResponse &projectsOfUserResponse)
                                                {
                                                    this->projectsOfUserResponse = projectsOfUserResponse;
                                                    this->projectsCurrentPage = projectsOfUserResponse.page;
                                                    this->projectsTotalCount = projectsOfUserResponse.total;
                                                    this->projectsHasMore = projectsOfUserResponse.hasMore;
                                                    this->projectsOfUserResponseUpdated = true; });

    auto cardDetectionCallback = [this](uint8_t *uid, uint8_t uidLength)
    {
        this->logger.infof("Card detected: %s", hexToString(uid, uidLength).c_str());

        if (this->state == APPLICATION_STATE_LOCKED)
        {
            this->api.requestCardAuthenticationData(uid, uidLength, this->selectedResourceId);
            return;
        }

        if (this->state == APPLICATION_STATE_ENROLLMENT)
        {

            bool success = this->nfc.changeKey(
                this->apiEnrollNewCardData.keyNo,
                this->nfc.FACTORY_KEY,
                this->nfc.FACTORY_KEY,
                this->apiEnrollNewCardData.keyBytes);

            if (success)
            {
                this->ioExpander.successBeep();
                this->externalState = EXTERNAL_STATE_NONE;
            }
            else
            {
                this->ioExpander.errorBeep();
            }

            this->api.sendEnrollNewCard(success);

            this->externalState = EXTERNAL_STATE_NONE;
            return;
        }

        if (this->state == APPLICATION_STATE_AUTHENTICATE_CARD)
        {
            this->processCardAuthenticationData();
            return;
        }
    };
    this->nfc.setCardDetectionCallback(cardDetectionCallback);

    xTaskCreate(Application::networkTask, "NetworkTask", 4096, nullptr, tskIDLE_PRIORITY, nullptr);

    Display::setTouchCallback([this](int16_t x, int16_t y)
                              { this->handleTouch(x, y); });

    this->bootTime = millis();
}

void Application::loop()
{
    Display::loop();
    nfc.loop();
    this->api.loop();

    this->processState();
}

void Application::processState()
{
    if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED)
    {
        return;
    }

    if (this->state == APPLICATION_STATE_FIRMWARE_UPDATE)
    {
        return;
    }

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

    NetworkConfig networkConfig = Settings::getNetworkConfig();
    AttraccessApiConfig attraccessApiConfig = Settings::getAttraccessApiConfig();
    bool connectionIsConfigured = !networkConfig.ssid.isEmpty() && networkConfig.ssid != "" && !attraccessApiConfig.hostname.isEmpty() && attraccessApiConfig.hostname != "" && attraccessApiConfig.port > 0;

    if (!connectionIsConfigured)
    {
        if (this->state == APPLICATION_STATE_CONFIGURATION_REQUIRED)
        {
            return;
        }

        this->logger.debug("Connection is not configured, showing connection configuration screen");
        this->state = APPLICATION_STATE_CONFIGURATION_REQUIRED;
        Display::connectionConfigurationScreen.disablePinLock();
        Display::transitionToScreen(&Display::connectionConfigurationScreen);
        return;
    }

    State::ApiState apiState = State::getApiState();
    State::NetworkState networkState = State::getNetworkState();
    State::WebsocketState websocketState = State::getWebsocketState();
    if (!apiState.authenticated || (!networkState.ethernet_connected && !networkState.wifi_connected) || !websocketState.connected)
    {
        if (this->state == APPLICATION_STATE_INIT)
        {
            return;
        }

        this->logger.debug("API state is not authenticated, network state is not connected, websocket state is not connected, showing init screen");
        this->state = APPLICATION_STATE_INIT;

        Display::transitionToScreen(&Display::initScreen);
        return;
    }

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
        Display::enrollmentScreen.setUserName(this->apiEnrollNewCardGetAvailableKeyNoData.username);
        this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs = millis();
        Display::enrollmentScreen.setEnrollmentTimeoutTime(this->apiEnrollNewCardGetAvailableKeyNoStartTimeMs + 30000);
        Display::transitionToScreen(&Display::enrollmentScreen);

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

    if (this->externalState == EXTERNAL_STATE_AUTHENTICATE_CARD)
    {
        if (this->state == APPLICATION_STATE_AUTHENTICATE_CARD)
        {
            return;
        }

        Display::resourceDetailsScreen.setUserDetails(
            ResourceDetailsScreen::UserDetails{
                .username = this->cardAuthenticationData.username,
                .canManageResource = this->cardAuthenticationData.canManageResource,
                .hasIntroduction = this->cardAuthenticationData.hasIntroduction,
                .isIntroducer = this->cardAuthenticationData.isIntroducer});

        this->state = APPLICATION_STATE_AUTHENTICATE_CARD;
        this->nfc.enableCardDetection();
        return;
    }

    if (this->externalState == EXTERNAL_STATE_FIRMWARE_UPDATE)
    {
        if (this->state == APPLICATION_STATE_FIRMWARE_UPDATE)
        {
            this->logger.debugf("Updating firmware update progress %d", this->firmwareUpdateProgressPct);
            Display::firmwareUpdateScreen.setProgress(this->firmwareUpdateProgressPct);
            Display::firmwareUpdateScreen.setAvailableVersion(this->availableFirmwareVersion);
            return;
        }

        Display::transitionToScreen(&Display::firmwareUpdateScreen);
        this->state = APPLICATION_STATE_FIRMWARE_UPDATE;
        return;
    }

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
            Display::resourceListScreen.setResourceList(this->resourceList);
            this->resourceListUpdated = false;
        }

        if (this->state == APPLICATION_STATE_RESOURCE_LIST)
        {
            return;
        }

        this->logger.debug("Resource count is greater than 0 and resource is not selected, showing resource list");
        this->state = APPLICATION_STATE_RESOURCE_LIST;
        Display::transitionToScreen(&Display::resourceListScreen);
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
        Display::transitionToScreen(&Display::lockscreen, [this]()
                                    { 
                                        this->logger.debug("Lockscreen transition complete, enabling card detection");
                                        this->nfc.enableCardDetection(); });
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
            Display::resourceDetailsScreen.setProjects(this->projectsOfUserResponse);
            Display::resourceDetailsScreen.setSelectedProject(this->selectedProjectId, this->selectedProjectName.c_str());
            this->projectsOfUserResponseUpdated = false;
        }

        return;
    }

    this->logger.debug("Resource is unlocked, showing resource details screen");
    this->state = APPLICATION_STATE_UNLOCKED;
    this->restartSessionTimeout();
    Display::transitionToScreen(&Display::resourceDetailsScreen);
}

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

void Application::processCardAuthenticationData()
{
    this->logger.infof("Trying to authenticate with keyNo: %u", this->cardAuthenticationData.keyNo);
    if (this->cardAuthenticationData.keyLen != 16)
    {
        this->logger.error("Invalid key bytes provided");
        this->ioExpander.errorBeep();
        this->nfc.enableCardDetection();
        this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
        return;
    }

    bool authenticated = this->nfc.authenticate(this->cardAuthenticationData.keyNo, this->cardAuthenticationData.keyBytes);

    if (!authenticated)
    {
        this->logger.error("Authentication failed");
        this->ioExpander.errorBeep();
        this->nfc.enableCardDetection();
        this->externalState = EXTERNAL_STATE_AUTHENTICATE_CARD;
        return;
    }

    this->ioExpander.successBeep();
    this->logger.info("Authentication successful");

    this->externalState = EXTERNAL_STATE_NONE;
    this->unlocked = true;
}

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
        this->api.startResourceUsageSession(this->selectedResourceId, this->selectedProjectId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_STOP_SESSION:
        Display::resourceDetailsScreen.showActionProgress("Beende Sitzung");
        this->beginActionPause();
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