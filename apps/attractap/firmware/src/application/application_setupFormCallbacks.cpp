// Composition root: wires API/NFC/display callbacks, spawns tasks, runs loop
// FEATURE: application

#include "application.hpp"
#include "../serial/serialCommandHandler.hpp"
#include "platform.hpp"
#include <cstring>
#include <string>
#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#include "esp_task_wdt.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif


void Application::setupFormCallbacks()
{
#ifdef HAS_LVGL_DISPLAY
  this->api.setResourceFormsRequestCallback(
      [this](const API::ResourceUsageFormRequest &request) {
        // DO NOT copy the large struct here - websocket task has limited
        // stack/heap. Queue only its identity; LVGL validates it against the
        // pending action before copying the complete request metadata.
        struct Payload {
          Application *self;
          uint32_t resourceId;
          uint32_t requestId;
          API::ResourceUsageFormActionType action;
        };
        Payload *payload = new Payload{this, request.resourceId, request.requestId, request.action};
        if (!payload) {
          return;
        }
        Display::asyncCall(
            [](void *u) {
              auto *payload = static_cast<Payload *>(u);
              if (payload && payload->self) {
                // The scratch buffer can hold a newer request by the time this
                // runs, so only process the request represented by this payload.
                const auto &request = payload->self->api.getFormRequestScratch();
                if (request.resourceId == payload->resourceId && request.requestId == payload->requestId &&
                    request.action == payload->action && payload->self->api.isCurrentResourceAction(request.requestId)) {
                  payload->self->handleFormsRequest(request);
                }
              }
              delete payload;
            },
            payload);
      });

  this->api.setResourceFormFieldsCallback(
      [this](const API::ResourceUsageFormFieldsPage &page) {
        (void)page; // The data is in api.getFormFieldsScratch()
        this->pendingFormFieldsReady = true;
        Display::asyncCall(
            [](void *u) {
              auto *self = static_cast<Application *>(u);
              if (self && self->pendingFormFieldsReady) {
                self->pendingFormFieldsReady = false;
                self->pendingFormFields = self->api.getFormFieldsScratch();
                self->handleFormFields(self->pendingFormFields);
              }
            },
            this);
      });

  this->api.setResourceFormPageResultCallback(
      [this](const API::ResourceUsageFormPageResult &result) {
        (void)result; // The data is in api.getFormPageResultScratch()
        this->pendingFormPageResultReady = true;
        Display::asyncCall(
            [](void *u) {
              auto *self = static_cast<Application *>(u);
              if (self && self->pendingFormPageResultReady) {
                self->pendingFormPageResultReady = false;
                self->pendingFormPageResult = self->api.getFormPageResultScratch();
                self->handleFormPageResult(self->pendingFormPageResult);
              }
            },
            this);
      });
#endif
}
