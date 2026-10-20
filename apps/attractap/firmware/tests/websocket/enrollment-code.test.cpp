#include "api/enrollment-code.hpp"
#include <cassert>
#include <regex>
#include <set>
int main() {
    uint8_t byte = 0;
    EnrollmentCode code([&](uint8_t *out, size_t) { *out = byte++; return true; });
    assert(code.refresh(0));
    assert(code.value() == "ABC-DEF");
    assert(!code.refresh(29999));
    assert(code.refresh(30000));
    assert(code.value() == "GHI-JKL");
    assert(!code.refresh(30001));
    code.clear(); assert(code.value().empty());
    assert(code.refresh(UINT32_MAX - 100));
    assert(!code.refresh(100));
    assert(code.refresh(30000));
    EnrollmentCode unavailable([](uint8_t *, size_t) { return false; });
    assert(!unavailable.refresh(0)); assert(unavailable.value().empty());
    std::set<std::string> codes;
    EnrollmentCode secure;
    for (unsigned i = 0; i < 100; ++i) {
        assert(secure.refresh(i, true));
        assert(std::regex_match(secure.value(), std::regex("[A-Z0-9]{3}-[A-Z0-9]{3}")));
        codes.insert(secure.value());
    }
    assert(codes.size() == 100);
}
