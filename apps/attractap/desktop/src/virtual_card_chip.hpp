#pragma once

#include <array>
#include <cstdint>
#include <functional>
#include <optional>
#include <vector>

/**
 * Message-level model of a DESFire EV2/EV3 or NTAG 424 DNA card for the desktop simulator.
 *
 * It answers complete APDUs like the chip does (select, GetVersion, AuthenticateEV2First, secure
 * ChangeKey, key versions) and holds the card's keys, so the server can run the real card
 * protocol against the simulator. The simulator knows nothing about keys on the reader side.
 */
class VirtualCardChip
{
public:
    static constexpr size_t KeySize = 16;
    static constexpr size_t KeySlotCount = 6;
    using Key = std::array<uint8_t, KeySize>;
    enum class Kind : uint8_t
    {
        Unknown,
        Ntag424,
        Desfire,
    };

    /** The persistent part of the card. */
    struct Memory
    {
        Kind kind = Kind::Ntag424;
        std::array<Key, KeySlotCount> keys{};
        std::array<uint8_t, KeySlotCount> keyVersions{};
        bool applicationExists = false;
        bool failAuthentication = false; // the card refuses every authentication
        bool failWrite = false;          // the card refuses every key change
    };

    /** Called when a key change reaches the card; return true to pull the card out right there. */
    using BeforeWriteHook = std::function<bool()>;

    explicit VirtualCardChip(std::function<void(uint8_t *, size_t)> random = nullptr);

    /** Drop all session state (a card entering the field starts fresh). */
    void reset();

    /** nullopt: the card does not answer (it left the field). */
    std::optional<std::vector<uint8_t>> transceive(Memory &memory, const uint8_t *apdu, size_t length,
                                                   const BeforeWriteHook &beforeWrite = nullptr);

    bool authenticated() const { return session.has_value(); }

private:
    struct Pending
    {
        uint8_t keyNo;
        std::array<uint8_t, 16> rndB;
    };
    struct Session
    {
        std::array<uint8_t, 16> enc;
        std::array<uint8_t, 16> mac;
        std::array<uint8_t, 4> ti;
        uint16_t counter = 0;
        uint8_t keyNo = 0;
    };

    std::vector<uint8_t> status(uint8_t sw2);
    std::vector<uint8_t> error(uint8_t sw2);
    std::vector<uint8_t> authFirst(Memory &memory, uint8_t keyNo);
    std::vector<uint8_t> authSecond(Memory &memory, const uint8_t *data, size_t length);
    std::vector<uint8_t> changeKey(Memory &memory, const uint8_t *apdu, size_t length, const BeforeWriteHook &hook);
    std::vector<uint8_t> versionFrame(const Memory &memory, int frame, bool last);

    std::function<void(uint8_t *, size_t)> random;
    bool applicationSelected = false;
    int versionFrameIndex = 0;
    std::optional<Pending> pending;
    std::optional<Session> session;
};
