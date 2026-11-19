#pragma once

#include <cstdint>

// What this firmware build is, as READER_FIRMWARE_INFO reports it (ATT-1207). All compile-time:
//   ATTRACTAP_SECURE_BUILD  secure profile (release or lab): Secure Boot and flash encryption
//   ATTRACTAP_SECURE_LAB    the lab-only secure test reader (development-mode flash encryption, USB console)
//   ATTRACTAP_RELEASE       a release build: not a lab variant and without test hooks
// The server treats all of it as the reader's claim. Only a release secure build whose eFuse report
// passes and whose session is authenticated with the paired certificate ever counts as "secured".
namespace BuildProfile
{
    constexpr bool secureBuild()
    {
#ifdef ATTRACTAP_SECURE_BUILD
        return true;
#else
        return false;
#endif
    }

    constexpr bool lab()
    {
#ifdef ATTRACTAP_SECURE_LAB
        return true;
#else
        return false;
#endif
    }

    constexpr const char *name()
    {
        return lab() ? "secure-lab" : secureBuild() ? "secure" : "plain";
    }

    constexpr bool release()
    {
#if defined(ATTRACTAP_RELEASE) && !defined(ATTRACTAP_TEST_HOOKS) && !defined(DEMO_MODE)
        return true;
#else
        return false;
#endif
    }

    // The app's secure_version (esp_app_desc, CONFIG_BOOTLOADER_APP_SECURE_VERSION); -1 on plain builds.
    int64_t secureVersion();
    // The marker string `attractap-secure-profile-v1` embedded in secure builds (see secure_packaging.py).
    const char *secureProfileMarker();
}
