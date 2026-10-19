// Line-delimited hex IO carries the real production TLS engine through a Node
// WebSocket peer. Software identity/clock/IO are supplied by trusted_time_test.
#include "security/reader_session.hpp"
#include "security/trusted_time.hpp"
#include "memory_probe.hpp"
#include "websocket/websocket.hpp"
#include <memory>
#include <cassert>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

static void emit(const char *kind, const uint8_t *bytes, size_t size) {
    static const char digits[] = "0123456789abcdef";
    std::string output;
    for (size_t i = 0; i < size; ++i) { output += digits[bytes[i] >> 4]; output += digits[bytes[i] & 15]; }
    std::cout << kind << " " << output << std::endl;
}
static std::vector<uint8_t> decode(const std::string &input) {
    assert(input.size() % 2 == 0);
    std::vector<uint8_t> output;
    for (size_t i = 0; i < input.size(); i += 2) output.push_back(std::stoul(input.substr(i, 2), nullptr, 16));
    return output;
}
extern void advance_reader_test_clock(int64_t microseconds);
extern void run_websocket_bootstrap_test();
extern void check_unsigned_clock_isolation();
extern ReaderSecurity::ReaderSession &start_websocket_owner(Websocket &, ReaderSecurity::ReaderSession::Emit,
                                                           ReaderSecurity::ReaderSession::Deliver);
extern void retry_websocket_owner(Websocket &);
int main(int argc, char **argv) {
    install_reader_memory_probe();
    if (argc == 2 && std::string(argv[1]) == "--wrapper") {
        run_websocket_bootstrap_test();
        return 0;
    }
    if (argc == 2 && std::string(argv[1]) == "--time") {
        ReaderSecurity::ReaderIdentity identity;
        assert(identity.load());
        ReaderSecurity::TrustedTime time;
        std::string line;
        while (std::getline(std::cin, line)) {
            if (line == "BEGIN") {
                std::array<uint8_t, 81> request{};
                assert(time.begin(identity, request));
                emit("REQUEST", request.data(), request.size());
            } else if (line.starts_with("ACCEPT ")) {
                const auto bytes = decode(line.substr(7));
                std::cout << (time.accept(identity, bytes.data(), bytes.size()) ? "ACCEPTED" : "DENIED") << std::endl;
            } else if (line == "UNSIGNED") { check_unsigned_clock_isolation(); std::cout << "ISOLATED" << std::endl;
            } else if (line == "EXPIRE") advance_reader_test_clock(5000000);
            else if (line == "CLOSE") return 0;
            else return 3;
        }
        return 0;
    }

    const auto output = [](const uint8_t *bytes, size_t size) { emit("WIRE", bytes, size); return true; };
    const auto deliver = [](uint8_t type, const uint8_t *bytes, size_t size) {
        assert(type == 1 || type == 2); emit(type == 1 ? "JSON" : "OTA", bytes, size);
    };
    const bool ownerMode = argc == 2 && std::string(argv[1]) == "--owner";
    auto owner = ownerMode ? std::make_unique<Websocket>() : nullptr;
    auto standalone = ownerMode ? nullptr : std::make_unique<ReaderSecurity::ReaderSession>();
    auto &session = ownerMode ? start_websocket_owner(*owner, output, deliver) : *standalone;
    if (!ownerMode) assert(session.begin(output, deliver));
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line == "OUTAGE" && owner) { retry_websocket_owner(*owner); continue; }
        if (line.starts_with("WIRE ")) {
            const auto bytes = decode(line.substr(5));
            if (!session.receive(bytes.data(), bytes.size())) { std::cout << "CLOSED" << std::endl; return 2; }
        } else if (line.starts_with("SEND ")) {
            const auto bytes = decode(line.substr(5));
            assert(session.send(reinterpret_cast<const char *>(bytes.data()), bytes.size()));
        } else if (line == "CLOSE") { session.close(); return 0; }
        else if (line == "TICK") session.tick();
        else return 3;
        if (session.ready()) report_reader_memory_probe();
        if (session.ready()) std::cout << "READY" << std::endl;
        if (session.failed()) { std::cout << "CLOSED" << std::endl; return 2; }
    }
    return 0;
}
