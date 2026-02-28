#pragma once

#include "../domain/auth/auth_controller.hpp"
#include "../domain/connectivity/connectivity_controller.hpp"
#include "../domain/resource/resource_controller.hpp"
#include "../domain/session/session_controller.hpp"
#include "../domain/update/update_controller.hpp"
#include "../events/event_bus.hpp"
#include "../ports/api_port.hpp"
#include "../ports/beeper_port.hpp"
#include "../ports/connectivity_state_port.hpp"
#include "../ports/nfc_port.hpp"
#include "../ports/network_port.hpp"
#include "../ports/serial_command_port.hpp"
#include "../ports/settings_port.hpp"
#include "../ports/system_port.hpp"
#include "app_runtime_state.hpp"
#include "runtime_workers.hpp"

#ifdef HAS_LVGL_DISPLAY
#include "../ports/ui_port.hpp"
#endif

namespace app::runtime {

struct RuntimeContext {
  RuntimeContext(INfcPort &nfc, IApiPort &api, IBeeperPort &beeper,
                 ISettingsPort &settings, ISystemPort &system,
                 INetworkPort &network, ISerialCommandPort &serialCommand,
                 IConnectivityStatePort &connectivityState,
                 AuthController &authController,
                 ConnectivityController &connectivityController,
                 ResourceController &resourceController,
                 SessionController &sessionController,
                 UpdateController &updateController,
                 app::events::EventBus &eventBus,
                 RuntimeWorkers &runtimeWorkers, AppRuntimeState &state
#ifdef HAS_LVGL_DISPLAY
                 ,
                 IUiPort &ui
#endif
                 );

  INfcPort &nfc;
  IApiPort &api;
  IBeeperPort &beeper;
  ISettingsPort &settings;
  ISystemPort &system;
  INetworkPort &network;
  ISerialCommandPort &serialCommand;
  IConnectivityStatePort &connectivityState;
  AuthController &authController;
  ConnectivityController &connectivityController;
  ResourceController &resourceController;
  SessionController &sessionController;
  UpdateController &updateController;
  app::events::EventBus &eventBus;
  RuntimeWorkers &runtimeWorkers;
  AppRuntimeState &state;
#ifdef HAS_LVGL_DISPLAY
  IUiPort &ui;
#endif
};

} // namespace app::runtime
