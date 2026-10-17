#pragma once

#include <string>
#include "../settings/kvstore.hpp"

#ifdef DEMO_MODE
#include "../demo/demo_store.hpp"
#endif

#include "../rfid/rfid_contract.hpp"
#include "../logger/logger.hpp"
#include "../settings/settings.hpp"
#include "../network/network.hpp"
#include "../api/api.hpp"
#include "../utils.hpp"
#include "../beeper/beeper.hpp"

#ifdef HAS_IO_EXPANDER
#include "../ioexpander/ioexpander.hpp"
#endif

#ifdef HAS_WS2812_LED
#include "../led/led.hpp"
#endif

#ifdef HAS_LVGL_DISPLAY
#include "../display/display.hpp"
#include "supervision.hpp"
#else
#define NFC_CARD_LONG_PRESENTATION_TIME_MS 1500
#endif

#define APPLICATION_BOOT_SCREEN_DURATION 2000


    // Enrollment is a self-contained, sticky sub-flow. Once started it owns the
    // display until it reaches a terminal state (success, cancel or timeout) so
    // the generic screen routing can never steal the enrollment screen. The
    // whole flow is poll-driven (card detection stays disabled), which removes
    // the old dependency on a fresh card-detection edge for the key-write step
    // (the "jiggle the card to get a beep" symptom).
    // Set by the card-detection callback when a card enters the field during
    // ENROLL_PHASE_WAIT_FOR_CARD. The enrollment state machine consumes it on
    // the main loop. Lets WAIT_FOR_CARD ride the proven handleCardDetection
    // loop (reliable re-arm across removals) instead of blind PN532 polling.
    // Fixed buffer, not an Arduino std::string: the producer runs on the websocket
    // task and the consumer on the main loop. A std::string would reallocate its
    // heap buffer on assignment, which the main loop could observe mid-update
    // (dangling pointer / torn read). A plain char[] has no pointer to dangle.

    // Card reset/deletion. Mirrors the sticky, poll-driven enrollment sub-flow:
    // once started it owns the display until success, cancel or timeout. Unlike
    // enrollment there is no key round-trip — the server hands over the stored
    // key + slot up front, so the reader can authenticate the card and write the
    // factory key back as soon as a card is presented.

    // Set by the card-detection callback when a card enters the field during
    // RESET_PHASE_WAIT_FOR_CARD; consumed on the main loop. Rides the proven
    // handleCardDetection loop for reliable re-arm across removals (like ATT-503).

    // Persistent boot/crash diagnostics stored in NVS. The record describes the
    // currently running session and is refreshed periodically so the last value
    // before a freeze/crash survives the reboot.

    // True once the form for the in-flight action has been fully submitted and the
    // START/STOP message sent. Guards against a re-delivered (retried by the server)
    // RESOURCE_USAGE_FORM_REQUEST reopening the form from the beginning (ATT-545).
    // Preserved before deferred LVGL activation so cancellation can clear the server draft.

    // Prefetch cache for paginated form fields. Each navigation otherwise costs a
    // full server round-trip; we cache visited pages and preload the next one so
    // forward/back navigation renders instantly. Keyed by (formId, offset).
    // True while a GET for the field the user is currently waiting on is in flight.
