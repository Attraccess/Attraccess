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

                                                ResourceListAsyncPayload *payload = (ResourceListAsyncPayload *)malloc(sizeof(ResourceListAsyncPayload));
                                                if (!payload)
                                                {
                                                    this->logger.error("Failed to allocate async payload for resource list");
                                                    return;
                                                }
                                                payload->self = this;
                                                payload->list = resourceList; // deep copy of fixed-size struct

                                                lv_async_call(
                                                    [](void *p)
                                                    {
                                                        ResourceListAsyncPayload *pl = (ResourceListAsyncPayload *)p;
                                                        if (pl && pl->self)
                                                        {
                                                            pl->self->handleResourceListUpdate(pl->list);
                                                        }
                                                        free(pl);
                                                    },
                                                    payload); });

    this->api.setCardAuthenticationDetailsResponseCallback([this](API::CardAuthenticationDetailsResponse response)
                                                           {
                                                               struct CardDetailsAsyncPayload
                                                               {
                                                                   Application *self;
                                                                   API::CardAuthenticationDetailsResponse resp;
                                                                   uint8_t keyBytesCopy[16];
                                                               };

                                                               CardDetailsAsyncPayload *payload = (CardDetailsAsyncPayload *)malloc(sizeof(CardDetailsAsyncPayload));
                                                               if (!payload)
                                                               {
                                                                   this->logger.error("Failed to allocate async payload for card auth details");
                                                                   return;
                                                               }
                                                               payload->self = this;
                                                               payload->resp = response; // copy POD fields and pointers (we'll fix keyBytes next)
                                                               // Ensure key material remains valid after scheduling
                                                               memset(payload->keyBytesCopy, 0, sizeof(payload->keyBytesCopy));
                                                               if (response.keyBytes && response.keyLen == 16)
                                                               {
                                                                   memcpy(payload->keyBytesCopy, response.keyBytes, 16);
                                                                   payload->resp.keyBytes = payload->keyBytesCopy;
                                                               }
                                                               else
                                                               {
                                                                   payload->resp.keyBytes = nullptr;
                                                                   payload->resp.keyLen = 0;
                                                               }

                                                               lv_async_call(
                                                                   [](void *p)
                                                                   {
                                                                       CardDetailsAsyncPayload *pl = (CardDetailsAsyncPayload *)p;
                                                                       if (pl && pl->self)
                                                                       {
                                                                           pl->self->logger.debugf("Card authentication details: Username: %s", pl->resp.username.c_str());
                                                                           Display::resourceDetailsScreen.setUserDetails(
                                                                               ResourceDetailsScreen::UserDetails{
                                                                                   .username = pl->resp.username,
                                                                                   .canManageResource = pl->resp.canManageResource,
                                                                                   .hasIntroduction = pl->resp.hasIntroduction,
                                                                                   .isIntroducer = pl->resp.isIntroducer});
                                                                           pl->self->handleCardAuthenticationDetails(pl->resp);
                                                                       }
                                                                       free(pl);
                                                                   },
                                                                   payload); });

    Display::resourceDetailsScreen.setButtonClickCallback([this](ResourceDetailsScreen::ButtonClickEventData evt)
                                                          { this->handleResourceDetailsButtonClick(evt); });

    this->api.setEnrollNewCardGetAvailableKeyNoCallback([this](String username, uint8_t *uid, uint8_t *uidLength, uint8_t *keyNo)
                                                        {
                                                            struct EnrollmentUiAsyncPayload
                                                            {
                                                                String username;
                                                            };
                                                            EnrollmentUiAsyncPayload *payload = (EnrollmentUiAsyncPayload *)malloc(sizeof(EnrollmentUiAsyncPayload));
                                                            if (payload)
                                                            {
                                                                payload->username = username;
                                                                lv_async_call(
                                                                    [](void *p)
                                                                    {
                                                                        EnrollmentUiAsyncPayload *pl = (EnrollmentUiAsyncPayload *)p;
                                                                        if (pl)
                                                                        {
                                                                            Display::enrollmentScreen.setUserName(pl->username);
                                                                            Display::enrollmentScreen.setEnrollmentTimeoutTime(millis() + 30000);
                                                                            Display::transitionToScreen(&Display::enrollmentScreen);
                                                                        }
                                                                        free(pl);
                                                                    },
                                                                    payload);
                                                            }
                                                            this->state = APPLICATION_STATE_ENROLLMENT;
                                                            return this->nfc.getAvailableKeyNo(uid, uidLength, keyNo); });

    this->api.setEnrollNewCardCallback([this](uint8_t keyNo, String key)
                                       {
                                           uint8_t keyBytes[16] = {0};
                                           stringToHexArray(key, keyBytes, 16);
                                           bool success = this->nfc.changeKey(keyNo, this->nfc.FACTORY_KEY, this->nfc.FACTORY_KEY, keyBytes);
                                           if (success)
                                           {
                                               this->ioExpander.successBeep();
                                               // Schedule screen transition on LVGL thread
                                               lv_async_call(
                                                   [](void *p)
                                                   {
                                                       (void)p;
                                                       Display::transitionToScreen(&Display::resourceListScreen);
                                                   },
                                                   nullptr);
                                           }
                                           else
                                           {
                                               this->ioExpander.errorBeep();
                                           }

                                           // TODO: why is a nfc card entry created before this succeeds?

                                           this->state = APPLICATION_STATE_RESOURCE_LIST;
                                           return success; });

    Display::setPinScreen.setOnPinConfirmedCallback([this](String pin)
                                                    { Settings::saveDeviceConfig(pin); });

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

    auto cardDetectionCallback = [this](uint8_t *uid, uint8_t uidLength)
    {
        this->logger.infof("Card detected: %s", hexToString(uid, uidLength).c_str());

        this->api.requestCardAuthenticationData(uid, uidLength, this->selectedResourceId);
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
        if (this->state == APPLICATION_STATE_RESOURCE_LIST)
        {
            return;
        }

        this->logger.debug("Resource count is greater than 0 and resource is not selected, showing resource list");
        this->state = APPLICATION_STATE_RESOURCE_LIST;
        Display::transitionToScreen(&Display::resourceListScreen);
        return;
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
        if (now - this->timeOfUnlockedMs > this->UNLOCKED_TIMEOUT_MS)
        {
            this->logger.debug("Unlocked timeout reached, locking");
            this->unlocked = false;
            this->resourceIsSelected = this->resourceCount == 1;
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
    if (cfg.devicePin.length() > 0)
    {
        Settings::saveDeviceConfig(cfg.devicePin);
    }
};

void Application::handleResourceListUpdate(const API::ResourceList &resourceList)
{
    this->logger.infof("Resource list updated: %d resources", resourceList.count);
#ifdef ESP_PLATFORM
    size_t free_internal = heap_caps_get_free_size(MALLOC_CAP_INTERNAL);
    size_t free_dma = heap_caps_get_free_size(MALLOC_CAP_DMA);
    this->logger.debugf("Heap free (INT/DMA): %u / %u", (unsigned)free_internal, (unsigned)free_dma);
#endif
    this->resourceList = resourceList;
    this->resourceCount = resourceList.count;

    // Update UI with the list
    Display::resourceListScreen.setResourceList(this->resourceList);

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

void Application::handleCardAuthenticationDetails(API::CardAuthenticationDetailsResponse response)
{
    this->logger.infof("Card authentication details: KeyNo: %u", response.keyNo);

    if (this->state != APPLICATION_STATE_LOCKED)
    {
        this->logger.error("Card authentication details received in state other than APPLICATION_STATE_LOCKED");
        this->ioExpander.errorBeep();
        return;
    }

    if (response.error.length() > 0)
    {
        // TODO: indicate to user that authentication failed
        this->logger.errorf("Authentication failed: %s", response.error.c_str());
        this->ioExpander.errorBeep();
        this->nfc.enableCardDetection();
        return;
    }

    if (response.keyBytes == nullptr || response.keyLen != 16)
    {
        this->logger.error("Invalid key bytes provided");
        this->ioExpander.errorBeep();
        this->nfc.enableCardDetection();
        return;
    }

    this->logger.infof("Trying to authenticate with keyNo: %u", response.keyNo);
    bool authenticated = this->nfc.authenticate(response.keyNo, const_cast<uint8_t *>(response.keyBytes));

    if (!authenticated)
    {
        this->logger.error("Authentication failed");
        this->ioExpander.errorBeep();
        this->nfc.enableCardDetection();
        return;
    }

    this->ioExpander.successBeep();
    this->logger.info("Authentication successful");
    this->unlocked = true;
}

void Application::selectResource(const API::ResourceBrief &resource)
{
    this->logger.infof("Resource selected: %s", resource.name);
    this->resourceIsSelected = true;
    this->selectedResourceId = resource.id;
    this->restartResourceSelectionTimeout();

    // Directly pass the native struct to the screen so it can avoid String conversions
    Display::resourceDetailsScreen.setResourceAndUsageDetails(resource);
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
        this->api.startResourceUsageSession(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_STOP_SESSION:
        this->api.stopResourceUsageSession(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_LOCK_DOOR:
        this->api.lockDoor(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLOCK_DOOR:
        this->api.unlockDoor(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_UNLATCH_DOOR:
        this->api.unlatchDoor(this->selectedResourceId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_FLOW_BUTTON:
        this->api.triggerFlowButton(this->selectedResourceId, evt.flowButtonId);
        break;
    case ResourceDetailsScreen::BUTTON_CLICK_TYPE_LOGOUT:
        if (this->resourceCount > 1)
        {
            this->resourceIsSelected = false;
        }
        this->unlocked = false;
        break;
    }
}

void Application::restartResourceSelectionTimeout()
{
    uint32_t now = millis();
    this->timeOfResourceSelectionMs = now;
}