#pragma once

#include <string>

// Lab-only console commands of the secure-lab build (ATT-1207). They live on the USB console the lab
// overlay keeps (`CMND <topic> <payload>` lines, see serialCommandHandler). Release secure builds have no
// console and do not compile this. Output lines are parsed by tools/secure_lab_reader.py; keep them exact:
//
//   CMND ds.status                       ->  DS_STATUS available=<0|1> record=<0|1> key3=<purpose|unused> fe=<mode>
//   CMND ds.create <mac>                 ->  DS_CREATE_BURNED <0|1> (not for a MAC mismatch), then
//                                            DS_CREATE_RESULT ok | DS_CREATE_RESULT error <code>
//   CMND ds.export                       ->  DS_RECORD_BEGIN / <base64 of the DS record> / DS_RECORD_END
//
// `ds.create` takes the chip MAC in lowercase colon form and compares it with the chip's own; any other
// value prints `DS_CREATE_RESULT error mac-mismatch` without touching an eFuse. `ds.export` prints the
// record (encrypted DS parameters and the public key, nothing secret) on the console only, never through
// ESP_LOG. None of it runs on a boot.
#if defined(ESP_PLATFORM) && defined(ATTRACTAP_SECURE_LAB)
namespace DsConsole
{
    // True when `topic` is one of the ds.* commands (and was handled). `argument` is the raw text after the topic.
    bool handle(const std::string &topic, const std::string &argument);
}
#endif
