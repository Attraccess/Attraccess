#pragma once

#include "../ports/network_port.hpp"
#include "../network/network.hpp"

class NetworkAdapter : public INetworkPort {
public:
  void setup() override { Network::setup(); }
  void loop() override { Network::loop(); }
};
