#include "workflow.hpp"

// A reader without credentials never registers by itself: it shows the code an admin approves.
void ReaderWorkflow::testEnrollment()
{
    const auto text = [](FirmwareI18n::Message message) -> const char * {
        return FirmwareI18n::messageText(message, State::getActiveLanguage());
    };

    Settings::clearAttraccessAuthConfig();
    State::setApiState(false, "");
    server.sent.clear();
    server.push("READER_REQUEST_AUTHENTICATION", "{}"); pump();

    // The registration request carries the enrollment marker; nothing is authenticated.
    const auto registration = server.last("READER_REGISTER");
    assert(registration["data"]["payload"]["enrollment"]["protocol"].as<int>() == 1);
    assert(server.count("READER_AUTHENTICATE") == 0);

    server.push("READER_ENROLLMENT_CODE", R"({"code":"K7P-3XQ","rotatesInMs":30000,"expiresInMs":600000})"); pump();
    assert(State::getEnrollmentState().pending);
    assert(lv_screen_active() == Display::pendingApprovalScreen.getScreen());
    requireLabel(lv_screen_active(), text(FirmwareI18n::Message::ApproveThisReaderInAttraccess));
    requireLabel(lv_screen_active(), "K7P-3XQ");
    display.capture(output, "enrollment-pending-approval");

    // Every rotation replaces the code on screen.
    server.push("READER_ENROLLMENT_CODE", R"({"code":"M4N-8ZB","rotatesInMs":30000,"expiresInMs":570000})"); pump();
    requireLabel(lv_screen_active(), "M4N-8ZB");
    assert(!label(lv_screen_active(), "K7P-3XQ"));

    // A refused request shows when the reader asks again and keeps no stale code.
    server.push("READER_ENROLLMENT_REJECTED", R"({"reason":"RATE_LIMITED","retryAfterMs":8000})"); pump();
    assert(State::getEnrollmentState().rejected && !State::getEnrollmentState().pending);
    assert(!label(lv_screen_active(), "M4N-8ZB"));
    server.push("READER_ENROLLMENT_CODE", R"({"code":"P2Q-9RT","rotatesInMs":30000,"expiresInMs":500000})"); pump();
    requireLabel(lv_screen_active(), "P2Q-9RT");

    // Approval delivers the credentials, which survive and are used right away.
    server.push("READER_REGISTER", R"({"id":1234,"token":"enrolled-token"})"); pump();
    assert(Settings::getAttraccessAuthConfig().readerId == 1234);
    assert(Settings::getAttraccessAuthConfig().apiKey == "enrolled-token");
    assert(!State::getEnrollmentState().pending);
    assert(server.count("READER_AUTHENTICATE") == 1);
    assert(server.last("READER_AUTHENTICATE")["data"]["payload"]["token"].as<std::string>() == "enrolled-token");

    // The server dropping the connection forgets the request on the reader as well.
    Settings::clearAttraccessAuthConfig();
    State::setApiState(false, "");
    server.push("READER_REQUEST_AUTHENTICATION", "{}");
    server.push("READER_ENROLLMENT_CODE", R"({"code":"A2B-3CD","rotatesInMs":30000,"expiresInMs":600000})"); pump();
    assert(State::getEnrollmentState().pending);
    State::setWebsocketState(false, "reader.test", 80, false); pump();
    assert(!State::getEnrollmentState().pending);
    State::setWebsocketState(true, "reader.test", 80, false);

    Settings::saveAttraccessAuthConfig("test", 880);
    server.push("READER_AUTHENTICATED", R"({"name":"Test reader","language":"de"})"); list(false); pump();
}
