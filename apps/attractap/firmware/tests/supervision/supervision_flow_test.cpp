#include "../../src/application/supervision.hpp"

#include <cstdlib>
#include <iostream>

namespace {
void expect(bool condition, const char *message) {
    if (!condition) {
        std::cerr << "FAILED: " << message << '\n';
        std::exit(1);
    }
}

struct Fixture {
    API api;
    NFC nfc;
    Beeper beeper;
    Logger logger;
    SupervisionScreen screen;
    SupervisionFlow flow{api, nfc, beeper, logger, screen};

    Fixture() { flow.setup(); }
    void beginReader() {
        supervisionTestNowMs = 100;
        flow.beginReaderInitiated("requester", 42);
    }
};

void cancelWinsOverResolution() {
    Fixture fixture;
    fixture.beginReader();
    fixture.flow.onResolved({.success = true});
    fixture.flow.requestCancel();

    expect(fixture.flow.tick(101) == SupervisionFlow::Outcome::ReturnToRouting,
           "cancel must win over a concurrent resolution");
    expect(fixture.api.cancels == 1, "cancel must be reported to the API");
    expect(fixture.beeper.successes == 0, "cancel must not show success");
}

void successfulResolutionSettlesFlow() {
    Fixture fixture;
    fixture.beginReader();
    fixture.flow.onRequestResult({.success = true});
    fixture.flow.onResolved({.success = true});

    expect(fixture.flow.tick(101) == SupervisionFlow::Outcome::None,
           "resolution first renders its confirmation");
    expect(fixture.screen.lastView.status == SupervisionScreen::STATUS_SUCCESS,
           "terminal success must not be replaced by a waiting hint");
    fixture.flow.requestCancel();
    expect(fixture.flow.tick(102) == SupervisionFlow::Outcome::None,
           "late cancellation after success must be ignored");
    expect(fixture.api.cancels == 0, "settled success must not cancel the API request");
    expect(fixture.flow.tick(1302) == SupervisionFlow::Outcome::Unlock,
           "reader success must unlock after its dwell");
}

void rejectedCardRecovers() {
    Fixture fixture;
    fixture.beginReader();
    const uint8_t uid[] = {1};
    fixture.flow.onCardDetected(uid, sizeof(uid));
    fixture.flow.tick(101);
    fixture.flow.onCardAuthentication({.error = "SUPERVISOR_NOT_AUTHORIZED"});
    fixture.flow.tick(102);

    expect(fixture.screen.lastView.status == SupervisionScreen::STATUS_ERROR,
           "rejected card must show a recoverable error");
    fixture.flow.tick(1903);
    expect(fixture.screen.lastView.status == SupervisionScreen::STATUS_WAITING,
           "recoverable card rejection must return to waiting");
}

void terminalFailureReturnsAfterDwell() {
    Fixture fixture;
    fixture.beginReader();
    fixture.flow.onResolved({.success = false, .error = "SUPERVISION_FAILED"});
    fixture.flow.tick(101);

    expect(fixture.screen.lastView.status == SupervisionScreen::STATUS_ERROR,
           "failed resolution must show a terminal error");
    fixture.flow.requestCancel();
    expect(fixture.flow.tick(102) == SupervisionFlow::Outcome::None,
            "late cancellation must not replace a terminal failure");
    expect(fixture.api.cancels == 0, "terminal failure must not send a cancellation");
    fixture.flow.onResolved({.success = true});
    expect(fixture.flow.tick(103) == SupervisionFlow::Outcome::None,
            "late success must not replace a terminal failure");
    expect(fixture.screen.lastView.status == SupervisionScreen::STATUS_ERROR,
            "terminal failure must remain visible after a late success");
    expect(fixture.flow.tick(1902) == SupervisionFlow::Outcome::ReturnToRouting,
            "terminal failure must return to routing after its dwell");
}

void webInitiatedFlowDoesNotUnlockLocally() {
    Fixture fixture;
    supervisionTestNowMs = 100;
    fixture.flow.armWebInitiated({.resourceId = 42, .timeoutMs = 30000, .requesterUsername = "requester"});
    expect(fixture.flow.takePendingWebStart(101, false), "web arm must start the flow");
    const uint8_t uid[] = {1};
    fixture.flow.onCardDetected(uid, sizeof(uid));
    fixture.flow.tick(102);
    API::SupervisorCardAuthenticationResponse cardAuth;
    cardAuth.keyLen = 16;
    fixture.flow.onCardAuthentication(cardAuth);
    fixture.flow.tick(103);
    expect(fixture.api.confirmations == 1, "web flow must confirm card authentication with the API");
    fixture.flow.onResolved({.success = true});
    fixture.flow.tick(104);
    expect(fixture.flow.tick(1305) == SupervisionFlow::Outcome::ReturnToRouting,
           "web-initiated success must not unlock locally");
}

void duplicateWebStartsDoNotCancelAcceptedFlow() {
    Fixture fixture;
    supervisionTestNowMs = 100;
    fixture.flow.armWebInitiated({.resourceId = 41, .timeoutMs = 30000, .requesterUsername = "first"});
    supervisionTestNowMs = 101;
    fixture.flow.armWebInitiated({.resourceId = 42, .timeoutMs = 30000, .requesterUsername = "second"});

    expect(fixture.flow.takePendingWebStart(102, false), "a queued web arm must start the flow");
    expect(!fixture.flow.takePendingWebStart(103, true),
           "duplicate web arms must not remain queued after the flow starts");
    expect(fixture.api.cancels == 0, "a stale duplicate must not cancel the accepted web flow");
}

void webStartPreservesFollowingResolution() {
    Fixture fixture;
    supervisionTestNowMs = 100;
    fixture.flow.armWebInitiated({.resourceId = 42, .timeoutMs = 30000, .requesterUsername = "requester"});
    fixture.flow.onResolved({.success = true});

    expect(fixture.flow.takePendingWebStart(101, false), "web arm must start the flow");
    expect(fixture.flow.tick(102) == SupervisionFlow::Outcome::None,
           "resolution queued after a web start must be retained");
    expect(fixture.screen.lastView.status == SupervisionScreen::STATUS_SUCCESS,
           "retained resolution must settle the web flow");
}

void readerInitiationReleasesRacingWebArm() {
    Fixture fixture;
    supervisionTestNowMs = 100;
    fixture.flow.armWebInitiated({.resourceId = 42, .timeoutMs = 30000, .requesterUsername = "requester"});
    fixture.beginReader();

    expect(fixture.api.cancels == 1, "reader initiation must release a queued web arm");
    expect(fixture.api.requests == 1, "reader initiation must still request supervision");
}

void readerCardSuccessUnlocksAndResets() {
    Fixture fixture;
    fixture.beginReader();
    const uint8_t uid[] = {1};
    fixture.flow.onCardDetected(uid, sizeof(uid));
    fixture.flow.tick(101);
    expect(fixture.api.cardAuthRequests == 1, "reader card must request authentication data");
    expect(fixture.api.lastCardAuthResourceId == 42,
           "reader card authentication must use the reader flow resource");

    API::SupervisorCardAuthenticationResponse cardAuth;
    cardAuth.keyLen = 16;
    fixture.flow.onCardAuthentication(cardAuth);
    expect(fixture.flow.tick(102) == SupervisionFlow::Outcome::UnlockAndStartSession,
           "reader card success must unlock and start a session");
    expect(!fixture.flow.active(), "reader card success must reset the flow");
}

void resolutionWinsOverCardAuthentication() {
    Fixture fixture;
    fixture.beginReader();
    const uint8_t uid[] = {1};
    fixture.flow.onCardDetected(uid, sizeof(uid));
    fixture.flow.tick(101);

    API::SupervisorCardAuthenticationResponse cardAuth;
    cardAuth.keyLen = 16;
    fixture.flow.onCardAuthentication(cardAuth);
    fixture.flow.onResolved({.success = true});

    expect(fixture.flow.tick(102) == SupervisionFlow::Outcome::None,
           "web resolution must win over a concurrent card authentication");
    expect(fixture.screen.lastView.status == SupervisionScreen::STATUS_SUCCESS,
           "winning web resolution must show success");
    expect(fixture.flow.tick(1303) == SupervisionFlow::Outcome::Unlock,
           "card authentication must not produce a second terminal outcome");
}

void terminalFailureWinsOverCardRejection() {
    Fixture fixture;
    fixture.beginReader();
    const uint8_t uid[] = {1};
    fixture.flow.onCardDetected(uid, sizeof(uid));
    fixture.flow.tick(101);
    fixture.flow.onCardAuthentication({.error = "SUPERVISOR_NOT_AUTHORIZED"});
    fixture.flow.onResolved({.success = false, .error = "SUPERVISION_FAILED"});

    fixture.flow.tick(102);
    expect(fixture.flow.tick(1903) == SupervisionFlow::Outcome::ReturnToRouting,
           "terminal failure must not be replaced by a recoverable card rejection");
}

void disconnectClearsActivePendingAndQueuedWork() {
    Fixture fixture;
    supervisionTestNowMs = 100;
    fixture.flow.armWebInitiated({.resourceId = 42, .timeoutMs = 30000, .requesterUsername = "requester"});
    fixture.flow.onDisconnect();
    expect(!fixture.flow.takePendingWebStart(101, false), "disconnect must clear pending web starts");

    fixture.beginReader();
    fixture.flow.onResolved({.success = true});
    fixture.flow.onDisconnect();
    expect(!fixture.flow.active(), "disconnect must reset the active flow");
    expect(fixture.flow.tick(102) == SupervisionFlow::Outcome::None,
           "disconnect must discard queued terminal outcomes");
}

void timeoutReturnsToRouting() {
    Fixture fixture;
    fixture.beginReader();
    expect(fixture.flow.tick(30101) == SupervisionFlow::Outcome::ReturnToRouting,
           "timeout must return to routing");
    expect(fixture.api.cancels == 1, "timeout must cancel the API request");
}
} // namespace

int main() {
    cancelWinsOverResolution();
    successfulResolutionSettlesFlow();
    rejectedCardRecovers();
    terminalFailureReturnsAfterDwell();
    webInitiatedFlowDoesNotUnlockLocally();
    duplicateWebStartsDoNotCancelAcceptedFlow();
    webStartPreservesFollowingResolution();
    readerInitiationReleasesRacingWebArm();
    readerCardSuccessUnlocksAndResets();
    resolutionWinsOverCardAuthentication();
    terminalFailureWinsOverCardRejection();
    disconnectClearsActivePendingAndQueuedWork();
    timeoutReturnsToRouting();
    return 0;
}
