#pragma once

#include "../ports/connectivity_state_port.hpp"
#include "../../state/state.hpp"

class ConnectivityStateAdapter : public IConnectivityStatePort {
public:
  ConnectivitySnapshot getSnapshot() override {
    State::ApiState apiState = State::getApiState();
    State::NetworkState networkState = State::getNetworkState();
    State::WebsocketState websocketState = State::getWebsocketState();

    ConnectivitySnapshot snapshot;
    snapshot.apiAuthenticated = apiState.authenticated;
    snapshot.networkConnected =
        networkState.ethernet_connected || networkState.wifi_connected;
    snapshot.websocketConnected = websocketState.connected;
    return snapshot;
  }
};
