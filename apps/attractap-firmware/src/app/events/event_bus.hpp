#pragma once

#include "../../api/api.hpp"
#include "../../logger/logger.hpp"
#ifdef ESP_PLATFORM
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#endif
#include <functional>

namespace app {
namespace events {

struct ResourceListUpdatedEvent {
  API::ResourceList resourceList;
};

struct CardAuthDetailsEvent {
  API::CardAuthenticationDetailsResponse response;
};

struct EnrollGetAvailableKeyNoEvent {
  String username;
};

struct EnrollNewCardEvent {
  uint8_t keyNo;
  String key;
};

struct ProjectsResponseEvent {
  API::ProjectsOfUserResponse response;
};

struct ResourceFormsRequestEvent {
  API::ResourceUsageFormRequest request;
};

struct FirmwareMetaEvent {
  String availableVersion;
};

struct FirmwareProgressEvent {
  int progressPct;
};

class EventBus {
public:
  explicit EventBus(UBaseType_t queueDepth = 24)
      : queueDepth(queueDepth), logger("EventBus") {}

  bool setup() {
    if (this->queue != nullptr) {
      return true;
    }
    this->queue = xQueueCreate(this->queueDepth, sizeof(Envelope));
    return this->queue != nullptr;
  }

  bool publish(const ResourceListUpdatedEvent &event) {
    ResourceListUpdatedEvent *payload = new ResourceListUpdatedEvent();
    if (!payload) {
      return false;
    }
    payload->resourceList = event.resourceList;
    return this->publishPrepared<EventKind::ResourceListUpdated, true>(payload);
  }

  bool publish(const CardAuthDetailsEvent &event) {
    return this->publishTyped<EventKind::CardAuthDetails, false>(event);
  }

  bool publish(const EnrollGetAvailableKeyNoEvent &event) {
    return this->publishTyped<EventKind::EnrollGetAvailableKeyNo, false>(event);
  }

  bool publish(const EnrollNewCardEvent &event) {
    return this->publishTyped<EventKind::EnrollNewCard, false>(event);
  }

  bool publish(const ProjectsResponseEvent &event) {
    return this->publishTyped<EventKind::ProjectsResponse, true>(event);
  }

  bool publish(const ResourceFormsRequestEvent &event) {
    return this->publishTyped<EventKind::ResourceFormsRequest, false>(event);
  }

  bool publish(const FirmwareMetaEvent &event) {
    return this->publishTyped<EventKind::FirmwareMeta, false>(event);
  }

  bool publish(const FirmwareProgressEvent &event) {
    return this->publishTyped<EventKind::FirmwareProgress, true>(event);
  }

  void onResourceListUpdated(
      std::function<void(const ResourceListUpdatedEvent &)> handler) {
    this->resourceListUpdatedHandler = handler;
  }
  void onCardAuthDetails(std::function<void(const CardAuthDetailsEvent &)> handler) {
    this->cardAuthDetailsHandler = handler;
  }
  void onEnrollGetAvailableKeyNo(
      std::function<void(const EnrollGetAvailableKeyNoEvent &)> handler) {
    this->enrollGetAvailableKeyNoHandler = handler;
  }
  void onEnrollNewCard(std::function<void(const EnrollNewCardEvent &)> handler) {
    this->enrollNewCardHandler = handler;
  }
  void onProjectsResponse(
      std::function<void(const ProjectsResponseEvent &)> handler) {
    this->projectsResponseHandler = handler;
  }
  void onResourceFormsRequest(
      std::function<void(const ResourceFormsRequestEvent &)> handler) {
    this->resourceFormsRequestHandler = handler;
  }
  void onFirmwareMeta(std::function<void(const FirmwareMetaEvent &)> handler) {
    this->firmwareMetaHandler = handler;
  }
  void onFirmwareProgress(
      std::function<void(const FirmwareProgressEvent &)> handler) {
    this->firmwareProgressHandler = handler;
  }

  void poll() {
    if (!this->queue) {
      return;
    }
    Envelope evt;
    while (xQueueReceive(this->queue, &evt, 0) == pdTRUE) {
      this->dispatch(evt);
      if (evt.destroy && evt.payload) {
        evt.destroy(evt.payload);
      }
    }
  }

  void logHealth() {
    uint32_t now = millis();
    if (now - this->lastHealthLogMs < 5000) {
      return;
    }
    this->lastHealthLogMs = now;
    UBaseType_t queued = this->queue ? uxQueueMessagesWaiting(this->queue) : 0;
    this->logger.infof("APP_EVT,queued=%u,high_water=%u,enq_ok=%u,enq_drop=%u",
                       static_cast<unsigned>(queued),
                       static_cast<unsigned>(this->queueHighWater),
                       static_cast<unsigned>(this->enqueueOkCount),
                       static_cast<unsigned>(this->enqueueDropCount));
  }

private:
  enum class EventKind : uint8_t {
    ResourceListUpdated,
    CardAuthDetails,
    EnrollGetAvailableKeyNo,
    EnrollNewCard,
    ProjectsResponse,
    ResourceFormsRequest,
    FirmwareMeta,
    FirmwareProgress
  };

  struct Envelope {
    EventKind kind;
    void *payload;
    void (*destroy)(void *);
  };

  template <typename T> static void destroyPayload(void *payload) {
    delete static_cast<T *>(payload);
  }

  template <EventKind Kind, bool BestEffort, typename T>
  bool publishPrepared(T *payload) {
    if (!payload) {
      return false;
    }
    if (!this->queue) {
      delete payload;
      return false;
    }

    Envelope evt;
    evt.kind = Kind;
    evt.payload = payload;
    evt.destroy = &EventBus::destroyPayload<T>;
    TickType_t sendWaitTicks = BestEffort ? 0 : pdMS_TO_TICKS(5);
    if (xQueueSend(this->queue, &evt, sendWaitTicks) != pdTRUE) {
      this->enqueueDropCount++;
      this->logger.warnf("Dropping app event kind=%d (queue full)",
                         static_cast<int>(Kind));
      delete payload;
      return false;
    }

    this->enqueueOkCount++;
    UBaseType_t queued = uxQueueMessagesWaiting(this->queue);
    if (queued > this->queueHighWater) {
      this->queueHighWater = queued;
    }
    return true;
  }

  template <EventKind Kind, bool BestEffort, typename T>
  bool publishTyped(const T &event) {
    T *payload = new T(event);
    return this->publishPrepared<Kind, BestEffort>(payload);
  }

  void dispatch(const Envelope &evt) {
    switch (evt.kind) {
    case EventKind::ResourceListUpdated:
      if (this->resourceListUpdatedHandler && evt.payload) {
        this->resourceListUpdatedHandler(
            *static_cast<ResourceListUpdatedEvent *>(evt.payload));
      }
      break;
    case EventKind::CardAuthDetails:
      if (this->cardAuthDetailsHandler && evt.payload) {
        this->cardAuthDetailsHandler(
            *static_cast<CardAuthDetailsEvent *>(evt.payload));
      }
      break;
    case EventKind::EnrollGetAvailableKeyNo:
      if (this->enrollGetAvailableKeyNoHandler && evt.payload) {
        this->enrollGetAvailableKeyNoHandler(
            *static_cast<EnrollGetAvailableKeyNoEvent *>(evt.payload));
      }
      break;
    case EventKind::EnrollNewCard:
      if (this->enrollNewCardHandler && evt.payload) {
        this->enrollNewCardHandler(*static_cast<EnrollNewCardEvent *>(evt.payload));
      }
      break;
    case EventKind::ProjectsResponse:
      if (this->projectsResponseHandler && evt.payload) {
        this->projectsResponseHandler(
            *static_cast<ProjectsResponseEvent *>(evt.payload));
      }
      break;
    case EventKind::ResourceFormsRequest:
      if (this->resourceFormsRequestHandler && evt.payload) {
        this->resourceFormsRequestHandler(
            *static_cast<ResourceFormsRequestEvent *>(evt.payload));
      }
      break;
    case EventKind::FirmwareMeta:
      if (this->firmwareMetaHandler && evt.payload) {
        this->firmwareMetaHandler(*static_cast<FirmwareMetaEvent *>(evt.payload));
      }
      break;
    case EventKind::FirmwareProgress:
      if (this->firmwareProgressHandler && evt.payload) {
        this->firmwareProgressHandler(
            *static_cast<FirmwareProgressEvent *>(evt.payload));
      }
      break;
    }
  }

  UBaseType_t queueDepth;
  QueueHandle_t queue = nullptr;
  Logger logger;
  uint32_t enqueueOkCount = 0;
  uint32_t enqueueDropCount = 0;
  UBaseType_t queueHighWater = 0;
  uint32_t lastHealthLogMs = 0;

  std::function<void(const ResourceListUpdatedEvent &)> resourceListUpdatedHandler;
  std::function<void(const CardAuthDetailsEvent &)> cardAuthDetailsHandler;
  std::function<void(const EnrollGetAvailableKeyNoEvent &)>
      enrollGetAvailableKeyNoHandler;
  std::function<void(const EnrollNewCardEvent &)> enrollNewCardHandler;
  std::function<void(const ProjectsResponseEvent &)> projectsResponseHandler;
  std::function<void(const ResourceFormsRequestEvent &)>
      resourceFormsRequestHandler;
  std::function<void(const FirmwareMetaEvent &)> firmwareMetaHandler;
  std::function<void(const FirmwareProgressEvent &)> firmwareProgressHandler;
};

} // namespace events
} // namespace app

