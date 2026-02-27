#pragma once

#include "../app/adapters/api_adapter.hpp"
#include "../app/adapters/beeper_adapter.hpp"
#include "../app/adapters/connectivity_state_adapter.hpp"
#include "../app/adapters/nfc_adapter.hpp"
#include "../app/adapters/network_adapter.hpp"
#include "../app/adapters/serial_command_adapter.hpp"
#include "../app/adapters/settings_adapter.hpp"
#include "../app/adapters/system_adapter.hpp"
#include "../app/domain/auth/auth_controller.hpp"
#include "../app/domain/connectivity/connectivity_controller.hpp"
#include "../app/domain/resource/resource_controller.hpp"
#include "../app/domain/session/session_controller.hpp"
#include "../app/domain/update/update_controller.hpp"
#include "../app/events/event_bus.hpp"
#include "../app/runtime/app_runtime.hpp"
#include "../app/runtime/runtime_workers.hpp"
#ifdef HAS_LVGL_DISPLAY
#include "../app/adapters/ui_adapter.hpp"
#endif

class Application {
public:
  Application()
      : nfcAdapter(), apiAdapter(), beeperAdapter(), settingsAdapter(),
        systemAdapter(), networkAdapter(), serialCommandAdapter(),
        connectivityStateAdapter(), nfc(nfcAdapter), api(apiAdapter),
        beeper(beeperAdapter), settings(settingsAdapter), system(systemAdapter),
        network(networkAdapter), serialCommand(serialCommandAdapter),
        connectivityState(connectivityStateAdapter), authController(),
        connectivityController(), resourceController(), sessionController(),
        updateController(), eventBus(24), runtimeWorkers(),
#ifdef HAS_LVGL_DISPLAY
        uiAdapter(), ui(uiAdapter),
#endif
        appRuntime(nfc, api, beeper, settings, system, network, serialCommand,
                   connectivityState, authController, connectivityController,
                   resourceController, sessionController, updateController,
                   eventBus, runtimeWorkers
#ifdef HAS_LVGL_DISPLAY
                   ,
                   ui
#endif
        ) {}

  void setup();
  void loop();

private:
  NfcAdapter nfcAdapter;
  ApiAdapter apiAdapter;
  BeeperAdapter beeperAdapter;
  SettingsAdapter settingsAdapter;
  SystemAdapter systemAdapter;
  NetworkAdapter networkAdapter;
  SerialCommandAdapter serialCommandAdapter;
  ConnectivityStateAdapter connectivityStateAdapter;
  INfcPort &nfc;
  IApiPort &api;
  IBeeperPort &beeper;
  ISettingsPort &settings;
  ISystemPort &system;
  INetworkPort &network;
  ISerialCommandPort &serialCommand;
  IConnectivityStatePort &connectivityState;
  AuthController authController;
  ConnectivityController connectivityController;
  ResourceController resourceController;
  SessionController sessionController;
  UpdateController updateController;
  app::events::EventBus eventBus;
  app::runtime::RuntimeWorkers runtimeWorkers;
#ifdef HAS_LVGL_DISPLAY
  UiAdapter uiAdapter;
  IUiPort &ui;
#endif

  app::runtime::AppRuntime appRuntime;
};
