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
    f.relay.onApdu("c1", 1, command, sizeof(command));
    f.relay.loop(10);
    expect(f.sentToCard.empty(), "a command nobody asked for must not reach the card");
    expect(f.responses.empty(), "and must not be answered");
}

void relaysOneCommandAtATime() {
    Fixture f;
    f.relay.begin(0);
    expect(f.active, "the NFC front end learns a conversation is open");
    f.relay.onApdu("c1", 1, command, sizeof(command));
    f.relay.loop(5);
    expect(f.sentToCard.size() == 1 && f.responses.size() == 1, "one command, one answer");
    expect(f.responses[0].id == "c1" && f.responses[0].seq == 1, "the answer carries the server's ids");
    expect((f.responses[0].response == std::vector<uint8_t>{0x91, 0x00}), "the card's answer goes back as it is");
    f.relay.loop(6);
    expect(f.sentToCard.size() == 1, "a command is executed once");
}

void ignoresOtherConversations() {
    Fixture f;
    f.relay.begin(0);
    f.relay.onApdu("c1", 1, command, sizeof(command));
    f.relay.loop(1);
    f.relay.onApdu("other", 1, command, sizeof(command));
    f.relay.loop(2);
    expect(f.sentToCard.size() == 1, "commands of another conversation never reach the card");
    f.relay.onConversationEnd("other");
    expect(f.relay.active(), "an end for another conversation changes nothing");
}

void rejectsOversizedCommands() {
    Fixture f;
    f.relay.begin(0);
    uint8_t big[63] = {0};
    f.relay.onApdu("c1", 1, big, sizeof(big));
    f.relay.loop(1);
    expect(f.sentToCard.empty(), "a command that does not fit the PN532 is dropped");
}

void reportsAPulledCardAndStops() {
    Fixture f;
    f.relay.begin(0);
    f.cardPresent = false;
    f.relay.onApdu("c1", 1, command, sizeof(command));
    f.relay.loop(1);
    expect(f.responses.empty() && f.removed == std::vector<std::string>{"c1"}, "no invented answer, the server is told");
    expect(!f.relay.active() && !f.active, "the conversation is over");
}

void serverEndClosesTheConversation() {
    Fixture f;
    f.relay.begin(0);
    f.relay.onApdu("c1", 1, command, sizeof(command));
    f.relay.onConversationEnd("c1");
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
    f.relay.begin(0);
    f.relay.onApdu("old", 1, command, sizeof(command));
    f.relay.begin(10);
    f.relay.loop(11);
    expect(f.sentToCard.empty(), "a command of the previous conversation is forgotten");
    f.relay.onApdu("new", 1, command, sizeof(command));
    f.relay.loop(12);
    expect(f.responses.size() == 1 && f.responses[0].id == "new", "the new conversation works");
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
    std::puts("PASS card relay");
}
