#pragma once

// BLE bridge (ATT-1315): the decisions of the Bluetooth setup, as plain C++ so host tests can drive them.
// provisioning.cpp wires them to NimBLE and to the command handler.

#include <cstddef>
#include <cstdint>
#include <string>

namespace bridge
{
    // When the Bluetooth setup is reachable. It opens only on request (the button held 3 s) and only on a bridge that
    // is not paired with an Attraccess server yet (fresh flash, factory reset, or a pairing that never completed).
    // It closes after OPEN_MS, CLOSE_AFTER_PAIRED_MS after the reader got paired (the web app reads the new status
    // first), or with a reboot (nothing is persisted). A request while it is open changes nothing.
    class SetupWindow
    {
    public:
        static constexpr uint32_t OPEN_MS = 10 * 60 * 1000;
        static constexpr uint32_t CLOSE_AFTER_PAIRED_MS = 10000;

        enum class Change : uint8_t
        {
            None,
            Open,
            Close,
        };

        // The button asked for the setup. `paired`: the bridge holds pairing credentials of a server.
        Change request(bool paired, uint32_t now)
        {
            if (open || paired) return Change::None;
            open = true;
            openedAt = now;
            pairedSince = 0;
            sawPaired = false;
            return Change::Open;
        }

        // Called periodically. `authenticated`: the reader runs an approved session with the server.
        Change update(bool authenticated, uint32_t now)
        {
            if (!open) return Change::None;
            if (authenticated && !sawPaired)
            {
                sawPaired = true;
                pairedSince = now;
            }
            const bool expired = now - openedAt >= OPEN_MS;
            const bool done = sawPaired && now - pairedSince >= CLOSE_AFTER_PAIRED_MS;
            if (!expired && !done) return Change::None;
            open = false;
            return Change::Close;
        }

        bool isOpen() const { return open; }

    private:
        bool open = false;
        bool sawPaired = false;
        uint32_t openedAt = 0;
        uint32_t pairedSince = 0;
    };

    // Who may use the setup link. The window is open to anyone in radio range (Just Works pairing confirms nothing)
    // and the controller takes one link at a time, so:
    // - a link that is not encrypted within UNENCRYPTED_MS, or sends no command for IDLE_MS, is dropped, so one
    //   idle connection cannot hold the setup for the whole window;
    // - after MAX_PIN_FAILURES wrong PINs in one window the setup refuses every further command until the window is
    //   opened again (reboot, then hold the button), so the 4-digit PIN cannot be guessed over the air.
    class LinkGuard
    {
    public:
        static constexpr uint32_t UNENCRYPTED_MS = 30000;
        static constexpr uint32_t IDLE_MS = 5 * 60 * 1000;
        static constexpr uint8_t MAX_PIN_FAILURES = 5;

        // A new window: forgets the failures of the last one.
        void reset() { *this = LinkGuard(); }

        void connected(uint32_t now)
        {
            linked = true;
            encrypted = false;
            terminating = false;
            lastActivity = now;
        }
        void disconnected() { linked = false; }
        // The link is being dropped: do not ask again until its disconnect (or a new link) arrives.
        void dropping() { terminating = true; }
        void encryptedNow() { encrypted = true; }
        void command(uint32_t now) { lastActivity = now; }
        void pinFailed()
        {
            if (pinFailures < MAX_PIN_FAILURES) pinFailures++;
        }

        bool lockedOut() const { return pinFailures >= MAX_PIN_FAILURES; }

        // Whether the current link must be dropped now.
        bool shouldDrop(uint32_t now) const
        {
            if (!linked || terminating) return false;
            if (lockedOut()) return true;
            // A time stamped after `now` was read (another task) is no quiet time at all.
            const int32_t quiet = static_cast<int32_t>(now - lastActivity);
            if (quiet <= 0) return false;
            return static_cast<uint32_t>(quiet) >= (encrypted ? IDLE_MS : UNENCRYPTED_MS);
        }

    private:
        bool linked = false;
        bool encrypted = false;
        bool terminating = false;
        uint8_t pinFailures = 0;
        uint32_t lastActivity = 0;
    };

    // Splits the bytes the web app writes into command lines, like the serial console does: `\n` ends a line, `\r`
    // is ignored. A line longer than maxLength is dropped whole (up to its newline) instead of being cut.
    class LineAssembler
    {
    public:
        explicit LineAssembler(size_t maxLength) : maxLength(maxLength) {}

        template <typename OnLine> void feed(const uint8_t *data, size_t length, OnLine &&onLine)
        {
            for (size_t i = 0; i < length; i++)
            {
                const char c = static_cast<char>(data[i]);
                if (c == '\r') continue;
                if (c == '\n')
                {
                    if (!dropping && !buffer.empty()) onLine(buffer);
                    buffer.clear();
                    dropping = false;
                    continue;
                }
                if (dropping) continue;
                if (buffer.size() >= maxLength)
                {
                    buffer.clear();
                    dropping = true;
                    continue;
                }
                buffer += c;
            }
        }

        void reset()
        {
            buffer.clear();
            dropping = false;
        }

    private:
        size_t maxLength;
        std::string buffer;
        bool dropping = false;
    };

    // Calls `send(offset, size)` for consecutive pieces of at most `chunk` bytes covering `length` bytes. Stops and
    // returns false as soon as `send` fails.
    template <typename Send> bool forEachChunk(size_t length, size_t chunk, Send &&send)
    {
        if (chunk == 0) return false;
        for (size_t offset = 0; offset < length; offset += chunk)
        {
            const size_t size = length - offset < chunk ? length - offset : chunk;
            if (!send(offset, size)) return false;
        }
        return true;
    }
}
