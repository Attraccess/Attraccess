#pragma once

#include <string>

#include "conversion_messages.hpp"

// The eFuse side of the conversion (ATT-1208). Device only (ESP32-S3 readers with a conversion client or the secure
// profile); host builds get stubs that report nothing and burn nothing.
//
// The two eFuse writes the firmware ever performs itself:
//   burnDigests()  step 4, plain app: KEY0/KEY1 = the server's two Secure Boot digests, only after decideBurn()
//   lockRdDis()    step 8, secure app: WR_DIS for RD_DIS, compiled only into release secure images
//                  (ConversionBuild::rdDisLock(); secure-lab, demo, debug and test builds have no such code)
namespace ConversionEfuse
{
    // Chip, flash, partition table, key blocks and protection fuses for `conversion.preflight-report`.
    ConversionMessages::PreflightFacts preflightFacts();
    std::string ownMac();
    // KEY0 (index 0) or KEY1 (index 1).
    ConversionMessages::KeySlot keySlot(int index);
    const char *keyPurposeName(int index);
    // Burns both digests in one eFuse batch with their purposes; false (nothing burned) on any error.
    bool burnDigests(const Staging::Digest &digest0, const Staging::Digest &digest1);

    bool rdDisLocked();
    // KEY4 holds the NVS HMAC key and is read-protected: the state RD_DIS may be locked in.
    bool nvsKeyReadProtected();
    // Writes WR_DIS_RD_DIS once; true when the lock is (now) set. Always false where the lock is compiled out.
    bool lockRdDis();
}
