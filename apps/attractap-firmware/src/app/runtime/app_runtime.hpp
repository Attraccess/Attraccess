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
#include "../ports/api_port.hpp"
#include "../ports/beeper_port.hpp"
#include "../ports/connectivity_state_port.hpp"
#include "../ports/nfc_port.hpp"
#include "../ports/network_port.hpp"
#include "../ports/serial_command_port.hpp"
#include "../ports/settings_port.hpp"
#include "../ports/system_port.hpp"
#include "app_runtime_state.hpp"
#include "event_router.hpp"
#include "runtime_workers.hpp"
#include "../../api/api.hpp"
#include "../../logger/logger.hpp"

#ifdef HAS_LVGL_DISPLAY
#include "../adapters/ui_adapter.hpp"
#include "../ports/ui_port.hpp"
#include "../../display/screens/connectionConfiguration/connectionConfigurationScreen.hpp"
#include "../../display/screens/resourceDetails/resourceDetailsScreen.hpp"
#else
#define NFC_CARD_LONG_PRESENTATION_TIME_MS 1500
#endif

#define APPLICATION_BOOT_SCREEN_DURATION 2000

namespace app::runtime {

class AppRuntime {
public:
  AppRuntime(INfcPort &nfc, IApiPort &api, IBeeperPort &beeper,
             ISettingsPort &settings, ISystemPort &system,
             INetworkPort &network, ISerialCommandPort &serialCommand,
             IConnectivityStatePort &connectivityState,
             AuthController &authController,
             ConnectivityController &connectivityController,
             ResourceController &resourceController,
             SessionController &sessionController,
             UpdateController &updateController,
             app::events::EventBus &eventBus,
             RuntimeWorkers &runtimeWorkers
#ifdef HAS_LVGL_DISPLAY
             ,
             IUiPort &ui
#endif
  );

  void setup();
  void loop();

  // Event handlers (called by EventRouter)
  void handleResourceListUpdated(const app::events::ResourceListUpdatedEvent &event);
  void handleCardAuthDetails(const app::events::CardAuthDetailsEvent &event);
#ifdef HAS_LVGL_DISPLAY
  void handleEnrollGetAvailableKeyNo(const app::events::EnrollGetAvailableKeyNoEvent &event);
  void handleEnrollNewCard(const app::events::EnrollNewCardEvent &event);
  void handleProjectsResponse(const app::events::ProjectsResponseEvent &event);
  void handleResourceFormsRequest(const app::events::ResourceFormsRequestEvent &event);
#endif
  void handleFirmwareMeta(const app::events::FirmwareMetaEvent &event);
  void handleFirmwareProgress(const app::events::FirmwareProgressEvent &event);

  AppRuntimeState &state() { return state_; }
  const AppRuntimeState &state() const { return state_; }

#ifdef HAS_LVGL_DISPLAY
  void retryNfcSetup();
#endif

private:
  INfcPort &nfc_;
  IApiPort &api_;
  IBeeperPort &beeper_;
  ISettingsPort &settings_;
  ISystemPort &system_;
  INetworkPort &network_;
  ISerialCommandPort &serialCommand_;
  IConnectivityStatePort &connectivityState_;
  AuthController &authController_;
  ConnectivityController &connectivityController_;
  ResourceController &resourceController_;
  SessionController &sessionController_;
  UpdateController &updateController_;
  app::events::EventBus &eventBus_;
  RuntimeWorkers &runtimeWorkers_;
#ifdef HAS_LVGL_DISPLAY
  IUiPort &ui_;
#endif

  AppRuntimeState state_;
  EventRouter eventRouter_;
  Logger logger_{"AppRuntime"};

  void processState();
  bool handleConfigurationAndConnectivityGates();
#ifdef HAS_LVGL_DISPLAY
  bool handleDisplayBootAndPinGates();
  bool handleEnrollmentTransitions();
#else
  void handleNonDisplayPresentationSignal();
#endif
  bool handleExternalAuthTransition();
  bool handleExternalFirmwareUpdateTransition();
#ifdef HAS_LVGL_DISPLAY
  bool handleDisplayResourceAndSessionFlow();
#else
  bool handleNonDisplayActionFlow();
#endif

  void processCardAuthenticationData();

#ifdef HAS_LVGL_DISPLAY
  void handleConnectionConfigurationSave(
      const ConnectionConfigurationScreen::ConnectionConfig &cfg);
  void handleResourceListUpdate(const API::ResourceList &resourceList);
  void selectResource(const API::ResourceBrief &resource);
  void requestProjectsPage(uint32_t page);
  void clearProjectSelection();
  void handleProjectSelection(uint32_t projectId, const String &projectName);
  void handleFormsRequest(const API::ResourceUsageFormRequest &request);
  void handleFormsSubmit(const API::FormSubmissionList &submissions);
  void handleFormsCancel();
  void onActionResult(const String &eventType);
  void handleTouch(int16_t x, int16_t y);
  void restartSessionTimeout();
  void handleResourceDetailsButtonClick(
      ResourceDetailsScreen::ButtonClickEventData evt);
  void restartResourceSelectionTimeout();
  void beginActionPause();
  void endActionPause();
  void resetPauseAccounting();
  void resetSessionOnDisconnect();
#endif
};

} // namespace app::runtime
