#include "workflow.hpp"

namespace {
std::string apdu(uint32_t detectionId, const char *conversationId, unsigned seq, const char *hex) {
    return std::string("{\"detectionId\":") + std::to_string(detectionId) + ",\"conversationId\":\"" + conversationId +
           "\",\"seq\":" + std::to_string(seq) + ",\"apdu\":\"" + hex + "\"}";
}
std::string end(uint32_t detectionId, const char *conversationId = nullptr) {
    std::string payload = std::string("{\"detectionId\":") + std::to_string(detectionId);
    if (conversationId) payload += std::string(",\"conversationId\":\"") + conversationId + "\"";
    return payload + "}";
}
}

// ATT-1145: the reader relays complete APDUs for the server and holds no card keys or session.
void ReaderWorkflow::testCardRelay()
{
    list();
    const auto detectedBefore = server.count("CARD_DETECTED");
    const auto acksBefore = server.count("ACK_CARD_APDU");

    const auto responsesBefore = server.count("CARD_APDU_RESPONSE");
    const auto removedBefore = server.count("CARD_REMOVED");

    nfc.setPresent(0, true); pump();
    assert(server.count("CARD_DETECTED") == detectedBefore + 1);
    assert(server.last("CARD_DETECTED")["data"]["payload"]["purpose"] == "tap");
    assert(server.last("CARD_DETECTED")["data"]["payload"]["detectionId"].is<uint32_t>());
    const uint32_t first = server.last("CARD_DETECTED")["data"]["payload"]["detectionId"];

    // GetVersion on the NTAG 424: the card's own answer goes back, tagged with the server's ids.
    server.push("CARD_APDU", apdu(first, "c-1", 1, "9060000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 1);
    auto response = server.last("CARD_APDU_RESPONSE");
    assert(response["data"]["payload"]["conversationId"] == "c-1");
    assert(response["data"]["payload"]["seq"] == 1);
    assert(response["data"]["payload"]["response"] == "04040230001105" "91af");

    // The next command of the same conversation is relayed too; another conversation's is not.
    server.push("CARD_APDU", apdu(first, "other", 7, "90af000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 1);
    // A command for an earlier card (another detection id) is not relayed either.
    server.push("CARD_APDU", apdu(first - 1, "c-1", 2, "90af000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 1);
    // Nor does an end for an earlier card close this conversation.
    server.push("CARD_CONVERSATION_END", end(first - 1)); pump();
    server.push("CARD_APDU", apdu(first, "c-1", 2, "90af000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 2);
    assert(server.last("CARD_APDU_RESPONSE")["data"]["payload"]["seq"] == 2);

    // Commands are not acknowledged one by one: that would only slow the tap down.
    assert(server.count("ACK_CARD_APDU") == acksBefore);

    // After the conversation ended, nothing reaches the card any more.
    server.push("CARD_CONVERSATION_END", end(first, "c-1")); pump();
    server.push("CARD_APDU", apdu(first, "c-1", 3, "90af000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 2);

    // The server rejects the card; the reader shows it and is ready for the next presentation.
    server.push("CARD_AUTHENTICATION_DATA", R"({"error":"CARD_AUTHENTICATION_FAILED"})"); pump();
    assert(label(lv_layer_top(), "Anmeldung fehlgeschlagen") || label(lv_layer_top(), "Sign-in failed"));
    assert(label(lv_layer_top(), "Bitte eine gültige RFID-Karte auflegen.") ||
           label(lv_layer_top(), "Please tap a valid RFID card."));
    Display::hidePopup();

    // A command too long for the PN532 is dropped before it gets near the card.
    nfc.setPresent(0, false); pump(); nfc.setPresent(0, true); pump();
    assert(server.count("CARD_DETECTED") == detectedBefore + 2);
    const uint32_t second = server.last("CARD_DETECTED")["data"]["payload"]["detectionId"];
    assert(second != first);
    server.push("CARD_APDU", apdu(second, "c-2", 1, std::string(2 * 63, '0').c_str())); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 2);
    // A stale command from the first card cannot take over the second card's conversation.
    server.push("CARD_APDU", apdu(first, "c-1", 4, "9060000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 2);

    // The card leaves mid-conversation: the reader tells the server instead of inventing an answer.
    server.push("CARD_APDU", apdu(second, "c-2", 1, "9060000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 3);
    nfc.setPresent(0, false);
    server.push("CARD_APDU", apdu(second, "c-2", 2, "90af000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 3);
    assert(server.count("CARD_REMOVED") == removedBefore + 1);
    assert(server.last("CARD_REMOVED")["data"]["payload"]["conversationId"] == "c-2");
    // The server names the reason, so the member knows to hold the card longer.
    server.push("CARD_AUTHENTICATION_DATA", R"({"error":"CARD_REMOVED"})");
    server.push("CARD_CONVERSATION_END", end(second, "c-2")); pump();
    assert(label(lv_layer_top(), "Karte zu früh entfernt") || label(lv_layer_top(), "Card removed too early"));
    Display::hidePopup();

    // The server turns a card away before any command (here: busy) and ends the detection at once:
    // the reader does not wait 20 s for commands that never come.
    nfc.setPresent(0, true); pump();
    assert(server.count("CARD_DETECTED") == detectedBefore + 3);
    const uint32_t third = server.last("CARD_DETECTED")["data"]["payload"]["detectionId"];
    server.push("CARD_AUTHENTICATION_DATA", R"({"error":"BUSY"})");
    server.push("CARD_CONVERSATION_END", end(third)); pump();
    assert(label(lv_layer_top(), "Server ausgelastet, bitte erneut versuchen") ||
           label(lv_layer_top(), "Server busy, please try again"));
    server.push("CARD_APDU", apdu(third, "c-3", 1, "9060000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 3);
    Display::hidePopup(); nfc.setPresent(0, false); pump();

    // Whatever the card did, no key or session state is in anything the reader sent.
    for (const auto &message : server.sent) {
        assert(message.find("\"key\"") == std::string::npos);
        assert(message.find("keyBytes") == std::string::npos);
    }
    std::cout << "PASS card relay" << std::endl;
}
