// Bluetooth setup on the readers (ATT-1371): an unpaired reader opens the setup window for 10 minutes after every
// boot; a Touch also opens a new one with the "Bluetooth setup" button on its connecting screen. The window, the
// GATT service and the command channel are the shared src/bt_setup, the same the BLE bridge uses.
// FEATURE: application-bt-setup

#include "application.hpp"
#include "../bt_setup/bt_setup.hpp"
#include "../platform.hpp"

#include <atomic>

namespace {
// The Touch's button was pressed. Its click runs on LvglTask; the window is opened here on the main loop, the only
// task bt_setup::request() and update() may run on (and NimBLE does not start while LVGL is locked).
std::atomic<bool> buttonPressed{false};
}

void Application::tickBtSetup() {
  // The bridge opens its window with its button and runs it on its button task (src/bridge).
#ifndef ATTRACTAP_BLE_BRIDGE
  if (!this->btSetupStarted) {
    this->btSetupStarted = true;
    bt_setup::registerChannel();
    switch (bt_setup::request(millis())) {
    case bt_setup::Request::Opened:
      this->logger.info("Not paired yet: Bluetooth setup open for 10 minutes");
      break;
    case bt_setup::Request::NoMemory:
      this->logger.error("Not paired yet, but the Bluetooth setup could not start");
      break;
    default:
      break;
    }
#ifdef HAS_LVGL_DISPLAY
    // No PIN here: every setup command checks it.
    Display::initScreen.setOnBluetoothSetupCallback([]() { buttonPressed = true; });
#endif
    return;
  }

  if (buttonPressed.exchange(false) && bt_setup::request(millis()) == bt_setup::Request::NoMemory) {
#ifdef HAS_LVGL_DISPLAY
    lv_lock();
    Display::initScreen.showBluetoothSetupError();
    lv_unlock();
#endif
  }
  // A paired reader with no window has nothing to watch: skip copying the API state every pass.
  if (!bt_setup::isOpen() && !bt_setup::offerButton()) return;
  bt_setup::update(State::getApiState().authenticated, millis());
#endif
}
