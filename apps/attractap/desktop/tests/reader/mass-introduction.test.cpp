#include "workflow.hpp"

namespace {
lv_obj_t *labelWithPrefix(lv_obj_t *root, const std::string &prefix) {
    if (!root) return nullptr;
    if (lv_obj_check_type(root, &lv_label_class) && std::string(lv_label_get_text(root)).rfind(prefix, 0) == 0) return root;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (auto *found = labelWithPrefix(lv_obj_get_child(root, i), prefix)) return found;
    return nullptr;
}

std::string start(const char *sessionId, uint32_t remainingMs = 900000) {
    return std::string("{\"sessionId\":\"") + sessionId +
           R"(","targetName":"Lasercutter","introducerUsername":"Robin","remainingMs":)" + std::to_string(remainingMs) + "}";
}

std::string key(const char *sessionId, const char *username, const char *keyHex = "00000000000000000000000000000000") {
    return std::string("{\"sessionId\":\"") + sessionId + "\",\"keyNo\":0,\"key\":\"" + keyHex + "\",\"username\":\"" + username + "\"}";
}

std::string result(const char *username, bool alreadyIntroduced, unsigned participantCount) {
    return std::string(R"({"sessionId":"session-a","success":true,"username":")") + username +
           "\",\"alreadyIntroduced\":" + (alreadyIntroduced ? "true" : "false") +
           ",\"participantCount\":" + std::to_string(participantCount) + "}";
}

std::string sessionOf(const JsonDocument &message) { return message["data"]["payload"]["sessionId"].as<std::string>(); }
std::string uidOf(const JsonDocument &message) { return message["data"]["payload"]["uid"].as<std::string>(); }
}

// ATT-1151: the production API parser, application routing, NFC verification and scan screen
// against a simulated server.
void ReaderWorkflow::testMassIntroduction()
{
    const char *authRequest = "REQUEST_MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA";
    const char *confirmed = "MASS_INTRODUCTION_CARD_AUTH_CONFIRMED";
    const char *cancel = "MASS_INTRODUCTION_CANCEL";
    auto onScanScreen = [] { return lv_screen_active() == Display::massIntroductionScreen.getScreen(); };
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());

    // START shows the scan screen with target, introducer, counter and countdown.
    server.push("MASS_INTRODUCTION_START", start("session-a")); pump();
    assert(onScanScreen());
    requireLabel(lv_screen_active(), "Sammeleinweisung");
    requireLabel(lv_screen_active(), "Lasercutter");
    requireLabel(lv_screen_active(), "Bereit für die nächste Karte");
    requireLabel(lv_screen_active(), "Karte auflegen, um eingewiesen zu werden\nEinweiser: Robin");
    assert(label(lv_screen_active(), "0 eingewiesen · noch 15:00") || label(lv_screen_active(), "0 eingewiesen · noch 14:59"));
    display.capture(output, "13-mass-introduction-waiting");
    server.push("READER_LANGUAGE", R"({"language":"en"})"); pump();
    requireLabel(lv_screen_active(), "Mass introduction");
    requireLabel(lv_screen_active(), "Ready for the next card");
    requireLabel(lv_screen_active(), "Tap your card to get introduced\nIntroducer: Robin");
    assert(labelWithPrefix(lv_screen_active(), "0 introduced · "));
    display.capture(output, "13-mass-introduction-waiting-english");
    server.push("READER_LANGUAGE", R"({"language":"de"})"); pump();

    // A repeated START is a duplicate; a different session is refused while this one runs.
    server.push("MASS_INTRODUCTION_START", start("session-a")); pump();
    assert(server.count(cancel) == 0 && onScanScreen());
    server.push("MASS_INTRODUCTION_START", start("session-x")); pump();
    assert(server.count(cancel) == 1 && sessionOf(server.last(cancel)) == "session-x" && onScanScreen());

    // Tap: request the key, authenticate locally, confirm; only then the server introduces.
    nfc.setPresent(0, true); pump();
    assert(server.count(authRequest) == 1);
    assert(sessionOf(server.last(authRequest)) == "session-a" && uidOf(server.last(authRequest)) == "04aabbccddee01");
    requireLabel(lv_screen_active(), "Karte gelesen...\nbitte nicht bewegen");
    server.push("MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA", key("other-session", "Mallory")); pump();
    assert(server.count(confirmed) == 0);
    server.push("MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA", key("session-a", "Alex")); pump();
    assert(server.count(confirmed) == 1);
    assert(sessionOf(server.last(confirmed)) == "session-a" && uidOf(server.last(confirmed)) == "04aabbccddee01");
    server.push("MASS_INTRODUCTION_RESULT", result("Alex", false, 1)); pump();
    requireLabel(lv_screen_active(), "Alex eingewiesen");
    assert(labelWithPrefix(lv_screen_active(), "1 eingewiesen · noch "));
    display.capture(output, "14-mass-introduction-introduced");

    // A card left on the reader is not processed again; the result gives way to waiting.
    pump(3200);
    assert(server.count(authRequest) == 1);
    requireLabel(lv_screen_active(), "Bereit für die nächste Karte");
    nfc.setPresent(0, false); pump();

    nfc.setPresent(1, true); pump();
    assert(server.count(authRequest) == 2 && uidOf(server.last(authRequest)) == "04aabbccddee02");
    server.push("MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA", key("session-a", "Robin")); pump();
    assert(server.count(confirmed) == 2);
    server.push("MASS_INTRODUCTION_RESULT", result("Robin", true, 1)); pump();
    requireLabel(lv_screen_active(), "Robin war bereits eingewiesen");
    display.capture(output, "15-mass-introduction-already-introduced");

    // Server rejections stay in the flow and are shown in-screen, not as the generic popup. The
    // next card cuts the result dwell short.
    nfc.setPresent(1, false); pump();
    nfc.setPresent(2, true); pump();
    assert(server.count(authRequest) == 3);
    server.push("MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA", R"({"sessionId":"session-a","error":"CARD_NOT_FOUND"})"); pump();
    requireLabel(lv_screen_active(), "Karte nicht gefunden");
    assert(!label(lv_layer_top(), "Karte nicht gefunden") && server.count(confirmed) == 2);
    display.capture(output, "16-mass-introduction-card-not-found");
    nfc.setPresent(2, false); pump();

    // A card that fails crypto authentication is never confirmed.
    nfc.setPresent(3, true); pump();
    assert(server.count(authRequest) == 4);
    server.push("MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA", key("session-a", "Sam", "ffffffffffffffffffffffffffffffff")); pump();
    requireLabel(lv_screen_active(), "Karte konnte nicht\ngelesen werden");
    assert(server.count(confirmed) == 2 && onScanScreen());
    nfc.setPresent(3, false); pump();
    nfc.setPresent(3, true); pump();
    assert(server.count(authRequest) == 5);
    server.push("MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA", key("session-a", "Sam")); pump();
    server.push("MASS_INTRODUCTION_RESULT", R"({"sessionId":"session-a","success":false,"error":"CARD_MISMATCH"})"); pump();
    requireLabel(lv_screen_active(), "Karte stimmt nicht überein");
    nfc.setPresent(3, false); pump();

    // END for another session is ignored; END for this one returns to the normal UI.
    server.push("MASS_INTRODUCTION_END", R"({"sessionId":"other-session","reason":"expired"})"); pump();
    assert(onScanScreen());
    server.push("MASS_INTRODUCTION_END", R"({"sessionId":"session-a","reason":"revoked"})"); pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(server.count(cancel) == 1);
    std::cout << "PASS mass introduction card journey" << std::endl;

    // The reader's cancel button leaves and tells the server.
    server.push("MASS_INTRODUCTION_START", start("session-b")); pump();
    assert(onScanScreen());
    pump(1100); click("Abbrechen");
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(server.count(cancel) == 2 && sessionOf(server.last(cancel)) == "session-b");

    // The local countdown ends the session even without an END.
    server.push("MASS_INTRODUCTION_START", start("session-c", 1500)); pump();
    assert(onScanScreen());
    pump(1700);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(server.count(cancel) == 3 && sessionOf(server.last(cancel)) == "session-c");

    // A disconnect returns to the normal UI; the server detaches the reader on its own.
    server.push("MASS_INTRODUCTION_START", start("session-d")); pump();
    assert(onScanScreen());
    State::setWebsocketState(false, "reader.test", 80, false); pump();
    assert(lv_screen_active() == Display::initScreen.getScreen());
    State::setWebsocketState(true, "reader.test", 80, false);
    State::setApiState(true, "Test reader"); list(false); pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(server.count(cancel) == 3);

    // A signed-in reader refuses the arm, so the server can detach it straight away.
    login();
    server.push("MASS_INTRODUCTION_START", start("session-e")); pump();
    assert(!onScanScreen());
    assert(server.count(cancel) == 4 && sessionOf(server.last(cancel)) == "session-e");
    click("Abmelden");
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    std::cout << "PASS mass introduction cancel, expiry, disconnect and refusal" << std::endl;
}
