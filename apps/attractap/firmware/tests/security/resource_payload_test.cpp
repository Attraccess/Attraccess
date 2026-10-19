#include "api/api.hpp"
#include "state/state.hpp"
#include <cassert>
#include <fstream>
#include <iostream>
#include <iterator>
#include <utility>

// Only unrelated dispatch targets and device IO are substituted. The document,
// allocator, event dispatcher and resource handler below are production code.
Logger::Logger(const char *name) : name(name) {}
void Logger::error(const char *) {}
void Logger::errorf(const char *, ...) {}
uint8_t Settings::getLedBrightness() { return 128; }
void Settings::setLedBrightness(uint8_t) {}
void Settings::saveDefaultLanguage(const std::string &) {}
void State::setDefaultLanguage(std::string) {}
#define UNUSED_HANDLER(name) void API::name(JsonObject) {}
UNUSED_HANDLER(onRegistrationData)
UNUSED_HANDLER(onUnauthorized)
UNUSED_HANDLER(onReaderAuthenticated)
UNUSED_HANDLER(onSupervisionStart)
UNUSED_HANDLER(onSupervisionRequestResult)
UNUSED_HANDLER(onSupervisorCardAuthenticationData)
UNUSED_HANDLER(onSupervisionResolved)
UNUSED_HANDLER(onCrashReportResponse)
UNUSED_HANDLER(onCardAuthenticationDetailsResponse)
UNUSED_HANDLER(onEnrollNewCardGetAvailableKeyNo)
UNUSED_HANDLER(onEnrollNewCard)
UNUSED_HANDLER(onEnrollNewCardRequestNFCKeyError)
UNUSED_HANDLER(onResetNfcCard)
#undef UNUSED_HANDLER
void API::onServerTime(JsonVariantConst) {}
void API::sendAuthenticationRequest() {}

class Transport : public IReaderTransport {
public:
    unsigned int sends = 0, closes = 0;
    void setup() override {}
    void loop() override {}
    bool sendMessage(const char *, size_t) override { ++sends; return true; }
    bool sendHeartbeat(const char *, size_t) override { ++sends; return true; }
    void setMessageCallbackRaw(std::function<void(const char *, size_t)>) override {}
    void enableConnectionAttempts() override {}
    void disableConnectionAttempts() override {}
    void forceReconnect(const char *) override { ++closes; }
    void resetCertificateTrust() override {}
};
class Parser : public API {
public:
    using API::API;
    size_t peak() const { return inboundAllocator.peakBytes(); }
    size_t retained() const { return inboundAllocator.usedBytes(); }
};

void checkResourceFixture(const std::string &input) {
    assert(input.size() <= 8192);
    Transport transport;
    Parser parser(transport);
    JsonDocument expected;
    assert(!deserializeJson(expected, input));
    const auto resources = expected["data"]["payload"]["resources"].as<JsonArray>();
    size_t handlerCopies = 0;
    unsigned int callbacks = 0;
    parser.setResourceListUpdateCallback([&](const API::ResourceList &list) {
        ++callbacks;
        assert(list.count == resources.size());
        const auto externalString = [](const std::string &value) {
            const auto address = reinterpret_cast<uintptr_t>(value.data());
            const auto object = reinterpret_cast<uintptr_t>(&value);
            return address >= object && address < object + sizeof(value) ? size_t(0) : value.capacity() + 1;
        };
        for (const auto &item : list.items) {
            handlerCopies += externalString(item.description);
            handlerCopies += item.introducers.capacity() * sizeof(std::string);
            for (const auto &name : item.introducers) handlerCopies += externalString(name);
        }
        assert(list.requestId == (expected["data"]["payload"]["requestId"] | 0u));
        for (size_t i = 0; i < list.count; ++i) {
            assert(list.items[i].id == resources[i]["id"].as<uint32_t>());
            assert(list.items[i].description == resources[i]["description"].as<std::string>());
            assert(list.items[i].name == resources[i]["name"].as<std::string>());
            const auto buttons = resources[i]["flowButtons"].as<JsonArray>();
            assert(list.items[i].flowButtonCount == buttons.size());
            for (size_t j = 0; j < buttons.size(); ++j) {
                assert(list.items[i].flowButtons[j].id == buttons[j]["id"].as<std::string>());
                assert(list.items[i].flowButtons[j].label == buttons[j]["label"].as<std::string>());
            }
        }
    });
    parser.processIncomingMessage(input.data(), input.size());
    std::cout << "jsonBytes=" << input.size() << " parserPeakBytes=" << parser.peak()
              << " parserCurrentBytes=" << parser.retained() << " pointerBits=" << sizeof(void *) * 8
              << " arduinoJson=" << ARDUINOJSON_VERSION << " handlerObjectBytes=" << sizeof(API)
              << " resourceScratchBytes=" << sizeof(API::ResourceList) << " handlerDynamicCopiesBytes=" << handlerCopies
              << " receivedInputCopyBytes=" << input.capacity() + 1 << " callbackCopiesBytes=0"
              << " callbacks=" << callbacks << " closes=" << transport.closes << std::endl;
    assert(callbacks == 1);
    assert(transport.sends == 1);
    assert(transport.closes == 0);
    assert(parser.peak() <= ReaderJsonAllocator::LIMIT);
    assert(parser.retained() == 0);
}

void checkAllocatorReplacement() {
    ReaderJsonAllocator allocator;
    auto *old = static_cast<unsigned char *>(allocator.allocate(20000));
    assert(old);
    std::memset(old, 0xa5, 20000);
    const auto retained = allocator.usedBytes();
    // Net retained size would fit, but simultaneous old + new storage does not.
    assert(!allocator.reallocate(old, 16000));
    assert(allocator.usedBytes() == retained);
    for (size_t i = 0; i < 20000; ++i) assert(old[i] == 0xa5);
    auto *next = static_cast<unsigned char *>(allocator.reallocate(old, 8000));
    assert(next);
    assert(allocator.peakBytes() > retained + 8000);
    assert(allocator.peakBytes() <= ReaderJsonAllocator::LIMIT);
    for (size_t i = 0; i < 8000; ++i) assert(next[i] == 0xa5);
    allocator.deallocate(next);
    assert(allocator.usedBytes() == 0);
    allocator.beginMessage();
    assert(allocator.peakBytes() == 0);
    assert(!allocator.allocate(ReaderJsonAllocator::LIMIT));
    assert(!allocator.allocate(SIZE_MAX));
    assert(allocator.usedBytes() == 0);
}

void checkOtherProductionHandlers() {
    Transport transport;
    Parser parser(transport);
    unsigned projects = 0, forms = 0, fields = 0, results = 0;
    parser.setProjectsOfUserResponseCallback([&](const auto &value) {
        ++projects; assert(value.count == 1 && value.items[0].id == 7 && value.items[0].name == "Project");
    });
    parser.requestProjectsOfUser(1);
    parser.startResourceUsageSession(10);
    parser.setResourceFormsRequestCallback([&](const auto &value) {
        ++forms; assert(value.resourceId == 10 && value.requestId == 1);
    });
    parser.setResourceFormFieldsCallback([&](const auto &value) { ++fields; assert(value.formId == 3); });
    parser.setResourceFormPageResultCallback([&](const auto &value) { ++results; assert(value.formId == 3); });
    const std::string messages[] = {
        R"({"event":"EVENT","data":{"type":"PROJECTS_OF_USER","payload":{"page":1,"limit":10,"total":1,"projects":[{"id":7,"name":"Project"}]}}})",
        R"({"event":"EVENT","data":{"type":"RESOURCE_USAGE_FORM_REQUEST","payload":{"requestId":1,"resourceId":10,"action":"start","forms":[]}}})",
        R"({"event":"EVENT","data":{"type":"RESOURCE_USAGE_FORM_FIELDS","payload":{"formId":3,"resourceId":10,"action":"start","fields":[]}}})",
        R"({"event":"EVENT","data":{"type":"RESOURCE_USAGE_FORM_PAGE_RESULT","payload":{"formId":3,"resourceId":10,"action":"start","success":false}}})"
    };
    for (const auto &message : messages) {
        parser.processIncomingMessage(message.data(), message.size());
        assert(parser.retained() == 0 && parser.peak() <= ReaderJsonAllocator::LIMIT);
    }
    std::cout << "handlerCallbacks projects=" << projects << " forms=" << forms << " fields=" << fields << " results=" << results << std::endl;
    assert(projects == 1 && forms == 1 && fields == 1 && results == 1);
}

int main(int argc, char **argv) {
    checkAllocatorReplacement();
    checkOtherProductionHandlers();
    if (argc == 2) {
        std::ifstream file(argv[1]);
        assert(file.good());
        checkResourceFixture(std::string(std::istreambuf_iterator<char>(file), {}));
        return 0;
    }
    checkResourceFixture(R"({"event":"EVENT","data":{"type":"RESOURCE_LIST","payload":{"requestId":5,"resources":[]}}})");
    Transport transport;
    Parser parser(transport);
    unsigned int callbacks = 0;
    parser.setResourceListUpdateCallback([&](const auto &) { ++callbacks; });
    // Valid but complex JSON must hit the allocator limit without dispatch.
    std::string complex = R"({"data":{"type":"RESOURCE_LIST","payload":{"resources":[],"extra":[)";
    for (int i = 0; i < 3000; ++i) complex += "0,";
    complex += "0]}}}";
    assert(complex.size() <= 8192);
    parser.processIncomingMessage(complex.data(), complex.size());
    assert(callbacks == 0 && transport.sends == 0 && transport.closes == 1);
    assert(parser.peak() <= ReaderJsonAllocator::LIMIT && parser.retained() == 0);
    for (const auto &invalid : {std::string(8193, ' '), std::string("{\"data\":"), std::string("null")}) {
        parser.processIncomingMessage(invalid.data(), invalid.size());
        assert(callbacks == 0 && transport.sends == 0 && parser.retained() == 0);
    }
    std::cout << "parser budget exhaustion and invalid/oversize input: zero callbacks\n";
}
