#include "workflow.hpp"

// Defined in the desktop beeper; counts every error pattern requested.
extern unsigned hostErrorBeepCount;

namespace
{
const char *CARD_VERDICTS[] = {"CARD_NOT_FOUND", "CARD_NOT_ACTIVE", "CARD_AUTHENTICATION_FAILED", "CARD_NOT_SUPPORTED"};
const char *TRANSIENT_ERRORS[] = {"CARD_REMOVED", "BUSY", "INTERNAL_ERROR", "UPDATE_NEEDED"};
}

// ATT-882 on the test clock: every verdict through both delivery paths, transient errors, other cards, random UIDs,
// the 2000 ms window and the screens a refused card must not touch. Run by `--refused-card` (no real waits).
void ReaderWorkflow::testRefusedCardVariants()
{
    const auto checkingCard = [&] {
        auto *found = label(lv_screen_active(), FirmwareI18n::messageText(FirmwareI18n::Message::CheckingCard, State::getActiveLanguage()));
        return found && lv_obj_is_visible(found); // the progress label stays on the list screen, hidden
    };
    const auto statusUp = [&] {
        return lv_screen_active() == Display::statusScreen.getScreen() && label(lv_screen_active(), "Anmeldung fehlgeschlagen");
    };
    const auto away = [&](uint32_t ms) {
        for (size_t card = 0; card < VirtualNfc::CardCount; ++card) nfc.setPresent(card, false);
        pump(ms);
    };
    // The server's verdict: on the wire (the details-response path) or into the reader's error callback.
    const auto refuse = [&](const char *code, bool onTheWire) {
        if (onTheWire) server.push("CARD_AUTHENTICATION_DATA", std::string("{\"error\":\"") + code + "\"}");
        else api.reportError("CARD_AUTHENTICATION_DATA", code);
        pump();
    };

    supervised = false;
    if (label(lv_screen_active(), "Abmelden")) click("Abmelden");
    list(false);
    clearStatus();
    away(250);

    // Every verdict, both paths: one check and one beep, then silence; 2000 ms of absence ends it.
    for (const char *code : CARD_VERDICTS) {
        for (const bool onTheWire : {true, false}) {
            clearStatus();
            away(2100);
            const auto detected = server.count("CARD_DETECTED");
            const auto beeps = hostErrorBeepCount;
            nfc.setPresent(0, true); pump();
            assert(server.count("CARD_DETECTED") == detected + 1);
            assert(checkingCard()); // the progress is up while the server decides
            refuse(code, onTheWire);
            assert(hostErrorBeepCount == beeps + 1);
            assert(statusUp());
            for (int i = 0; i < 4; ++i) {
                nfc.setPresent(0, false); pump(250);
                nfc.setPresent(0, true); pump(250);
                assert(server.count("CARD_DETECTED") == detected + 1 && hostErrorBeepCount == beeps + 1);
                assert(statusUp() && !checkingCard());
            }
            away(1700); // 250 ms after the last sighting plus this: 1950 ms, still inside the window
            nfc.setPresent(0, true); pump();
            assert(server.count("CARD_DETECTED") == detected + 1 && hostErrorBeepCount == beeps + 1);
            away(2100);
            nfc.setPresent(0, true); pump();
            assert(server.count("CARD_DETECTED") == detected + 2);
            assert(hostErrorBeepCount == beeps + 1); // not refused again yet
            refuse(code, onTheWire);
            assert(hostErrorBeepCount == beeps + 2);
            std::cout << "PASS " << code << (onTheWire ? " on the wire" : " as reader error") << " is answered once" << std::endl;
        }
    }

    // Transient errors never start suppression: the very next detection is sent.
    for (const char *code : TRANSIENT_ERRORS) {
        for (const bool onTheWire : {true, false}) {
            clearStatus();
            away(2100);
            const auto detected = server.count("CARD_DETECTED");
            nfc.setPresent(0, true); pump();
            refuse(code, onTheWire);
            nfc.setPresent(0, false); pump(150);
            nfc.setPresent(0, true); pump();
            assert(server.count("CARD_DETECTED") == detected + 2);
            refuse(code, onTheWire);
        }
    }
    // The 30 s "please tap again" timeout and a dropped connection are transient too.
    clearStatus(); away(2100);
    auto detected = server.count("CARD_DETECTED");
    nfc.setPresent(0, true); pump();
    hostAdvanceMillis(31000); pump(1100);
    nfc.setPresent(0, false); pump(150); nfc.setPresent(0, true); pump();
    assert(server.count("CARD_DETECTED") == detected + 2);
    refuse("CARD_REMOVED", true);
    server.failSends = true;
    away(250); nfc.setPresent(0, true); pump(); // never reaches the server
    server.failSends = false;
    nfc.setPresent(0, false); pump(150); nfc.setPresent(0, true); pump();
    assert(server.count("CARD_DETECTED") == detected + 3);
    refuse("CARD_REMOVED", true);
    std::cout << "PASS transient errors, the 30 s timeout and a failed send do not suppress" << std::endl;

    // A different card is never suppressed; a refusal of it replaces the first; a success clears the guard.
    clearStatus(); away(2100);
    detected = server.count("CARD_DETECTED");
    auto beeps = hostErrorBeepCount;
    nfc.setPresent(0, true); pump(); refuse("CARD_NOT_FOUND", true);
    nfc.setPresent(0, false); pump(150);
    nfc.setPresent(1, true); pump();
    assert(server.count("CARD_DETECTED") == detected + 2);
    refuse("CARD_NOT_FOUND", true);
    assert(hostErrorBeepCount == beeps + 2);
    nfc.setPresent(1, false); pump(150);
    nfc.setPresent(0, true); pump(); // B replaced A: A is checked again at once
    assert(server.count("CARD_DETECTED") == detected + 3);
    refuse("CARD_NOT_FOUND", true);
    nfc.setPresent(0, false); pump(150);
    nfc.setPresent(1, true); pump(); // and now A replaced B
    assert(server.count("CARD_DETECTED") == detected + 4);
    // B signs in: the refused A is checked normally right after, with the window still open.
    const auto signedInAt = millis();
    server.push("CARD_AUTHENTICATION_DATA", R"({"username":"Alex","language":"de","hasIntroduction":true,"requiresSupervisor":false})");
    pump(250);
    nfc.setPresent(1, false); pump(); list(); click("Abmelden");
    assert(label(lv_screen_active(), "Tap RFID card or open a resource") || lv_screen_active() == Display::resourceListScreen.getScreen());
    nfc.setPresent(0, true); pump();
    assert(static_cast<int32_t>(millis() - signedInAt) < 2000); // the window of A had not run out: the success cleared it
    assert(server.count("CARD_DETECTED") == detected + 5);
    refuse("CARD_NOT_FOUND", true);
    std::cout << "PASS other cards are never suppressed, a refusal replaces, a success clears" << std::endl;

    // A verdict for a card that arrives after another card signed in is not attributed to anyone (ATT-718): no beep,
    // no suppression of the card that is signed in, and that card is checked normally the next time.
    clearStatus(); away(2100);
    detected = server.count("CARD_DETECTED");
    beeps = hostErrorBeepCount;
    nfc.setPresent(0, true); pump(); // A is checked, the server stays silent
    hostAdvanceMillis(31000); pump(1100); // the sign-in gives up (with its own beep)
    beeps = hostErrorBeepCount;
    nfc.setPresent(0, false); pump(100);
    nfc.setPresent(1, true); pump(); // B is checked
    assert(server.count("CARD_DETECTED") == detected + 2);
    server.push("CARD_AUTHENTICATION_DATA", R"({"username":"Alex","language":"de","hasIntroduction":true,"requiresSupervisor":false})");
    pump(250);
    nfc.setPresent(1, false); pump(); list();
    refuse("CARD_NOT_FOUND", true); // A's verdict, far too late: B is signed in
    assert(hostErrorBeepCount == beeps && State::getApiState().userAuthenticated);
    click("Abmelden");
    nfc.setPresent(1, true); pump(); // B again at once: checked, not suppressed
    assert(server.count("CARD_DETECTED") == detected + 3);
    refuse("CARD_REMOVED", true);
    std::cout << "PASS a late verdict after another card's sign-in suppresses nothing" << std::endl;

    // Random UIDs (4 bytes, 0x08...) are one identity; a 7-byte 0x08... and any other 4-byte UID are not.
    const uint8_t phone1[] = {0x08, 0x01, 0x02, 0x03}, phone2[] = {0x08, 0xF0, 0xE0, 0xD0};
    const uint8_t long08[] = {0x08, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06}, plain4[] = {0x04, 0x01, 0x02, 0x03};
    away(100);
    nfc.setUid(1, phone1, 4); nfc.setUid(2, phone2, 4); nfc.setUid(3, long08, 7); nfc.setUid(0, plain4, 4);
    clearStatus(); away(2100);
    detected = server.count("CARD_DETECTED");
    beeps = hostErrorBeepCount;
    nfc.setPresent(1, true); pump(); refuse("CARD_NOT_FOUND", true);
    nfc.setPresent(1, false); pump(100);
    nfc.setPresent(2, true); pump(); // another phone within 2 s: silent
    assert(server.count("CARD_DETECTED") == detected + 1 && hostErrorBeepCount == beeps + 1 && statusUp());
    nfc.setPresent(2, false); pump(100);
    nfc.setPresent(3, true); pump(); // 7 bytes starting 0x08: its own check and beep
    assert(server.count("CARD_DETECTED") == detected + 2);
    refuse("CARD_NOT_FOUND", true);
    nfc.setPresent(3, false); pump(100);
    nfc.setPresent(0, true); pump(); // 4 bytes starting 0x04: its own check and beep
    assert(server.count("CARD_DETECTED") == detected + 3);
    refuse("CARD_NOT_FOUND", true);
    assert(hostErrorBeepCount == beeps + 3);
    nfc.setPresent(0, false); pump(100);
    nfc.setPresent(2, true); pump(); // a phone again: the plain card replaced the random identity
    assert(server.count("CARD_DETECTED") == detected + 4);
    refuse("CARD_NOT_FOUND", true);
    std::cout << "PASS random UIDs share one identity; other UID shapes do not" << std::endl;
    away(100);
    const uint8_t member[] = {0x04, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0x01};
    nfc.setUid(0, member, 7);

    // Silence lasts as long as the card is seen at least every 2 s: 30 s of detections every 250 ms.
    clearStatus(); away(2100);
    detected = server.count("CARD_DETECTED");
    beeps = hostErrorBeepCount;
    nfc.setPresent(0, true); pump(); refuse("CARD_NOT_FOUND", true);
    for (int i = 0; i < 120; ++i) { nfc.setPresent(0, false); pump(125); nfc.setPresent(0, true); pump(125); }
    assert(server.count("CARD_DETECTED") == detected + 1 && hostErrorBeepCount == beeps + 1);
    assert(!checkingCard());
    std::cout << "PASS a card seen every 250 ms for 30 s stays silent" << std::endl;

    // The screen is never touched by repeat detections; dismissed by hand, the card still lies silent for 2 s.
    away(2100); clearStatus();
    detected = server.count("CARD_DETECTED");
    nfc.setPresent(0, true); pump(); refuse("CARD_NOT_FOUND", true);
    assert(statusUp());
    display.capture(output, "refused-card-status-first");
    nfc.setPresent(0, false); pump(150); nfc.setPresent(0, true); pump(150);
    assert(statusUp() && !checkingCard());
    display.capture(output, "refused-card-status-repeated");
    clearStatus();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    nfc.setPresent(0, false); pump(150); nfc.setPresent(0, true); pump(150);
    assert(server.count("CARD_DETECTED") == detected + 1 && lv_screen_active() == Display::resourceListScreen.getScreen() && !checkingCard());
    display.capture(output, "refused-card-dismissed-retap");
    away(2100); nfc.setPresent(0, true); pump(); // nothing hung: the next tap after the absence is checked
    assert(server.count("CARD_DETECTED") == detected + 2 && checkingCard());
    refuse("CARD_NOT_FOUND", true);
    assert(statusUp());
    std::cout << "PASS a refused card never changes the screen" << std::endl;

    // The other entry path: a resource picked first, the card tapped on the lock screen.
    clearStatus(); away(2100);
    click("CNC Fräse");
    assert(lv_screen_active() == Display::lockscreen.getScreen());
    detected = server.count("CARD_DETECTED");
    beeps = hostErrorBeepCount;
    nfc.setPresent(0, true); pump(); refuse("CARD_NOT_FOUND", true);
    assert(hostErrorBeepCount == beeps + 1 && statusUp());
    for (int i = 0; i < 4; ++i) { nfc.setPresent(0, false); pump(150); nfc.setPresent(0, true); pump(150); }
    assert(server.count("CARD_DETECTED") == detected + 1 && hostErrorBeepCount == beeps + 1 && statusUp());
    display.capture(output, "refused-card-lockscreen-repeated");
    away(2100); clearStatus();
    std::cout << "PASS lock screen entry path answers a refused card once" << std::endl;

    // A language change after a refusal leaves no leak into the next presentation.
    away(2100); clearStatus();
    list(false);
    nfc.setPresent(0, true); pump(); refuse("CARD_NOT_FOUND", true);
    server.push("READER_LANGUAGE", R"({"language":"en"})"); pump();
    server.push("READER_LANGUAGE", R"({"language":"de"})"); pump();
    clearStatus(); away(2100);
    detected = server.count("CARD_DETECTED");
    nfc.setPresent(0, true); pump();
    assert(server.count("CARD_DETECTED") == detected + 1);
    refuse("CARD_NOT_FOUND", true);
    away(2100); clearStatus(); list(false);
    std::cout << "PASS refused card variants" << std::endl;
}
