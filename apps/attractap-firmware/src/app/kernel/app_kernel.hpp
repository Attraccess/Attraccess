#pragma once

#include "../adapters/api_adapter.hpp"
#include "../adapters/beeper_adapter.hpp"
#include "../adapters/connectivity_state_adapter.hpp"
#include "../adapters/nfc_adapter.hpp"
#include "../adapters/network_adapter.hpp"
#include "../adapters/serial_command_adapter.hpp"
#include "../adapters/settings_adapter.hpp"
#include "../adapters/system_adapter.hpp"
#include "../domain/auth/auth_controller.hpp"
#include "../domain/connectivity/connectivity_controller.hpp"
#include "../domain/resource/resource_controller.hpp"
#include "../domain/session/session_controller.hpp"
#include "../domain/update/update_controller.hpp"
#include "../events/event_bus.hpp"
#include "../runtime/app_runtime.hpp"
#include "../runtime/runtime_workers.hpp"
#include "../../logger/logger.hpp"
#ifdef HAS_LVGL_DISPLAY
#include "../adapters/ui_adapter.hpp"
#endif

class AppKernel {
public:
  void setup();
  void loop();

private:
  NfcAdapter nfcAdapter_;
  ApiAdapter apiAdapter_;
  BeeperAdapter beeperAdapter_;
  SettingsAdapter settingsAdapter_;
  SystemAdapter systemAdapter_;
  NetworkAdapter networkAdapter_;
  SerialCommandAdapter serialCommandAdapter_;
  ConnectivityStateAdapter connectivityStateAdapter_;
  INfcPort &nfc_ = nfcAdapter_;
  IApiPort &api_ = apiAdapter_;
  IBeeperPort &beeper_ = beeperAdapter_;
  ISettingsPort &settings_ = settingsAdapter_;
  ISystemPort &system_ = systemAdapter_;
  INetworkPort &network_ = networkAdapter_;
  ISerialCommandPort &serialCommand_ = serialCommandAdapter_;
  IConnectivityStatePort &connectivityState_ = connectivityStateAdapter_;
  AuthController authController_;
  ConnectivityController connectivityController_;
  ResourceController resourceController_;
  SessionController sessionController_;
  UpdateController updateController_;
  app::events::EventBus eventBus_{24};
  app::runtime::RuntimeWorkers runtimeWorkers_;
#ifdef HAS_LVGL_DISPLAY
  UiAdapter uiAdapter_;
  IUiPort &ui_ = uiAdapter_;
#endif
  app::runtime::AppRuntime appRuntime_{nfc_,
                                       api_,
                                       beeper_,
                                       settings_,
                                       system_,
                                       network_,
                                       serialCommand_,
                                       connectivityState_,
                                       authController_,
                                       connectivityController_,
                                       resourceController_,
                                       sessionController_,
                                       updateController_,
                                       eventBus_,
                                       runtimeWorkers_
#ifdef HAS_LVGL_DISPLAY
                                       ,
                                       ui_
#endif
  };
  Logger logger{"AppKernel"};
  bool initialized = false;
};

