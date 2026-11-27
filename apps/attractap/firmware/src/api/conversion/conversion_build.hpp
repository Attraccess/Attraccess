#pragma once

// Compile-time switches of the "Secure this reader" conversion (ATT-1208). Pure: host tests include this header
// with different defines to prove which builds can do what.
//
//   ATTRACTAP_CONVERSION_CLIENT            plain build of a variant with a secure profile build: runs steps 1-6
//                                          (CMakeLists.txt sets it; never on secure, demo or bridge builds)
//   ATTRACTAP_CONVERSION_STOP_BEFORE_BURN  lab/HIL builds only: the reader refuses every burn command
//   ATTRACTAP_RD_DIS_LOCK                  derived below: the secure app may write WR_DIS_RD_DIS at the end of step 8
//
// The firmware writes exactly two eFuse fields itself, both only during a conversion:
//   1. step 4 (plain app): KEY0/KEY1 with the purposes SECURE_BOOT_DIGEST0/1, only on the server's burn command;
//   2. step 8 (secure app): WR_DIS for RD_DIS, after the NVS migration, only on release secure builds.
// Everything else (Secure Boot, flash encryption, the NVS HMAC key, SECURE_VERSION) is burned by the ESP-IDF
// bootloader and NVS code as configured in sdkconfig.secure.

#if defined(ESP_PLATFORM) && __has_include("sdkconfig.h")
#include "sdkconfig.h"
#endif

// The RD_DIS lock exists only in a release secure image: the release overlay (ATTRACTAP_SECURE_PROFILE, never
// set together with ATTRACTAP_SECURE_LAB), a release build (no lab variant, no test hooks), no demo, no debug
// overlay (sdkconfig.debug), no stop-before-burn. Anything else compiles the lock out entirely.
#if defined(ATTRACTAP_SECURE_BUILD) && defined(ATTRACTAP_SECURE_PROFILE) && !defined(ATTRACTAP_SECURE_LAB) &&      \
    defined(ATTRACTAP_RELEASE) && !defined(ATTRACTAP_TEST_HOOKS) && !defined(DEMO_MODE) &&                       \
    !defined(CONFIG_COMPILER_OPTIMIZATION_DEBUG) && !defined(ATTRACTAP_CONVERSION_STOP_BEFORE_BURN)
#define ATTRACTAP_RD_DIS_LOCK 1
#endif

#if defined(ATTRACTAP_CONVERSION_CLIENT) && (defined(ATTRACTAP_SECURE_BUILD) || defined(DEMO_MODE))
#error "The conversion client is for plain, non-demo builds only"
#endif
#if defined(ATTRACTAP_CONVERSION_STOP_BEFORE_BURN) && defined(ATTRACTAP_RELEASE)
#error "Stop-before-burn is a lab/HIL option and never part of a release build"
#endif

namespace ConversionBuild
{
    // This build runs the plain-app conversion client and advertises `secureConversion`.
    constexpr bool client()
    {
#ifdef ATTRACTAP_CONVERSION_CLIENT
        return true;
#else
        return false;
#endif
    }

    // Lab/HIL builds: every `conversion.burn` is refused with reason `stop-before-burn`.
    constexpr bool stopBeforeBurn()
    {
#ifdef ATTRACTAP_CONVERSION_STOP_BEFORE_BURN
        return true;
#else
        return false;
#endif
    }

    // The secure app compiles the WR_DIS_RD_DIS lock (step 8). False on secure-lab, demo, debug and test builds.
    constexpr bool rdDisLock()
    {
#ifdef ATTRACTAP_RD_DIS_LOCK
        return true;
#else
        return false;
#endif
    }

    // The secure app migrates staged NVS data (step 8). The lab build migrates too, it only never locks RD_DIS.
    constexpr bool migration()
    {
#ifdef ATTRACTAP_SECURE_BUILD
        return true;
#else
        return false;
#endif
    }
}
