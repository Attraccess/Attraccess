#pragma once

// Bluetooth setup (ATT-1315, ATT-1371): its decisions, as plain C++ so host tests can drive them. bt_setup.cpp wires
// them to NimBLE and to the command handler; the BLE bridge (src/bridge) and the readers (src/application) open it.

#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <string>

namespace bt_setup
{
    // When the Bluetooth setup is reachable. It opens only on request (the bridge: the button held 3 s; a reader:
    // at boot, or the "Bluetooth setup" button on a Touch screen) and only on a device that is not paired with an
    // Attraccess server yet (fresh flash, factory reset, or a pairing that never completed). It closes after
    // OPEN_MS, CLOSE_AFTER_PAIRED_MS after the reader got paired (the web app reads the new status first), or with a
    // reboot (nothing is persisted). A request while it is open changes nothing.
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

        // Someone asked for the setup. `paired`: the device holds pairing credentials of a server.
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

        // Time left until the window times out (0 when closed).
        uint32_t remainingMs(uint32_t now) const
        {
            if (!open) return 0;
            const uint32_t elapsed = now - openedAt;
            return elapsed >= OPEN_MS ? 0 : OPEN_MS - elapsed;
        }

    private:
        bool open = false;
        bool sawPaired = false;
        uint32_t openedAt = 0;
        uint32_t pairedSince = 0;
    };

    // The Touch screens offer a "Bluetooth setup" button that opens a new window: only on a reader that is not paired
    // and only while no window is open (an open window shows its status line instead).
    inline bool buttonVisible(bool paired, bool windowOpen) { return !paired && !windowOpen; }

    // The name the setup advertises (scan response): "<prefix> XXXX", XXXX the last two bytes of the Bluetooth MAC
    // in hex, so the user can pick the right device in the browser's list. It must fit the 31-byte scan response
    // with its two header bytes: at most MAX_NAME_LENGTH characters (longer prefixes are cut).
    constexpr size_t MAX_NAME_LENGTH = 29;
    constexpr size_t NAME_SUFFIX_LENGTH = 5; // " XXXX"
    inline void formatName(char *out, size_t size, const char *prefix, const uint8_t mac[6])
    {
        snprintf(out, size, "%.*s %02X%02X", static_cast<int>(MAX_NAME_LENGTH - NAME_SUFFIX_LENGTH), prefix, mac[4],
                 mac[5]);
    }

    // Wrong PINs over Bluetooth: anyone in range can connect to an open window, so the PIN must not be guessable
    // there. After MAX_WRONG wrong PINs every PIN-checked command is refused until reset(): a power cycle or a window
    // opened by someone at the device (bt_setup.cpp keeps the count across the reader's own restarts). The console
    // has no limit: it needs the cable.
    class PinGuard
    {
    public:
        static constexpr uint8_t MAX_WRONG = 5;

        PinGuard() = default;
        // A count kept elsewhere (RTC memory); anything above the limit counts as the limit.
        explicit PinGuard(uint32_t stored) : wrong(stored > MAX_WRONG ? MAX_WRONG : static_cast<uint8_t>(stored)) {}
        uint8_t count() const { return wrong; }

        bool allowed() const { return wrong < MAX_WRONG; }
        void rejected()
        {
            if (wrong < MAX_WRONG) wrong++;
        }
        void reset() { wrong = 0; }

    private:
        uint8_t wrong = 0;
    };

    // Who may hold the setup link. The window is open to anyone in radio range (Just Works pairing confirms nothing)
    // and the controller takes one link at a time, so a link that is not encrypted within UNENCRYPTED_MS, or sends no
    // command for IDLE_MS, is dropped: one idle connection cannot hold the setup for the whole window. (Wrong PINs
    // are PinGuard's.)
    class LinkGuard
    {
    public:
        static constexpr uint32_t UNENCRYPTED_MS = 30000;
        static constexpr uint32_t IDLE_MS = 5 * 60 * 1000;

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

        // Whether the current link must be dropped now.
        bool shouldDrop(uint32_t now) const
        {
            if (!linked || terminating) return false;
            // A time stamped after `now` was read (another task) is no quiet time at all.
            const int32_t quiet = static_cast<int32_t>(now - lastActivity);
            if (quiet <= 0) return false;
            return static_cast<uint32_t>(quiet) >= (encrypted ? IDLE_MS : UNENCRYPTED_MS);
        }

    private:
        bool linked = false;
        bool encrypted = false;
        bool terminating = false;
        uint32_t lastActivity = 0;
    };

    // A remaining time in whole seconds, rounded up (the countdown never shows 00:00 while open).
    inline uint32_t countdownSeconds(uint32_t remainingMs) { return remainingMs / 1000 + (remainingMs % 1000 != 0); }

    // "mm:ss" of a remaining time (countdownSeconds).
    inline std::string countdown(uint32_t remainingMs)
    {
        const uint32_t seconds = countdownSeconds(remainingMs);
        char text[12];
        snprintf(text, sizeof text, "%02u:%02u", static_cast<unsigned>(seconds / 60), static_cast<unsigned>(seconds % 60));
        return text;
    }

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
