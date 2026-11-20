#pragma once

#include <cstdint>

/**
 * Decides what a reader that cannot reach its server does about it (ATT-714, ATT-1366).
 *
 * After a Wi-Fi rejoin the Touch V1 can end up with an association that sends ARP requests but never
 * receives the replies, so no TCP connect leaves the reader until it reboots. Renewing the association
 * once, after RENEW_LINK_AFTER_MS, heals that without a reboot (which would cost the display and the
 * serial console their state); the reboot after REBOOT_AFTER_MS stays the last resort.
 */
class ConnectWatchdog
{
public:
    enum class Action
    {
        None,
        RenewLink,
        Reboot,
    };

    static constexpr uint32_t RENEW_LINK_AFTER_MS = 30000;
    static constexpr uint32_t REBOOT_AFTER_MS = 90000;

    /**
     * @param waiting        network and server config are present but the websocket is not connected
     * @param sweepAdvanced  the certificate sweep moved on: that re-arms the watchdog
     */
    Action poll(bool waiting, uint32_t nowMs, bool sweepAdvanced)
    {
        if (!waiting)
        {
            reset();
            return Action::None;
        }
        if (startMs == 0 || sweepAdvanced)
        {
            startMs = nowMs ? nowMs : 1;
            return Action::None;
        }
        const uint32_t elapsed = nowMs - startMs;
        if (elapsed >= REBOOT_AFTER_MS)
        {
            return Action::Reboot;
        }
        if (!linkRenewed && elapsed >= RENEW_LINK_AFTER_MS)
        {
            linkRenewed = true;
            return Action::RenewLink;
        }
        return Action::None;
    }

    /** Nothing to wait for (connected, or no server configured): the next wait starts from scratch. */
    void reset()
    {
        startMs = 0;
        linkRenewed = false;
    }

    /**
     * The network link is down (or connection attempts are off): stop the clock, but remember a renewal.
     * Renewing the link drops it, so forgetting the renewal here would renew it every 30 s forever and
     * never reach the reboot. Only a server connection clears the renewal.
     */
    void pause()
    {
        startMs = 0;
    }

private:
    uint32_t startMs = 0; // 0 = not waiting
    bool linkRenewed = false;
};
