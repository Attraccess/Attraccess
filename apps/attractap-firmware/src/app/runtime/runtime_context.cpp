#include "runtime_context.hpp"

namespace app::runtime {

RuntimeContext::RuntimeContext(
    INfcPort &nfc, IApiPort &api, IBeeperPort &beeper, ISettingsPort &settings,
    ISystemPort &system, INetworkPort &network,
    ISerialCommandPort &serialCommand,
    IConnectivityStatePort &connectivityState,
    AuthController &authController,
    ConnectivityController &connectivityController,
    ResourceController &resourceController,
    SessionController &sessionController, UpdateController &updateController,
    app::events::EventBus &eventBus, RuntimeWorkers &runtimeWorkers,
    AppRuntimeState &state
#ifdef HAS_LVGL_DISPLAY
    ,
    IUiPort &ui
#endif
    )
    : nfc(nfc), api(api), beeper(beeper), settings(settings), system(system),
      network(network), serialCommand(serialCommand),
      connectivityState(connectivityState), authController(authController),
      connectivityController(connectivityController),
      resourceController(resourceController),
      sessionController(sessionController), updateController(updateController),
      eventBus(eventBus), runtimeWorkers(runtimeWorkers), state(state)
#ifdef HAS_LVGL_DISPLAY
      ,
      ui(ui)
#endif
{
}

} // namespace app::runtime
