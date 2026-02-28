#pragma once

#include "../ports/network_port.hpp"
#include "../ports/api_port.hpp"
#include "../ports/nfc_port.hpp"

namespace app::runtime {

class RuntimeWorkers {
public:
  void start(INetworkPort &network, IApiPort &api, INfcPort &nfc);

private:
  bool started = false;

  static void networkTask(void *parameter);
  static void apiTask(void *parameter);
  static void nfcTask(void *parameter);
};

} // namespace app::runtime
