// Bluetooth setup on the readers (ATT-1371): an unpaired reader opens the setup window for 10 minutes after every
// boot; a Touch also opens a new one with the "Bluetooth setup" button on its connecting screen. The window, the
// GATT service and the command channel are the shared src/bt_setup, the same the BLE bridge uses.
// FEATURE: application-bt-setup

#include "application.hpp"
#include "../bt_setup/bt_setup.hpp"
#include "../platform.hpp"

void Application::tickBtSetup() {
  // The bridge opens its window with its button and runs it on its button task (src/bridge).
#ifndef ATTRACTAP_BLE_BRIDGE
  if (this->btSetupStarted) {
    bt_setup::update(State::getApiState().authenticated, millis());
    return;
  }
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
  Display::initScreen.setOnBluetoothSetupCallback([]() {
    // No PIN here: every setup command checks it.
    if (bt_setup::request(millis()) == bt_setup::Request::NoMemory) Display::initScreen.showBluetoothSetupError();
  });
#endif
#endif
}
