#include "fixtures.hpp"

#include "display/messages.hpp"

#include <SDL3/SDL_timer.h>

// The pairing screen: rotating code, one QR updated in place, code-only fallbacks, stale and removed states.
void testPendingApproval(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    auto &screen = Display::pendingApprovalScreen;
    const auto show = [&] { Display::loop(); lv_refr_now(nullptr); assert(display.pollEvents()); };

    assert(PendingApprovalScreen::buildEnrollUrl("https://access.example", "K7P-3Q2") == "https://access.example/?enroll=K7P3Q2");
    assert(PendingApprovalScreen::buildEnrollUrl("https://access.example/", "K7P-3Q2") == "https://access.example/?enroll=K7P3Q2");
    assert(PendingApprovalScreen::buildEnrollUrl("", "K7P-3Q2").empty());

    State::clearEnrollment();
    State::setEnrollmentKind(false);
    State::setEnrollmentRound("K7P-3Q", "https://access.example", nullptr, 30000, 600000);
    Display::transitionToScreen(&screen);
    show();
    assert(lv_screen_active() == screen.getScreen());
    assert(findLabel(lv_screen_active(), "K7P-3Q"));
    assert(findLabel(lv_screen_active(), "Dieses Lesegerät in Attraccess freigeben"));
    assert(screen.isQrVisible());
    lv_obj_t *qr = screen.getQrCode();
    screenshot(screenshots, "pairing-pending-approval.png");

    // Every rotation replaces the code; the same QR object is updated in place.
    State::setEnrollmentRound("M4N-8Z", "https://access.example", nullptr, 30000, 570000);
    show();
    assert(findLabel(lv_screen_active(), "M4N-8Z") && !findLabel(lv_screen_active(), "K7P-3Q"));
    assert(screen.getQrCode() == qr && screen.isQrVisible());
    screenshot(screenshots, "pairing-pending-approval-rotated.png");

    // No app URL, or a link too long for a QR: code only.
    State::setEnrollmentRound("B5C-6D", "", nullptr, 30000, 540000);
    show();
    assert(findLabel(lv_screen_active(), "B5C-6D") && !screen.isQrVisible());
    screenshot(screenshots, "pairing-pending-approval-code-only.png");
    State::setEnrollmentRound("H2J-3K", "https://access.example", nullptr, 30000, 510000);
    show();
    assert(screen.getQrCode() == qr && screen.isQrVisible());
    State::setEnrollmentRound("M2N-3P", "https://access.example/" + std::string(400, 'x'), nullptr, 30000, 480000);
    show();
    assert(findLabel(lv_screen_active(), "M2N-3P") && !screen.isQrVisible());

    // Disconnected: the code and QR disappear at once.
    State::setEnrollmentRound("D7E-8F", "https://access.example", nullptr, 30000, 450000);
    show();
    assert(screen.isQrVisible());
    State::setEnrollmentDisconnected();
    show();
    assert(!findLabel(lv_screen_active(), "D7E-8F") && !screen.isQrVisible());
    assert(State::getEnrollmentState().stale);
    screenshot(screenshots, "pairing-pending-approval-stale.png");

    // Admin removed the pairing.
    State::setPairingRemoved();
    show();
    assert(findLabel(lv_screen_active(), "Kopplung entfernt") && !screen.isQrVisible());
    screenshot(screenshots, "pairing-removed.png");

    // A new round after removal: the code shows (the notice stays a few seconds), then the notice ends.
    State::setEnrollmentRound("F2R-B3", "https://access.example", nullptr, 30000, 600000);
    assert(State::getEnrollmentState().pairingRemoved);
    State::clearEnrollment();
    assert(!State::getEnrollmentState().pairingRemoved);

    // No new round 10 s after the rotation is due: stale (shortly before the grace it is still fresh).
    State::setEnrollmentRound("G3H-4J", "https://access.example", nullptr, 0, 600000);
    assert(!State::getEnrollmentState().stale);
    SDL_Delay(State::ENROLLMENT_STALE_GRACE_MS + 200);
    assert(State::getEnrollmentState().stale);
    show();
    assert(!findLabel(lv_screen_active(), "G3H-4J") && !screen.isQrVisible());
    State::setEnrollmentRound("K7P-3Q", "https://access.example", nullptr, 30000, 600000);
    assert(!State::getEnrollmentState().stale);

    // Outcomes are consumed once; patterns outside the six colours are rejected.
    State::setEnrollmentOutcome(true);
    assert(State::consumeEnrollmentOutcome() == State::ENROLLMENT_OUTCOME_ACCEPTED);
    assert(State::consumeEnrollmentOutcome() == State::ENROLLMENT_OUTCOME_NONE);
    const uint8_t good[8] = {0, 1, 2, 3, 4, 5, 0, 1};
    const uint8_t bad[8] = {0, 1, 2, 3, 4, 6, 0, 1};
    State::setEnrollmentRound("K7P-3Q", "", good, 30000, 600000);
    assert(State::getEnrollmentState().hasPattern && State::getEnrollmentState().pattern[5] == 5);
    State::setEnrollmentRound("K7P-3Q", "", bad, 30000, 600000);
    assert(!State::getEnrollmentState().hasPattern);

    State::clearEnrollment();
    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
}
