#pragma once

namespace app {
namespace events {
class EventBus;
}
namespace runtime {
class AppRuntime;
}
} // namespace app

namespace app::runtime {

class EventRouter {
public:
  void bind(app::events::EventBus &eventBus, AppRuntime &runtime);
  void poll(app::events::EventBus &eventBus);
  void logHealth(app::events::EventBus &eventBus);
};

} // namespace app::runtime
