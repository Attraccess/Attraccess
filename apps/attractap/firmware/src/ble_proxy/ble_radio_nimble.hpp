#pragma once

// NimBLE central behind IBleRadio (reader builds with NimBLE only). NimBLE runs its host task; every event it
// reports goes to IRadioEvents, which hands it to the proxy task. Nothing here decides anything: the state
// machine (ble_core) does.

#include "ble_proxy.hpp"

#if ATTRACTAP_BLE_PROXY

#include <mutex>

#include "ble_core.hpp"

// NimBLE types (host/ble_gap.h, host/ble_gatt.h), declared here so only the .cpp includes NimBLE.
struct ble_gap_event;
struct ble_gatt_error;
struct ble_gatt_svc;
struct ble_gatt_chr;
struct ble_gatt_dsc;
struct ble_gatt_attr;

namespace ble
{
    class IRadioEvents
    {
    public:
        virtual ~IRadioEvents() = default;
        virtual void radioAdvertisement(const Address &address, int8_t rssi, bool hasRssi, const uint8_t *data,
                                        size_t length) = 0;
        virtual void radioScanComplete() = 0;
        virtual void radioConnected(const Address &peer, uint16_t mtu) = 0;
        virtual void radioConnectFailed(const Error &error) = 0;
        virtual void radioDisconnected(int reason) = 0;
        virtual void radioOpDone(uint32_t token, const Error &error, Bytes &&value) = 0;
        virtual void radioNotification(const Uuid &service, const Uuid &characteristic, const uint8_t *data,
                                       size_t length) = 0;
    };

    class NimbleRadio : public IBleRadio
    {
    public:
        explicit NimbleRadio(IRadioEvents &events) : events(events) {}

        Error init() override;
        Error startScan(uint32_t durationMs) override;
        void stopScan() override;
        Error connect(const Address &address, uint32_t timeoutMs, const PsVector<AllowEntry> &allowlist) override;
        void cancelConnect() override;
        void disconnect() override;
        Start read(uint32_t token, const Uuid &service, const Uuid &characteristic, Error &error) override;
        Start write(uint32_t token, const Uuid &service, const Uuid &characteristic, const Bytes &value,
                    bool withoutResponse, Error &error) override;
        Start setNotifications(uint32_t token, const Uuid &service, const Uuid &characteristic, uint8_t mode,
                               Error &error) override;

        // NimBLE C callbacks (public so the static trampolines in the .cpp can reach them).
        int onGapEvent(::ble_gap_event *event);
        int onMtu(uint16_t conn, const ::ble_gatt_error *error, uint16_t mtu);
        int onService(uint16_t conn, const ::ble_gatt_error *error, const ::ble_gatt_svc *service);
        int onCharacteristic(uint16_t conn, const ::ble_gatt_error *error, const ::ble_gatt_chr *chr);
        int onDescriptor(uint16_t conn, const ::ble_gatt_error *error, uint16_t chrValHandle,
                         const ::ble_gatt_dsc *dsc);
        int onRead(uint16_t conn, const ::ble_gatt_error *error, ::ble_gatt_attr *attr);
        int onWrite(uint16_t conn, const ::ble_gatt_error *error, ::ble_gatt_attr *attr);
        void onSync();

    private:
        struct Characteristic
        {
            Uuid service;
            Uuid uuid;
            uint16_t defHandle = 0;
            uint16_t valHandle = 0;
            uint16_t endHandle = 0;
            uint16_t cccdHandle = 0;
            bool wantsCccd = false;
        };
        struct Service
        {
            Uuid uuid;
            uint16_t start = 0;
            uint16_t end = 0;
            bool found = false;
        };

        IRadioEvents &events;
        std::recursive_mutex mutex; // guards the connection state and the handle table (host task vs proxy task)
        bool synced = false;
        uint8_t ownAddressType = 0;
        uint16_t conn = 0xffff;
        bool connecting = false;
        bool connectReported = false;
        // A link dropped during discovery: its failure is reported once the link is really down.
        bool hasPendingFailure = false;
        Error pendingFailure;
        uint16_t mtu = MIN_MTU;
        Address peer;
        PsVector<AllowEntry> allowlist;
        PsVector<Service> services;
        PsVector<Characteristic> characteristics;
        size_t discoveryService = 0;
        size_t discoveryCharacteristic = 0;
        uint32_t opToken = 0;
        Bytes opValue;

        void failConnect(const Error &error);
        void discoverNextService();
        void discoverNextDescriptor();
        void finishDiscovery();
        const Characteristic *find(const Uuid &service, const Uuid &characteristic);
        void reset();
    };
}

#endif
