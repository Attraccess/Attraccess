#include "event_router.hpp"
#include "app_runtime.hpp"
#include "../events/event_bus.hpp"

namespace app::runtime {

void EventRouter::bind(app::events::EventBus &eventBus, AppRuntime &runtime) {
  eventBus.onResourceListUpdated(
      [&runtime](const app::events::ResourceListUpdatedEvent &event) {
        runtime.handleResourceListUpdated(event);
      });

  eventBus.onCardAuthDetails(
      [&runtime](const app::events::CardAuthDetailsEvent &event) {
        runtime.handleCardAuthDetails(event);
      });

#ifdef HAS_LVGL_DISPLAY
  eventBus.onEnrollGetAvailableKeyNo(
      [&runtime](const app::events::EnrollGetAvailableKeyNoEvent &event) {
        runtime.handleEnrollGetAvailableKeyNo(event);
      });

  eventBus.onEnrollNewCard(
      [&runtime](const app::events::EnrollNewCardEvent &event) {
        runtime.handleEnrollNewCard(event);
      });

  eventBus.onProjectsResponse(
      [&runtime](const app::events::ProjectsResponseEvent &event) {
        runtime.handleProjectsResponse(event);
      });

  eventBus.onResourceFormsRequest(
      [&runtime](const app::events::ResourceFormsRequestEvent &event) {
        runtime.handleResourceFormsRequest(event);
      });
#endif

  eventBus.onFirmwareMeta(
      [&runtime](const app::events::FirmwareMetaEvent &event) {
        runtime.handleFirmwareMeta(event);
      });

  eventBus.onFirmwareProgress(
      [&runtime](const app::events::FirmwareProgressEvent &event) {
        runtime.handleFirmwareProgress(event);
      });
}

void EventRouter::poll(app::events::EventBus &eventBus) { eventBus.poll(); }

void EventRouter::logHealth(app::events::EventBus &eventBus) {
  eventBus.logHealth();
}

} // namespace app::runtime
