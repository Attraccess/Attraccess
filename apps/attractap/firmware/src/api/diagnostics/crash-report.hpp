#pragma once
// Reader ports of the crash report upload (crash-report.cpp); the state machine is coredump-upload.hpp.

#include <cstddef>
#include <functional>
#include <memory>
#include "coredump-upload.hpp"
#include "crash-record.hpp"

// NVS, coredump flash and heap access for the upload. Without ESP-IDF (desktop simulator) nothing is
// ever pending.
std::unique_ptr<crashupload::Ports> makeCrashUploadPorts(std::function<bool(const char *, size_t)> send,
                                                         std::function<bool()> otaInProgress);

#ifdef ESP_PLATFORM
// Size and CRC-32 of the valid coredump in flash (read once per boot); size 0 when there is none,
// it fails its checksum, or coredumps are compiled out (secure profile).
CrashDumpFingerprint crashFlashDumpFingerprint();
#endif
