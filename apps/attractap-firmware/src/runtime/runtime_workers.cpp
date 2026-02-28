#include "runtime_workers.hpp"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace {
struct WorkerContext {
  INetworkPort *network = nullptr;
  IApiPort *api = nullptr;
  INfcPort *nfc = nullptr;
};
} // namespace

namespace app::runtime {

void RuntimeWorkers::networkTask(void *parameter) {
  auto *context = static_cast<WorkerContext *>(parameter);
  if (!context || !context->network) {
    vTaskDelete(nullptr);
    return;
  }

  while (true) {
    context->network->loop();
    vTaskDelay(100 / portTICK_PERIOD_MS);
  }
}

void RuntimeWorkers::apiTask(void *parameter) {
  auto *context = static_cast<WorkerContext *>(parameter);
  if (!context || !context->api) {
    vTaskDelete(nullptr);
    return;
  }

  while (true) {
    context->api->loop();
    vTaskDelay(5 / portTICK_PERIOD_MS);
  }
}

void RuntimeWorkers::nfcTask(void *parameter) {
  auto *context = static_cast<WorkerContext *>(parameter);
  if (!context || !context->nfc) {
    vTaskDelete(nullptr);
    return;
  }

  while (true) {
    context->nfc->loop();
    vTaskDelay(5 / portTICK_PERIOD_MS);
  }
}

void RuntimeWorkers::start(INetworkPort &network, IApiPort &api, INfcPort &nfc) {
  if (this->started) {
    return;
  }

  static WorkerContext context;
  context.network = &network;
  context.api = &api;
  context.nfc = &nfc;

  xTaskCreate(RuntimeWorkers::networkTask, "NetworkTask", 4096, &context,
              tskIDLE_PRIORITY, nullptr);
  xTaskCreate(RuntimeWorkers::apiTask, "ApiTask", 10240, &context,
              tskIDLE_PRIORITY + 1, nullptr);
  xTaskCreate(RuntimeWorkers::nfcTask, "NfcTask", 8192, &context,
              tskIDLE_PRIORITY + 1, nullptr);

  this->started = true;
}

} // namespace app::runtime
