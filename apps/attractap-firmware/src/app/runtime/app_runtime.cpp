#include "app_runtime.hpp"
#include "../../debug/loopTiming.hpp"
#include "telemetry/loop_metrics.hpp"

#ifdef ESP_PLATFORM
#include "freertos/task.h"
#endif

namespace app::runtime {

AppRuntime::AppRuntime(
    INfcPort &nfc, IApiPort &api, IBeeperPort &beeper, ISettingsPort &settings,
    ISystemPort &system, INetworkPort &network,
    ISerialCommandPort &serialCommand,
    IConnectivityStatePort &connectivityState,
    AuthController &authController,
    ConnectivityController &connectivityController,
    ResourceController &resourceController,
    SessionController &sessionController, UpdateController &updateController,
    app::events::EventBus &eventBus, RuntimeWorkers &runtimeWorkers
#ifdef HAS_LVGL_DISPLAY
    ,
    IUiPort &ui
#endif
    )
    : nfc_(nfc), api_(api), beeper_(beeper), settings_(settings), system_(system),
      network_(network), serialCommand_(serialCommand),
      connectivityState_(connectivityState), authController_(authController),
      connectivityController_(connectivityController),
      resourceController_(resourceController),
      sessionController_(sessionController), updateController_(updateController),
      eventBus_(eventBus), runtimeWorkers_(runtimeWorkers)
#ifdef HAS_LVGL_DISPLAY
      ,
      ui_(ui)
#endif
      ,
      state_(),
      context_(nfc_, api_, beeper_, settings_, system_, network_, serialCommand_,
               connectivityState_, authController_, connectivityController_,
               resourceController_, sessionController_, updateController_, eventBus_,
               runtimeWorkers_, state_
#ifdef HAS_LVGL_DISPLAY
               ,
               ui
#endif
                   ),
      eventRouter_(),
      logger_("AppRuntime")
{
  state_.state = AppRuntimeState::APPLICATION_STATE_INIT;
}

void AppRuntime::loop() {
#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  LoopTiming t;
  uint32_t t0 = loopTimingNow();
#endif

#ifdef HAS_LVGL_DISPLAY
  ui_.loop();
  taskYIELD();
#endif

#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  t.display_ms = loopTimingNow() - t0;
  t0 = loopTimingNow();
#endif

  serialCommand_.loop();

#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  t.serial_ms = loopTimingNow() - t0;
  t0 = loopTimingNow();
#endif

  eventRouter_.poll(eventBus_);
  eventRouter_.logHealth(eventBus_);

#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  t.nfc_ms = 0;
  t.api_ms = 0;
  t0 = loopTimingNow();
#endif

  processState();

#if defined(DEBUG_LOOP_TIMING) || defined(PERF_BASELINE_METRICS)
  t.processState_ms = loopTimingNow() - t0;
  t.total_ms =
      t.display_ms + t.serial_ms + t.nfc_ms + t.api_ms + t.processState_ms;
#endif

#ifdef DEBUG_LOOP_TIMING
  t.logIfSlow();
#endif

#if defined(PERF_BASELINE_METRICS) && defined(HAS_LVGL_DISPLAY)
  static LoopMetricsWindow metricsWindow;
  LoopBucketDurations d = {
      .display_ms = t.display_ms,
      .serial_ms = t.serial_ms,
      .nfc_ms = t.nfc_ms,
      .api_ms = t.api_ms,
      .process_state_ms = t.processState_ms,
      .total_ms = t.total_ms,
  };
  metricsWindow.record(d);
  metricsWindow.maybeLogAndReset(system_.nowMs());
#endif
}

} // namespace app::runtime
