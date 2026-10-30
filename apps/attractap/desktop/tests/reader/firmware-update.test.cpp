#include "workflow.hpp"

void ReaderWorkflow::testFirmwareUpdate(bool reset)
{
    list(false, true);
    pump(2000);
    server.push(reset ? "RESET_NFC_CARD" : "ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO",
                R"({"username":"Alex"})");
    pump();
    assert(lv_screen_active() == (reset ? Display::resetScreen.getScreen() : Display::enrollmentScreen.getScreen()));

    // A pending card presentation must be canceled before the flow can report
    // suspended NFC as a failed write or failed available-key lookup.
    nfc.setPresent(0, true);
    const auto resultsBefore = server.count("CARD_DETECTED");
    assert(api.prepareFirmwareUpdate());
    pump(400);
    assert(lv_screen_active() == Display::firmwareUpdateScreen.getScreen());
    assert(server.count(reset ? "RESET_NFC_CARD_CANCEL" : "ENROLL_NEW_CARD_CANCEL") == 1);

    // Old replies and new card requests cannot steal OTA's screen or restart
    // either sticky card workflow, even when the network subsequently drops.
    server.push("ENROLL_NEW_CARD", R"({"keyNo":1,"key":"00000000000000000000000000000000"})");
    server.push("ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO", R"({"username":"Alex"})");
    server.push("RESET_NFC_CARD", R"({"username":"Alex","keyNo":1,"key":"00000000000000000000000000000000"})");
    pump();
    State::setWebsocketState(false, "reader.test", 80, false);
    pump();
    assert(lv_screen_active() == Display::firmwareUpdateScreen.getScreen());
    assert(server.count("CARD_DETECTED") == resultsBefore);
    assert(nfc.card(0).keys[1] == VirtualNfc::factoryKey());
    assert(!nfc.isCardPresent());
    std::cout << "PASS OTA interrupts " << (reset ? "reset" : "enrollment") << " without card failures\n";
}
