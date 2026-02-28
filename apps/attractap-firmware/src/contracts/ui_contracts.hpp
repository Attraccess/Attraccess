#pragma once

#include <Arduino.h>
#include "api_contracts.hpp"

namespace app::contracts {

struct ConnectionConfig {
  String ssid;
  String password;
  String host;
  bool useSSL = false;
  String devicePin;
  bool beeperEnabled = true;
};

struct ResourceDetailsUserDetails {
  String username;
  bool canManageResource = false;
  bool hasIntroduction = false;
  bool isIntroducer = false;
};

enum class ResourceDetailsButtonClickType : uint8_t {
  START_SESSION,
  STOP_SESSION,
  LOCK_DOOR,
  UNLOCK_DOOR,
  UNLATCH_DOOR,
  FLOW_BUTTON,
  LOGOUT,
};

struct ResourceDetailsButtonClickEventData {
  ResourceDetailsButtonClickType type =
      ResourceDetailsButtonClickType::START_SESSION;
  char flowButtonId[app::contracts::MAX_FLOW_BUTTON_ID_LEN];
};

} // namespace app::contracts
