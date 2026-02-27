#include "../app_runtime.hpp"

namespace app::runtime {

#ifndef HAS_LVGL_DISPLAY
namespace {
constexpr uint32_t NFC_CARD_LONG_PRESENTATION_TIME_MS = 1500;
}

void AppRuntime::handleNonDisplayPresentationSignal() {
  SessionController::NonDisplayPresentationDecision nonDisplayPresentation =
      sessionController_.evaluateNonDisplayPresentation(
          state_.cardDetected, state_.cardRemoved, system_.nowMs(),
          state_.cardDetectionTimeMs, NFC_CARD_LONG_PRESENTATION_TIME_MS,
          state_.cardPresentationWasLong);
  if (nonDisplayPresentation.shouldIndicateLongPresentation) {
    beeper_.indicateBeep();
  }
  if (nonDisplayPresentation.shouldMarkLongPresentation) {
    state_.cardPresentationWasLong = true;
  }
}
#endif

} // namespace app::runtime
