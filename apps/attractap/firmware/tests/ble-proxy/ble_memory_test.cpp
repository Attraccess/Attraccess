// BLE proxy host tests: a short heap refuses work with READER_BUSY `memory` (the API retries) or drops what may be
// dropped, instead of an allocation that aborts the reader (ATT-1315: the BLE bridge has no PSRAM).
#include "ble_test_support.hpp"

#include "../heap_guard.hpp"

namespace bletest
{
    namespace
    {
        // Restores an unlimited budget when a test ends, also for the tests that run after it.
        struct Budget
        {
            explicit Budget(size_t bytes) { heap_guard::setTestBudget(bytes); }
            ~Budget() { heap_guard::setTestBudget(SIZE_MAX); }
            void set(size_t bytes) { heap_guard::setTestBudget(bytes); }
        };

        constexpr size_t SHORT = heap_guard::BULK_RESERVE_BYTES + 256;
        const std::string MANUFACTURER_FILTER = ",\"filter\":{\"serviceUuids\":[],\"manufacturerIds\":[4660]}";
        const uint8_t WANTED[] = {5, 0xff, 0x34, 0x12, 0x01, 0x02};

        std::string scanRequest(uint32_t requestId)
        {
            return "{\"v\":1,\"sessionId\":\"scan-1\",\"requestId\":" + std::to_string(requestId) +
                   ",\"durationMs\":1000" + MANUFACTURER_FILTER + "}";
        }

        Address numbered(int i)
        {
            Address out;
            out.b[0] = 0xAA;
            out.b[4] = static_cast<uint8_t>(i >> 8);
            out.b[5] = static_cast<uint8_t>(i);
            return out;
        }

        void scanIsRefusedWithoutHeadroomAndRetried()
        {
            Fixture f;
            Budget budget(SHORT);
            f.request("BLE_SCAN", scanRequest(1));
            expect(f.sink.code(1) == "READER_BUSY" && f.sink.detail(1) == "memory", "a scan without heap: READER_BUSY memory");
            expect(f.radio.initCalls == 0 && f.radio.count("scan") == 0, "nothing reaches the radio, not even BLE init");
            expect(f.core.owner() == BleProxyCore::Owner::None, "the radio stays free");

            budget.set(SIZE_MAX);
            f.request("BLE_SCAN", scanRequest(2));
            f.core.onAdvertisement(address("AA:BB:CC:DD:EE:02"), -50, true, WANTED, sizeof WANTED, f.now);
            f.core.onScanComplete(f.now);
            expect(f.sink.code(2) == "OK" && f.sink.answer(2)["advertisements"].size() == 1,
                   "the retried scan works once the heap recovered");
        }

        void scanSkipsReportsWhileTheHeapIsShort()
        {
            Fixture f;
            Budget budget(SIZE_MAX);
            f.request("BLE_SCAN", scanRequest(1));
            budget.set(heap_guard::BULK_RESERVE_BYTES + 8);
            // Every report would need an allocation now: none may happen, none may abort.
            for (int i = 0; i < 100; i++) f.core.onAdvertisement(numbered(i), -50, true, WANTED, sizeof WANTED, f.now);
            budget.set(SIZE_MAX);
            f.core.onAdvertisement(address("AA:BB:CC:DD:EE:02"), -50, true, WANTED, sizeof WANTED, f.now);
            f.core.onScanComplete(f.now);
            JsonArrayConst ads = f.sink.answer(1)["advertisements"].as<JsonArrayConst>();
            expect(ads.size() == 1 && std::strcmp(ads[0]["address"] | "", "AA:BB:CC:DD:EE:02") == 0,
                   "reports during the short heap are skipped, later ones count");
        }

        void scanCandidatesNeverGrowPastTheReservedList()
        {
            Fixture f;
            f.request("BLE_SCAN", scanRequest(1));
            // A crowded band: far more distinct devices than candidates, none of them ruled out by its own data.
            const uint8_t unrelated[] = {2, 0x01, 0x06};
            for (int i = 0; i < 4 * static_cast<int>(MAX_SCAN_CANDIDATES); i++)
                f.core.onAdvertisement(numbered(i), -50, true, unrelated, sizeof unrelated, f.now);
            // Full: a wanted device beyond the bound is not tracked, and nothing grew to take it.
            f.core.onAdvertisement(address("AA:BB:CC:DD:EE:02"), -50, true, WANTED, sizeof WANTED, f.now);
            f.core.onScanComplete(f.now);
            expect(f.sink.code(1) == "OK", "a full candidate list still answers");
        }

        void scanResultWithoutHeapIsBusy()
        {
            Fixture f;
            Budget budget(SIZE_MAX);
            f.request("BLE_SCAN", scanRequest(1));
            f.core.onAdvertisement(address("AA:BB:CC:DD:EE:02"), -50, true, WANTED, sizeof WANTED, f.now);
            budget.set(SHORT);
            f.core.onScanComplete(f.now);
            expect(f.sink.code(1) == "READER_BUSY" && f.sink.detail(1) == "memory",
                   "a result that cannot be built: READER_BUSY memory, never an abort");
            expect(f.core.owner() == BleProxyCore::Owner::None, "the scan released the radio");
        }

        void sessionOpenIsRefusedWithoutHeadroom()
        {
            Fixture f;
            Budget budget(SHORT);
            f.request("BLE_SESSION_OPEN", openPayload(1));
            expect(f.sink.code(1) == "READER_BUSY" && f.sink.detail(1) == "memory", "an open without heap: READER_BUSY memory");
            expect(f.radio.count("connect") == 0 && f.core.owner() == BleProxyCore::Owner::None, "no connect");
        }

        void operationsAreRefusedWithoutHeadroom()
        {
            Fixture f;
            f.open();
            Budget budget(SHORT);
            f.request("BLE_READ", target("BLE_READ", 2, RW));
            expect(f.sink.code(2) == "READER_BUSY" && f.sink.detail(2) == "memory",
                   "a queued operation without heap: READER_BUSY memory");

            // Enough to queue it, not enough to read: refused when it starts.
            budget.set(heap_guard::BULK_RESERVE_BYTES + 1024);
            f.request("BLE_READ", target("BLE_READ", 3, RW));
            expect(f.sink.code(3) == "READER_BUSY" && f.sink.detail(3) == "memory", "a read without heap for its value");
            expect(f.radio.count("read") == 0, "the read never reached the radio");

            budget.set(SIZE_MAX);
            f.request("BLE_READ", target("BLE_READ", 4, RW));
            f.done(Error(), Bytes{1, 2});
            expect(f.sink.code(4) == "OK", "the session keeps working once the heap recovered");
        }

        void notificationsOverflowInsteadOfAllocating()
        {
            NotificationBuffer buffer(8, 1024);
            const uint8_t one[] = {1};
            Budget budget(SIZE_MAX);
            expect(buffer.push(uuid(SVC), uuid(EVENTS), one, 1), "a notification is buffered");
            budget.set(SHORT - 256);
            expect(!buffer.push(uuid(SVC), uuid(EVENTS), one, 1), "with the heap short it is not");
            budget.set(SIZE_MAX);
            expect(!buffer.push(uuid(SVC), uuid(EVENTS), one, 1), "the stream stays overflowed until resubscribed");
            NotificationBuffer::Entry entry;
            expect(buffer.peek(entry) && !entry.overflow, "what was buffered before comes first");
            buffer.removeOldest();
            expect(buffer.peek(entry) && entry.overflow, "then the overflow marker, so the API ends the stream");

            // Not even room for a marker: dropped without one, and no allocation was tried.
            NotificationBuffer tight(8, 1024);
            budget.set(heap_guard::CRITICAL_RESERVE_BYTES);
            expect(!tight.push(uuid(SVC), uuid(EVENTS), one, 1) && tight.size() == 0, "nothing allocated");
        }

        void forwardingWaitsForHeap()
        {
            Fixture f;
            f.open();
            f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 2, EVENTS));
            f.done();
            const uint8_t one[] = {7};
            f.notifications.push(uuid(SVC), uuid(EVENTS), one, 1);
            Budget budget(SHORT);
            f.advance(100);
            expect(f.sink.ofType("BLE_NOTIFICATION").empty(), "a notification waits while the heap is short");
            budget.set(SIZE_MAX);
            f.advance(100);
            expect(f.sink.ofType("BLE_NOTIFICATION").size() == 1, "and goes out once it recovered");
        }
    }

    void runMemoryTests()
    {
        scanIsRefusedWithoutHeadroomAndRetried();
        scanSkipsReportsWhileTheHeapIsShort();
        scanCandidatesNeverGrowPastTheReservedList();
        scanResultWithoutHeapIsBusy();
        sessionOpenIsRefusedWithoutHeadroom();
        operationsAreRefusedWithoutHeadroom();
        notificationsOverflowInsteadOfAllocating();
        forwardingWaitsForHeap();
    }
}
