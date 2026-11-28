// SessionOutbox (ATT-1315): TLS records the websocket refuses wait, in order, instead of ending the session. QA on
// the BLE bridge saw the websocket drop during a long BLE transfer: a few seconds of back-pressure filled the
// websocket's send queue, the next session record found no slot, and the reader reconnected.
#include "api/security/session_outbox.hpp"

#include <cstdio>
#include <cstdlib>
#include <deque>
#include <string>
#include <vector>

namespace
{
    int failures = 0;

    void expect(bool condition, const char *what)
    {
        if (condition) return;
        std::fprintf(stderr, "FAIL: %s\n", what);
        failures++;
    }

    using Result = SessionOutbox::Result;

    using Budget = heap_guard::TestBudget;

    std::vector<uint8_t> bytes(const std::string &text) { return std::vector<uint8_t>(text.begin(), text.end()); }

    void refusedRecordsWaitInOrder()
    {
        SessionOutbox outbox;
        std::vector<std::string> frames;
        bool taking = false;
        auto send = [&](const uint8_t *data, size_t length)
        {
            if (!taking) return false;
            frames.emplace_back(reinterpret_cast<const char *>(data), length);
            return true;
        };
        const auto a = bytes("aa");
        const auto b = bytes("bbb");
        expect(outbox.append(a.data(), a.size()), "a record is taken");
        expect(outbox.flush(0, send) == Result::Pending, "a refused record waits");
        expect(!outbox.accepting(), "and nothing new is encrypted behind it");
        expect(outbox.append(b.data(), b.size()), "TLS may still add records (a handshake flight)");
        expect(outbox.flush(1000, send) == Result::Pending, "still refused");
        taking = true;
        expect(outbox.flush(2000, send) == Result::Sent, "taken once the websocket has room");
        expect(frames.size() == 1 && frames[0] == "aabbb", "in one frame, in order, nothing lost");
        expect(outbox.empty() && outbox.accepting(), "and new messages are accepted again");
        expect(outbox.flush(3000, send) == Result::Sent && frames.size() == 1, "an empty outbox sends nothing");
    }

    void aWebsocketThatNeverTakesThemEndsTheStream()
    {
        SessionOutbox outbox;
        auto refuse = [](const uint8_t *, size_t) { return false; };
        const auto a = bytes("record");
        outbox.append(a.data(), a.size());
        expect(outbox.flush(5000, refuse) == Result::Pending, "refused");
        expect(outbox.flush(5000 + SessionOutbox::MAX_STALL_MS - 1, refuse) == Result::Pending,
               "waits until the websocket's own liveness limit");
        expect(outbox.flush(5000 + SessionOutbox::MAX_STALL_MS, refuse) == Result::Broken,
               "then the connection is gone: the session ends");
        outbox.clear();
        expect(outbox.empty() && outbox.accepting(), "the next session starts empty");

        // The stall counts from the first refusal, not from the last record, and survives the clock wrapping.
        SessionOutbox wrap;
        wrap.append(a.data(), a.size());
        const uint32_t start = 0xFFFFFFFFu - 1000;
        expect(wrap.flush(start, refuse) == Result::Pending, "refused before the wrap");
        expect(wrap.flush(start + SessionOutbox::MAX_STALL_MS - 1, refuse) == Result::Pending, "not stalled across it");
        expect(wrap.flush(start + SessionOutbox::MAX_STALL_MS, refuse) == Result::Broken, "stalled across it");

        // A stall that ends resets the clock.
        SessionOutbox recovered;
        bool taking = false;
        auto send = [&](const uint8_t *, size_t) { return taking; };
        recovered.append(a.data(), a.size());
        recovered.flush(0, send);
        taking = true;
        recovered.flush(10000, send);
        taking = false;
        recovered.append(a.data(), a.size());
        expect(recovered.flush(25000, send) == Result::Pending, "a later refusal starts its own stall");
    }

    void theBacklogIsBounded()
    {
        SessionOutbox outbox;
        std::vector<uint8_t> big(SessionOutbox::MAX_BYTES);
        expect(outbox.append(big.data(), big.size()), "up to MAX_BYTES fits");
        const uint8_t one = 1;
        expect(!outbox.append(&one, 1), "beyond it TLS fails the session instead");

        // A short heap: the record is refused (TLS fails the session) instead of the reader aborting.
        SessionOutbox shortHeap;
        Budget budget(heap_guard::CRITICAL_RESERVE_BYTES + 100);
        std::vector<uint8_t> record(512);
        expect(!shortHeap.append(record.data(), record.size()), "no room for the record: refused");
        budget.set(SIZE_MAX);
        expect(shortHeap.append(record.data(), record.size()), "with room: taken");
    }

    // ATT-1394, the QA case on the BLE bridge: 6 KiB wait and a 200 B record arrives. The old check asked for 6.2 KiB
    // and passed, then `insert` grew the buffer to about 12 KiB, more than the largest free block, and the reader
    // aborted. Now the outbox grows to what fits (or refuses), and the insert never allocates again.
    void growthIsCheckedAtTheSizeItAllocates()
    {
        constexpr size_t WAITING = 6 * 1024;
        constexpr size_t RECORD = 200;
        constexpr size_t NEEDED = WAITING + RECORD;
        const std::vector<uint8_t> waiting(WAITING, 'a');
        const std::vector<uint8_t> record(RECORD, 'b');

        SessionOutbox outbox;
        Budget budget(SIZE_MAX);
        expect(outbox.append(waiting.data(), waiting.size()), "6 KiB taken");
        expect(outbox.capacity() == WAITING, "an empty outbox grows to the record");

        budget.set(heap_guard::CRITICAL_RESERVE_BYTES + NEEDED - 1);
        expect(!outbox.append(record.data(), record.size()), "no heap for 6.2 KiB: refused, TLS fails the session");
        expect(outbox.size() == WAITING && outbox.capacity() == WAITING, "the waiting records are untouched");

        // What the old check let through: room for 6.2 KiB, not for the 12 KiB `insert` would have taken.
        budget.set(heap_guard::CRITICAL_RESERVE_BYTES + NEEDED);
        expect(outbox.append(record.data(), record.size()), "room for 6.2 KiB: taken");
        expect(outbox.capacity() == NEEDED, "grown to exactly 6.2 KiB, not doubled");

        budget.set(SIZE_MAX);
        std::string frame;
        outbox.flush(0, [&](const uint8_t *data, size_t length) {
            frame.assign(reinterpret_cast<const char *>(data), length);
            return true;
        });
        expect(frame == std::string(WAITING, 'a') + std::string(RECORD, 'b'), "both records, intact and in order");

        // With heap to spare the outbox doubles as before, but never past MAX_BYTES: it can never hold more.
        SessionOutbox roomy;
        expect(roomy.append(waiting.data(), waiting.size()), "setup: 6 KiB taken");
        expect(roomy.append(record.data(), record.size()) && roomy.capacity() == 2 * WAITING, "doubled");
        SessionOutbox capped;
        const std::vector<uint8_t> large(10 * 1024, 'c');
        expect(capped.append(large.data(), large.size()), "setup: 10 KiB taken");
        expect(capped.append(record.data(), record.size()) && capped.capacity() == SessionOutbox::MAX_BYTES,
               "the doubling stops at MAX_BYTES");
    }

    // The QA sequence: a long BLE transfer sends a session message for every write answer and notification; the
    // websocket's send queue (8 slots, one frame per flush) drains with the TCP connection, which stalls for 6 s.
    // Before, the first record without a slot reconnected the reader. Now senders are refused before TLS, the
    // stream stays whole and the session survives.
    void aStalledWebsocketHoldsSendersBackWithoutLosingTheStream()
    {
        constexpr size_t QUEUE_SLOTS = 8;
        SessionOutbox outbox;
        std::deque<std::vector<uint8_t>> queue; // the websocket's send queue
        std::string wire;                       // what reached the API, in order
        uint32_t sequence = 0;                  // TLS record sequence: every record must arrive, in order
        int refusedBeforeTls = 0;
        int mallocFailures = 0;
        bool broken = false;
        bool mallocFails = false;

        auto enqueue = [&](const uint8_t *data, size_t length)
        {
            if (queue.size() >= QUEUE_SLOTS || mallocFails)
            {
                if (mallocFails) mallocFailures++;
                return false;
            }
            queue.emplace_back(data, data + length);
            return true;
        };
        // ReaderLink::sendSessionFrameLocked
        auto sendMessage = [&](uint32_t now)
        {
            const Result before = outbox.flush(now, enqueue);
            if (before == Result::Broken) broken = true;
            if (before == Result::Broken || !outbox.accepting() || queue.size() >= QUEUE_SLOTS)
            {
                refusedBeforeTls++;
                return false;
            }
            const std::string record = std::to_string(sequence++) + ";";
            outbox.append(reinterpret_cast<const uint8_t *>(record.data()), record.size());
            if (outbox.flush(now, enqueue) == Result::Broken) broken = true;
            return true;
        };

        for (uint32_t now = 0; now < 60000 && !broken; now += 10)
        {
            const bool stalled = now >= 20000 && now < 26000;
            // A failed copy for a moment (the heap was short): the records wait in the outbox.
            mallocFails = now >= 30000 && now < 30050;
            // The answer and the notification of one write, every 20 ms (the transfer's pace).
            if (now % 20 == 0)
            {
                sendMessage(now);
                sendMessage(now);
            }
            // ReaderLink::loop(): records refused earlier go out once there is room.
            if (!outbox.empty() && outbox.flush(now, enqueue) == Result::Broken) broken = true;
            // The websocket's send task: one frame per 5 ms while TCP moves.
            if (!stalled && now % 5 == 0 && !queue.empty())
            {
                wire.append(queue.front().begin(), queue.front().end());
                queue.pop_front();
            }
        }
        while (!queue.empty())
        {
            wire.append(queue.front().begin(), queue.front().end());
            queue.pop_front();
        }
        if (!outbox.empty()) outbox.flush(60000, [&](const uint8_t *data, size_t length) {
            wire.append(reinterpret_cast<const char *>(data), length);
            return true;
        });

        expect(!broken, "a 6 s stall and a failed copy never end the session");
        expect(refusedBeforeTls > 0, "senders were held back during the stall");
        expect(mallocFailures > 0, "the failed copy was exercised");
        std::string expected;
        for (uint32_t n = 0; n < sequence; n++) expected += std::to_string(n) + ";";
        expect(wire == expected, "every encrypted record reached the API, in order");
    }
}

int main()
{
    refusedRecordsWaitInOrder();
    aWebsocketThatNeverTakesThemEndsTheStream();
    theBacklogIsBounded();
    growthIsCheckedAtTheSizeItAllocates();
    aStalledWebsocketHoldsSendersBackWithoutLosingTheStream();
    if (failures)
    {
        std::fprintf(stderr, "%d session outbox checks failed\n", failures);
        return EXIT_FAILURE;
    }
    std::puts("session outbox tests passed");
    return EXIT_SUCCESS;
}
