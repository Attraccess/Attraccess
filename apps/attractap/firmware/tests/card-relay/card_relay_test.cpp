// The relay is the only thing between the server and the card: it must run server commands for an
// open conversation, nothing else, and it must never hold on to the card without an owner.
#include "card_relay.hpp"

#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

namespace {
void expect(bool condition, const char *message) {
    if (!condition) {
        std::fprintf(stderr, "FAIL: %s\n", message);
        std::exit(1);
    }
}

struct Fixture {
    std::vector<std::vector<uint8_t>> sentToCard;
    struct Sent { std::string id; uint32_t seq; std::vector<uint8_t> response; };
    std::vector<Sent> responses;
    std::vector<std::string> removed;
    bool cardPresent = true;
    bool active = false;
    int activeChanges = 0;
    CardRelay relay{CardRelay::Hooks{
        [this](const uint8_t *apdu, uint8_t length, uint8_t *response, uint8_t *responseLength) {
            sentToCard.emplace_back(apdu, apdu + length);
            if (!cardPresent) return false;
            response[0] = 0x91;
            response[1] = 0x00;
            *responseLength = 2;
            return true;
        },
        [this](const char *id, uint32_t seq, const uint8_t *response, uint8_t length) {
            responses.push_back({id, seq, std::vector<uint8_t>(response, response + length)});
        },
        [this](const char *id) { removed.push_back(id); },
        [this](bool value) { active = value; ++activeChanges; }}};
};

const uint8_t command[] = {0x90, 0x60, 0x00, 0x00, 0x00};

void ignoresCommandsWithoutAnnouncedCard() {
    Fixture f;
    f.relay.onApdu(0, "c1", 1, command, sizeof(command));
    f.relay.onApdu(1, "c1", 1, command, sizeof(command));
    f.relay.loop(10);
    expect(f.sentToCard.empty(), "a command nobody asked for must not reach the card");
    expect(f.responses.empty(), "and must not be answered");
}

void relaysOneCommandAtATime() {
    Fixture f;
    const uint32_t d = f.relay.begin(0);
    expect(f.active, "the NFC front end learns a conversation is open");
    f.relay.onApdu(d, "c1", 1, command, sizeof(command));
    f.relay.loop(5);
    expect(f.sentToCard.size() == 1 && f.responses.size() == 1, "one command, one answer");
    expect(f.responses[0].id == "c1" && f.responses[0].seq == 1, "the answer carries the server's ids");
    expect((f.responses[0].response == std::vector<uint8_t>{0x91, 0x00}), "the card's answer goes back as it is");
    f.relay.loop(6);
    expect(f.sentToCard.size() == 1, "a command is executed once");
}

void ignoresOtherConversations() {
    Fixture f;
    const uint32_t d = f.relay.begin(0);
    f.relay.onApdu(d, "c1", 1, command, sizeof(command));
    f.relay.loop(1);
    f.relay.onApdu(d, "other", 1, command, sizeof(command));
    f.relay.loop(2);
    expect(f.sentToCard.size() == 1, "commands of another conversation never reach the card");
    f.relay.onConversationEnd(d, "other");
    expect(f.relay.active(), "an end for another conversation changes nothing");
}

void rejectsOversizedCommands() {
    Fixture f;
    const uint32_t d = f.relay.begin(0);
    uint8_t big[63] = {0};
    f.relay.onApdu(d, "c1", 1, big, sizeof(big));
    f.relay.loop(1);
    expect(f.sentToCard.empty(), "a 63-byte command does not fit the PN532 and is dropped");
}

void reportsAPulledCardAndStops() {
    Fixture f;
    const uint32_t d = f.relay.begin(0);
    f.cardPresent = false;
    f.relay.onApdu(d, "c1", 1, command, sizeof(command));
    f.relay.loop(1);
    expect(f.responses.empty() && f.removed == std::vector<std::string>{"c1"}, "no invented answer, the server is told");
    expect(!f.relay.active() && !f.active, "the conversation is over");
}

void serverEndClosesTheConversation() {
    Fixture f;
    const uint32_t d = f.relay.begin(0);
    f.relay.onApdu(d, "c1", 1, command, sizeof(command));
    f.relay.onConversationEnd(d, "c1");
    f.relay.loop(1);
    expect(f.sentToCard.empty(), "a command parked before the end is not executed after it");
    expect(!f.relay.active() && !f.active, "the card is free again");
}

void neverHoldsTheCardWithoutAnOwner() {
    Fixture f;
    f.relay.begin(100);
    f.relay.loop(100 + CardRelay::MAX_CONVERSATION_MS - 1);
    expect(f.relay.active(), "still within the server's limit");
    f.relay.loop(100 + CardRelay::MAX_CONVERSATION_MS + 1);
    expect(!f.relay.active() && !f.active, "a conversation the server never ended is dropped");
}

void cancelFreesTheCard() {
    Fixture f;
    f.relay.begin(0);
    f.relay.cancel();
    expect(!f.relay.active() && !f.active, "cancel frees the card");
}

void newConversationStartsClean() {
    Fixture f;
    const uint32_t first = f.relay.begin(0);
    f.relay.onApdu(first, "old", 1, command, sizeof(command));
    const uint32_t second = f.relay.begin(10);
    expect(second != first, "every card presentation gets its own detection id");
    f.relay.loop(11);
    expect(f.sentToCard.empty(), "a command of the previous conversation is forgotten");
    f.relay.onApdu(second, "new", 1, command, sizeof(command));
    f.relay.loop(12);
    expect(f.responses.size() == 1 && f.responses[0].id == "new", "the new conversation works");
}

void ignoresMessagesForAnEarlierCard() {
    Fixture f;
    const uint32_t earlier = f.relay.begin(0);
    const uint32_t current = f.relay.begin(10);
    f.relay.onApdu(earlier, "c1", 1, command, sizeof(command));
    f.relay.loop(11);
    expect(f.sentToCard.empty(), "a command for an earlier card never reaches the card on the reader now");
    f.relay.onConversationEnd(earlier, nullptr);
    f.relay.onConversationEnd(earlier, "c1");
    expect(f.relay.active(), "an end for an earlier card does not close the current one");
    f.relay.onApdu(current, "c1", 1, command, sizeof(command));
    f.relay.loop(12);
    expect(f.responses.size() == 1, "the current card's own commands still work");
}

void endWithoutCommandsClosesTheDetection() {
    // The server answered with an error (unknown card, busy, ...) and never sent a command.
    Fixture f;
    const uint32_t d = f.relay.begin(0);
    f.relay.onConversationEnd(d, nullptr);
    expect(!f.relay.active() && !f.active, "the reader can probe and detect cards again at once");
}

void acceptsTheLongestCommandThePn532Takes() {
    Fixture f;
    const uint32_t d = f.relay.begin(0);
    uint8_t longest[CardRelay::MAX_APDU_LENGTH] = {0};
    static_assert(sizeof(longest) == 62, "the PN532 takes 62 command bytes in one InDataExchange");
    f.relay.onApdu(d, "c1", 1, longest, sizeof(longest));
    f.relay.loop(1);
    expect(f.sentToCard.size() == 1 && f.sentToCard[0].size() == 62, "a 62-byte command is relayed");
}

void rejectsOverlongConversationIds() {
    Fixture f;
    const uint32_t d = f.relay.begin(0);
    const std::string tooLong(CardRelay::MAX_CONVERSATION_ID_LENGTH, 'a');
    f.relay.onApdu(d, tooLong.c_str(), 1, command, sizeof(command));
    f.relay.loop(1);
    expect(f.sentToCard.empty(), "a conversation id that does not fit is not adopted");
    const std::string longest(CardRelay::MAX_CONVERSATION_ID_LENGTH - 1, 'b');
    f.relay.onApdu(d, longest.c_str(), 1, command, sizeof(command));
    f.relay.loop(2);
    expect(f.responses.size() == 1 && f.responses[0].id == longest, "the longest id that fits works unchanged");
}
}

int main() {
    ignoresCommandsWithoutAnnouncedCard();
    relaysOneCommandAtATime();
    ignoresOtherConversations();
    rejectsOversizedCommands();
    reportsAPulledCardAndStops();
    serverEndClosesTheConversation();
    neverHoldsTheCardWithoutAnOwner();
    cancelFreesTheCard();
    newConversationStartsClean();
    ignoresMessagesForAnEarlierCard();
    endWithoutCommandsClosesTheDetection();
    acceptsTheLongestCommandThePn532Takes();
    rejectsOverlongConversationIds();
    std::puts("PASS card relay");
}
