#pragma once

#include <cstdio>

// Plugin BLE proxy (ATT-1033/ATT-1036): the reader is a dumb, bounded BLE central for the API.
// The API sends one request at a time per session (protocol v1, JSON EVENT messages, bytes as base64),
// the reader enforces the allowlist the API sent at session open, its own deadlines and its own bounds.
//
// Everything in this header is plain C++ so host tests can drive the whole state machine without NimBLE.

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#endif

namespace ble
{
    constexpr int PROTOCOL_VERSION = 1;

    // Bounds of protocol v1. The capability reports them, so the API never needs to guess.
    constexpr uint32_t MAX_SCAN_MS = 15000;
    constexpr uint8_t MAX_SCAN_RESULTS = 32;
    // Distinct addresses tracked during one scan (matching ones are never evicted).
    constexpr size_t MAX_SCAN_CANDIDATES = 64;
    constexpr uint16_t MAX_MTU = 517;
    constexpr uint16_t MIN_MTU = 23;
    constexpr size_t MAX_PAYLOAD_BYTES = 512;
    constexpr size_t MAX_NOTIFICATION_QUEUE = 32;
    constexpr size_t MAX_NOTIFICATION_QUEUE_BYTES = 16 * 1024;
    constexpr size_t MAX_ALLOWLIST_ENTRIES = 16;
    constexpr size_t MAX_PENDING_REQUESTS = 16;
    constexpr size_t MAX_SESSION_ID_LENGTH = 64;
    constexpr size_t MAX_FILTER_UUIDS = 8;
    constexpr size_t MAX_FILTER_MANUFACTURERS = 8;
    constexpr size_t MAX_NAME_PREFIX = 64;
    constexpr uint32_t MAX_OP_TIMEOUT_MS = 60000;
    // An operation without `timeoutMs` gets the API's default.
    constexpr uint32_t DEFAULT_OP_TIMEOUT_MS = 10000;
    constexpr uint32_t MAX_CONNECT_TIMEOUT_MS = 60000;
    constexpr uint32_t MAX_LEASE_MS = 900000;
    // The reader's own deadlines run a little behind the API's, so the API normally decides first.
    constexpr uint32_t LEASE_GRACE_MS = 10000;
    constexpr uint32_t OP_GRACE_MS = 2000;
    // A close or a cancelled connect waits this long for the controller before the owner is released anyway.
    constexpr uint32_t RELEASE_DEADLINE_MS = 5000;
    // NimBLE ends a GATT procedure after the 30 s ATT timeout; anything stuck longer drops the link.
    constexpr uint32_t STUCK_OP_MS = 35000;

    enum class Code : uint8_t
    {
        None,
        ReaderBusy,
        ReaderOffline,
        ReaderUnsupported,
        OperationNotAllowed,
        UnknownCharacteristic,
        PayloadTooLarge,
        InvalidArgument,
        Timeout,
        Cancelled,
        DeviceNotFound,
        ConnectionFailed,
        Disconnected,
        GattError,
        NotificationOverflow,
        SessionClosed,
        Internal,
    };

    // The ATT-1032 plugin error code each value stands for.
    inline const char *codeName(Code code)
    {
        switch (code)
        {
        case Code::ReaderBusy: return "READER_BUSY";
        case Code::ReaderOffline: return "READER_OFFLINE";
        case Code::ReaderUnsupported: return "READER_UNSUPPORTED";
        case Code::OperationNotAllowed: return "OPERATION_NOT_ALLOWED";
        case Code::UnknownCharacteristic: return "UNKNOWN_CHARACTERISTIC";
        case Code::PayloadTooLarge: return "PAYLOAD_TOO_LARGE";
        case Code::InvalidArgument: return "INVALID_ARGUMENT";
        case Code::Timeout: return "TIMEOUT";
        case Code::Cancelled: return "CANCELLED";
        case Code::DeviceNotFound: return "DEVICE_NOT_FOUND";
        case Code::ConnectionFailed: return "CONNECTION_FAILED";
        case Code::Disconnected: return "DISCONNECTED";
        case Code::GattError: return "GATT_ERROR";
        case Code::NotificationOverflow: return "NOTIFICATION_OVERFLOW";
        case Code::SessionClosed: return "SESSION_CLOSED";
        case Code::Internal: return "INTERNAL";
        case Code::None:
        default: return "NONE";
        }
    }

    // A failure with a safe diagnostic (never payload bytes).
    struct Error
    {
        Code code = Code::None;
        char detail[40] = "";

        Error() = default;
        Error(Code c, const char *d = "") : code(c)
        {
            std::snprintf(detail, sizeof detail, "%s", d ? d : "");
        }
        bool ok() const { return code == Code::None; }
    };

    // Operation bits of an allowlist entry (protocol v1).
    enum OpBits : uint8_t
    {
        OP_READ = 1,
        OP_WRITE = 2,
        OP_WRITE_WITHOUT_RESPONSE = 4,
        OP_NOTIFY = 8,
        OP_INDICATE = 16,
    };

    // A 128-bit UUID in the textual byte order (xxxxxxxx-... from left to right).
    struct Uuid
    {
        uint8_t b[16] = {};
        bool operator==(const Uuid &o) const { return std::memcmp(b, o.b, sizeof b) == 0; }
        bool operator!=(const Uuid &o) const { return !(*this == o); }
    };

    // b[0] is the first byte of the textual form (AA in AA:BB:...).
    struct Address
    {
        uint8_t b[6] = {};
        bool random = false;
        bool operator==(const Address &o) const { return random == o.random && std::memcmp(b, o.b, sizeof b) == 0; }
        bool operator!=(const Address &o) const { return !(*this == o); }
    };

    struct AllowEntry
    {
        Uuid service;
        Uuid characteristic;
        uint8_t ops = 0;
        uint16_t maxRead = 0;
        uint16_t maxWrite = 0;
        uint16_t maxNotification = 0;
    };

    // Bulk buffers (values, scan results, queued requests) live in PSRAM on the reader, so BLE work costs
    // no internal RAM beyond NimBLE's own controller needs.
    template <typename T>
    struct PsAlloc
    {
        using value_type = T;
        PsAlloc() = default;
        template <typename U>
        PsAlloc(const PsAlloc<U> &) {}
        T *allocate(size_t n)
        {
#ifdef ESP_PLATFORM
            void *p = heap_caps_malloc(n * sizeof(T), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
            if (!p) p = std::malloc(n * sizeof(T));
#else
            void *p = std::malloc(n * sizeof(T));
#endif
            // C++ exceptions are off on the reader: an exhausted heap ends like std::allocator would.
            if (!p) std::abort();
            return static_cast<T *>(p);
        }
        void deallocate(T *p, size_t) { std::free(p); }
        template <typename U>
        bool operator==(const PsAlloc<U> &) const { return true; }
        template <typename U>
        bool operator!=(const PsAlloc<U> &) const { return false; }
    };

    using Bytes = std::vector<uint8_t, PsAlloc<uint8_t>>;
    template <typename T>
    using PsVector = std::vector<T, PsAlloc<T>>;

    enum class CommandType : uint8_t
    {
        Scan,
        Open,
        Read,
        Write,
        Subscribe,
        Unsubscribe,
        Cancel,
        Close,
    };

    // One parsed server request. Only the fields of its type are set.
    struct Command
    {
        CommandType type = CommandType::Read;
        uint32_t requestId = 0;
        char sessionId[MAX_SESSION_ID_LENGTH + 1] = "";
        // Set by the proxy: commands of an older websocket connection are dropped.
        uint32_t generation = 0;
        uint32_t receivedMs = 0;

        // BLE_SCAN
        uint32_t durationMs = 0;
        uint8_t maxResults = MAX_SCAN_RESULTS;
        PsVector<Uuid> filterServices;
        PsVector<uint16_t> filterManufacturers;
        bool hasNamePrefix = false;
        char namePrefix[MAX_NAME_PREFIX + 1] = "";

        // BLE_SESSION_OPEN
        Address address;
        uint32_t connectTimeoutMs = 0;
        uint32_t leaseMs = 0;
        PsVector<AllowEntry> allowlist;

        // GATT operations
        Uuid service;
        Uuid characteristic;
        uint32_t timeoutMs = 0;
        bool withoutResponse = false;
        bool indicate = false;
        Bytes value;

        // BLE_CANCEL: the request to cancel
        uint32_t targetRequestId = 0;
    };

    // One advertising report, already decoded (advertising data and scan response merged).
    struct Advertisement
    {
        Address address;
        int8_t rssi = 0;
        bool hasRssi = false;
        std::string name;
        PsVector<Uuid> serviceUuids;
        struct Manufacturer
        {
            uint16_t companyId = 0;
            Bytes data;
        };
        PsVector<Manufacturer> manufacturers;
    };
}
