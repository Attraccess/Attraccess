#pragma once

#include <atomic>
#include <cstdint>

// What the reader shows while the conversion client works (ATT-1208). The client (main loop) writes it, the
// application reads it in processState() and owns the screen: a routed full-screen layout, never a popup.
namespace ConversionUi
{
    enum class Phase : uint8_t
    {
        None,
        Transfer,   // progress bar, power may still be cut safely
        Verify,     // checking the staged images
        Burn,       // writing the Secure Boot digests: don't unplug
        Bootloader, // brick window 1 and the reboot into brick window 2: don't unplug
    };

    void set(Phase phase, int percent = 0);
    Phase phase();
    int percent();
    // The bootloader or burn phases: the screen warns not to cut the power.
    inline bool dontUnplug(Phase phase)
    {
        return phase == Phase::Burn || phase == Phase::Bootloader;
    }
}
