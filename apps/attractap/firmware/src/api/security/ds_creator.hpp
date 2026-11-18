#pragma once

#include <string>

// Creates the reader's Digital Signature key (ATT-1207). IRREVERSIBLE: burns eFuse KEY3 as
// HMAC_DOWN_DIGITAL_SIGNATURE (read-protected) and write-protects RD_DIS. Secure builds on the device only.
//
// ATT-1207 triggers it from exactly one place: the lab console command `ds.create <mac>` of the
// secure-lab build (ds_console.cpp). Release secure builds compile this code but nothing calls it; T3
// (ATT-1208, conversion state `creating-key`) wires its trigger. It never runs on an ordinary boot.
//
// Order (nothing after the burn is ever retried):
//   1. refuse unless KEY3 and its purpose are unused, KEY2 holds XTS_AES_128_KEY and KEY4 HMAC_UP, both
//      read-protected, and NVS init succeeded;
//   2. generate a 256-bit HMAC key and an RSA-3072 key (e = 65537) in software;
//   3. encrypt the DS parameters (esp_ds_encrypt_params);
//   4. write the DS record (encrypted flash) and read it back: only then
//   5. burn KEY3 (HMAC_DOWN_DIGITAL_SIGNATURE, read-protected) in one eFuse batch;
//   6. DS self-test: RSA-PSS and PKCS#1 v1.5 signatures verified against the public key;
//   7. zero all plaintext key material in RAM;
//   8. lock RD_DIS (write-protect it).
#if defined(ESP_PLATFORM) && defined(ATTRACTAP_SECURE_BUILD)
namespace DsCreator
{
    struct Result
    {
        bool ok = false;
        // Short kebab-case token (printed as `DS_CREATE_RESULT error <code>`); "ok" on success.
        std::string code = "ok";
        // The eFuse burn started. When true and !ok, KEY3 may be burned: never retry.
        bool burned = false;
    };

    // Everything creation needs to find true before it starts; empty string when all hold.
    std::string refusal();
    Result create();
}
#endif
