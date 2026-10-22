#include "memory_probe.hpp"
#include "security/reader_session.hpp"
#include "mbedtls/platform.h"
#include "mbedtls/version.h"
#include <cstdlib>
#include <iostream>
#include <unordered_map>
#include <algorithm>
struct Allocations {
    std::unordered_map<void *, size_t> sizes;
    size_t current = 0, peak = 0;
    void add(void *p, size_t size) { if (p) { sizes[p] = size; current += size; peak = std::max(peak, current); } }
    void remove(void *p) { if (p) { current -= sizes.at(p); sizes.erase(p); } }
};
static Allocations library, io;
static void *countedCalloc(size_t count, size_t size) {
    auto *p = std::calloc(count, size); library.add(p, count * size); return p;
}
static void countedFree(void *p) { library.remove(p); std::free(p); }
void *reader_io_allocate(size_t size) { auto *p = std::malloc(size); io.add(p, size); return p; }
void reader_io_free(void *p) { io.remove(p); std::free(p); }
void install_reader_memory_probe() { mbedtls_platform_set_calloc_free(countedCalloc, countedFree); }
void report_reader_memory_probe() {
    std::cout << "MEMORY pointerBits=" << sizeof(void *) * 8 << " mbedtls=" << MBEDTLS_VERSION_STRING
        << " cryptoLibraryCurrent=" << library.current << " cryptoLibraryPeak=" << library.peak
        << " sessionObject=" << sizeof(ReaderSecurity::ReaderSession)
        << " tlsContext=" << sizeof(mbedtls_ssl_context) << " tlsConfiguration=" << sizeof(mbedtls_ssl_config)
        << " queueAndEnvelopeCurrent=" << io.current << " queueAndEnvelopePeak=" << io.peak
        << " rawInputQueueCapacity=32768 rawOutputFragmentCapacity=4096"
        << " hostRequestedBytesOnly=true deviceAllocatorOverhead=unmeasured" << std::endl;
}
