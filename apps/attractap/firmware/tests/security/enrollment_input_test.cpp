// Compile the actual handler without ATTRACTAP_HOST or DEMO_MODE. Device IO is
// replaced; denial must occur before any key-bearing application callback.
#include "api/api.hpp"
#include <cassert>
#include <iostream>

Logger::Logger(const char *name) : name(name) {}
void Logger::error(const char *) {}
static unsigned cancellations = 0;
API::API(IReaderTransport &transport) : logger("test"), transport(transport),
    firmware(logger, [](const char *, JsonObject) { return true; }, [](const char *) {},
             firmwareUpdateProgressCallback, firmwareUpdateMetaCallback, errorCallback) {}
bool API::sendMessage(const char *type, JsonObject) {
    assert(std::string(type) == "ENROLL_NEW_CARD_CANCEL");
    ++cancellations;
    return true;
}
class Transport : public IReaderTransport {
public:
    void setup() override {}
    void loop() override {}
    bool sendMessage(const char *, size_t) override { return true; }
    bool sendHeartbeat(const char *, size_t) override { return true; }
    void setMessageCallbackRaw(std::function<void(const char *, size_t)>) override {}
    void enableConnectionAttempts() override {}
    void disableConnectionAttempts() override {}
    void forceReconnect(const char *) override {}
    void resetCertificateTrust() override {}
};
struct EnrollmentInputTest {
static void run() {
    Transport transport;
    API handler(transport);
    unsigned keys = 0, errors = 0;
    handler.setEnrollNewCardCallback([&](uint8_t, std::string) { ++keys; });
    handler.setEnrollNewCardErrorCallback([&](const std::string &error) {
        assert(error == "CARD_VERIFICATION_UNAVAILABLE"); ++errors;
    });
    JsonDocument document;
    auto data = document.to<JsonObject>();
    data["payload"]["key"] = "0123456789abcdef0123456789abcdef";
    data["payload"]["keyNo"] = 2;
    handler.onEnrollNewCard(data);
    assert(keys == 0 && errors == 1 && cancellations == 1);
    // Cancellation also applies to empty/malformed input before parsing.
    handler.onEnrollNewCard(JsonObject());
    assert(keys == 0 && errors == 2 && cancellations == 2);
    std::cout << "Production enrollment rejects supplied keys: zero key callbacks, cancellation and unavailable error\n";
}

};
int main() { EnrollmentInputTest::run(); }
