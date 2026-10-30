#include "workflow.hpp"

namespace {
std::string apdu(const char *conversationId, unsigned seq, const char *hex) {
    return std::string("{\"conversationId\":\"") + conversationId + "\",\"seq\":" + std::to_string(seq) + ",\"apdu\":\"" + hex + "\"}";
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

    // GetVersion on the NTAG 424: the card's own answer goes back, tagged with the server's ids.
    server.push("CARD_APDU", apdu("c-1", 1, "9060000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 1);
    auto response = server.last("CARD_APDU_RESPONSE");
    assert(response["data"]["payload"]["conversationId"] == "c-1");
    assert(response["data"]["payload"]["seq"] == 1);
    assert(response["data"]["payload"]["response"] == "04040230001105" "91af");

    // The next command of the same conversation is relayed too; another conversation's is not.
    server.push("CARD_APDU", apdu("other", 7, "90af000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 1);
    server.push("CARD_APDU", apdu("c-1", 2, "90af000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 2);
    assert(server.last("CARD_APDU_RESPONSE")["data"]["payload"]["seq"] == 2);

    // Commands are not acknowledged one by one: that would only slow the tap down.
    assert(server.count("ACK_CARD_APDU") == acksBefore);

    // After the conversation ended, nothing reaches the card any more.
    server.push("CARD_CONVERSATION_END", R"({"conversationId":"c-1"})"); pump();
    server.push("CARD_APDU", apdu("c-1", 3, "90af000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 2);

    // The server rejects the card; the reader shows it and is ready for the next presentation.
    server.push("CARD_AUTHENTICATION_DATA", R"({"error":"CARD_AUTHENTICATION_FAILED"})"); pump();
    Display::hidePopup();

    // A command too long for the PN532 is dropped before it gets near the card.
    nfc.setPresent(0, false); pump(); nfc.setPresent(0, true); pump();
    assert(server.count("CARD_DETECTED") == detectedBefore + 2);
    server.push("CARD_APDU", apdu("c-2", 1, std::string(2 * 63, '0').c_str())); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 2);

    // The card leaves mid-conversation: the reader tells the server instead of inventing an answer.
    server.push("CARD_APDU", apdu("c-2", 1, "9060000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 3);
    nfc.setPresent(0, false);
    server.push("CARD_APDU", apdu("c-2", 2, "90af000000")); pump();
    assert(server.count("CARD_APDU_RESPONSE") == responsesBefore + 3);
    assert(server.count("CARD_REMOVED") == removedBefore + 1);
    assert(server.last("CARD_REMOVED")["data"]["payload"]["conversationId"] == "c-2");

    // Whatever the card did, no key or session state is in anything the reader sent.
    for (const auto &message : server.sent) {
        assert(message.find("\"key\"") == std::string::npos);
        assert(message.find("keyBytes") == std::string::npos);
    }
    std::cout << "PASS card relay" << std::endl;
}
