#include "websocket/connect_watchdog.hpp"
#include <iostream>
#include <stdexcept>

static void require(bool condition, const char *message)
{
    if (!condition) throw std::runtime_error(message);
}

using Action = ConnectWatchdog::Action;

int main()
{
    try
    {
        // A link that is up but carries no traffic (ATT-1366): the association is renewed once, long before
        // the reboot, so the serial console and the display survive.
        ConnectWatchdog watchdog;
        require(watchdog.poll(true, 1000, false) == Action::None, "the wait did not start quietly");
        require(watchdog.poll(true, 1000 + ConnectWatchdog::RENEW_LINK_AFTER_MS - 1, false) == Action::None,
                "renewed the link too early");
        require(watchdog.poll(true, 1000 + ConnectWatchdog::RENEW_LINK_AFTER_MS, false) == Action::RenewLink,
                "did not renew the link after the grace period");
        require(watchdog.poll(true, 1000 + ConnectWatchdog::RENEW_LINK_AFTER_MS + 10000, false) == Action::None,
                "renewed the link twice in one wait");
        require(watchdog.poll(true, 1000 + ConnectWatchdog::REBOOT_AFTER_MS - 1, false) == Action::None,
                "rebooted too early");
        require(watchdog.poll(true, 1000 + ConnectWatchdog::REBOOT_AFTER_MS, false) == Action::Reboot,
                "did not reboot when the renewed link did not help either");

        // A connection ends the wait; the next outage may renew the link again.
        require(watchdog.poll(false, 200000, false) == Action::None, "acted while not waiting");
        require(watchdog.poll(true, 210000, false) == Action::None, "the next wait did not start from scratch");
        require(watchdog.poll(true, 210000 + ConnectWatchdog::RENEW_LINK_AFTER_MS, false) == Action::RenewLink,
                "the next outage did not renew the link");

        // Renewing the link drops it. The link going down must not forget the renewal, or the reader would
        // renew every 30 s forever and never reach the reboot.
        ConnectWatchdog renewing;
        renewing.poll(true, 1000, false);
        require(renewing.poll(true, 1000 + ConnectWatchdog::RENEW_LINK_AFTER_MS, false) == Action::RenewLink,
                "did not renew the link");
        renewing.pause(); // the renewal took the link down
        require(renewing.poll(true, 40000, false) == Action::None, "the wait did not restart after the link returned");
        require(renewing.poll(true, 40000 + ConnectWatchdog::RENEW_LINK_AFTER_MS, false) == Action::None,
                "renewed the link again although the last renewal did not help");
        require(renewing.poll(true, 40000 + ConnectWatchdog::REBOOT_AFTER_MS, false) == Action::Reboot,
                "never rebooted while the renewed link stayed dead");

        // An advancing certificate sweep re-arms the whole watchdog (ATT-714).
        ConnectWatchdog sweeping;
        sweeping.poll(true, 5000, false);
        require(sweeping.poll(true, 5000 + ConnectWatchdog::REBOOT_AFTER_MS - 1, true) == Action::None,
                "an advancing sweep did not re-arm the watchdog");
        require(sweeping.poll(true, 5000 + ConnectWatchdog::REBOOT_AFTER_MS, false) == Action::None,
                "the re-armed watchdog counted from the old start");

        // millis() of 0 must not look like "not waiting".
        ConnectWatchdog zero;
        zero.poll(true, 0, false);
        require(zero.poll(true, ConnectWatchdog::RENEW_LINK_AFTER_MS + 1, false) == Action::RenewLink,
                "a wait that began at millis() == 0 never counted");
    }
    catch (const std::exception &error)
    {
        std::cerr << error.what() << '\n';
        return 1;
    }
    std::cout << "The connect watchdog renews the link once, then reboots\n";
}
