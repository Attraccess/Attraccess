#pragma once

struct ConnectivitySnapshot {
  bool apiAuthenticated = false;
  bool networkConnected = false;
  bool websocketConnected = false;
};

class IConnectivityStatePort {
public:
  virtual ~IConnectivityStatePort() = default;

  virtual ConnectivitySnapshot getSnapshot() = 0;
};
