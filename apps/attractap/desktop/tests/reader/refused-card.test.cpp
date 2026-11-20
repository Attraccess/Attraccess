#include "workflow.hpp"

// Defined in the desktop beeper; counts every error pattern requested.
extern unsigned hostErrorBeepCount;

// ATT-882: a card the server refused, left on the reader or lost and found again, answers once.
void ReaderWorkflow::testRefusedCardSuppression() {
    supervised = false;
    if (label(lv_screen_active(), "Abmelden")) click("Abmelden");
    list(false);
    clearStatus();
    nfc.setPresent(0, false); pump(250);

    const auto detected = server.count("CARD_DETECTED");
    const auto beeps = hostErrorBeepCount;
    nfc.setPresent(0, true); pump();
    assert(server.count("CARD_DETECTED") == detected + 1);
    server.push("CARD_AUTHENTICATION_DATA", R"({"error":"CARD_NOT_FOUND"})"); pump();
    assert(hostErrorBeepCount == beeps + 1);
    assert(lv_screen_active() == Display::statusScreen.getScreen() && label(lv_screen_active(), "Anmeldung fehlgeschlagen"));

    // The reader loses the card and finds it again (gaps under 2 s): no second check, beep or screen change.
    for (int i = 0; i < 4; ++i) {
        nfc.setPresent(0, false); pump(150);
        nfc.setPresent(0, true); pump(150);
    }
    assert(server.count("CARD_DETECTED") == detected + 1);
    assert(hostErrorBeepCount == beeps + 1);
    assert(lv_screen_active() == Display::statusScreen.getScreen() && label(lv_screen_active(), "Anmeldung fehlgeschlagen"));

    // Away for at least 2 s: checked again, one more beep.
    nfc.setPresent(0, false); pump(2100);
    nfc.setPresent(0, true); pump();
    assert(server.count("CARD_DETECTED") == detected + 2);
    server.push("CARD_AUTHENTICATION_DATA", R"({"error":"CARD_NOT_ACTIVE"})"); pump();
    assert(hostErrorBeepCount == beeps + 2);

    // A different card is never suppressed.
    nfc.setPresent(0, false); pump(150);
    nfc.setPresent(1, true); pump();
    assert(server.count("CARD_DETECTED") == detected + 3);
    // A transient error does not start suppression: the same card is sent again at once.
    server.push("CARD_AUTHENTICATION_DATA", R"({"error":"CARD_REMOVED"})"); pump();
    nfc.setPresent(1, false); pump(150);
    nfc.setPresent(1, true); pump();
    assert(server.count("CARD_DETECTED") == detected + 4);
    server.push("CARD_AUTHENTICATION_DATA", R"({"error":"CARD_REMOVED"})"); pump();
    nfc.setPresent(1, false); pump(250);
    clearStatus();
    list(false);
    std::cout << "PASS refused card is answered once" << std::endl;
}
