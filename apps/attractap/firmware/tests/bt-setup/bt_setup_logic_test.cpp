// Host test: the Bluetooth setup shared by the BLE bridge and the readers (src/bt_setup/bt_setup_logic.hpp): the
// setup window, the readers' triggers, the advertised name, line assembly and chunking; and the Lite ring while the
// window is open (src/led/led_bt_setup.hpp).
#include "bt_setup_logic.hpp"
#include "led_bt_setup.hpp"

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

static int failures = 0;
#define CHECK(cond)                                                              \
    do {                                                                         \
        if (!(cond)) { std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); failures++; } \
    } while (0)

using namespace bt_setup;

static void setupWindow()
{
    using C = SetupWindow::Change;
    // A paired device never opens it.
    SetupWindow w;
    CHECK(w.request(true, 1000) == C::None && !w.isOpen());
    CHECK(w.update(false, 2000) == C::None);

    // Unpaired: opens, a second request changes nothing, closes after 10 minutes.
    CHECK(w.request(false, 1000) == C::Open && w.isOpen());
    CHECK(w.request(false, 5000) == C::None);
    CHECK(w.update(false, 1000 + SetupWindow::OPEN_MS - 1) == C::None && w.isOpen());
    CHECK(w.update(false, 1000 + SetupWindow::OPEN_MS) == C::Close && !w.isOpen());
    CHECK(w.update(false, 1000 + SetupWindow::OPEN_MS + 1) == C::None);
    // It does not reopen by itself, only with a new request.
    CHECK(!w.isOpen());

    // Setup done: closes a short time after the reader got paired (the web app reads the status first).
    CHECK(w.request(false, 50000) == C::Open);
    CHECK(w.update(true, 60000) == C::None);
    CHECK(w.update(false, 60000 + SetupWindow::CLOSE_AFTER_PAIRED_MS - 1) == C::None);
    CHECK(w.update(false, 60000 + SetupWindow::CLOSE_AFTER_PAIRED_MS) == C::Close);
    // A new window after a close starts fresh: an old pairing moment does not close it at once.
    CHECK(w.request(false, 200000) == C::Open);
    CHECK(w.update(false, 200001) == C::None && w.isOpen());

    // millis() wrap.
    SetupWindow wrap;
    CHECK(wrap.request(false, 0xFFFFFF00u) == C::Open);
    CHECK(wrap.update(false, SetupWindow::OPEN_MS - 0x101) == C::None);
    CHECK(wrap.update(false, SetupWindow::OPEN_MS - 0x100) == C::Close);
}

static void lineAssembly()
{
    std::vector<std::string> lines;
    auto collect = [&](const std::string &line) { lines.push_back(line); };
    LineAssembler a(24);
    auto feed = [&](const std::string &bytes) { a.feed(reinterpret_cast<const uint8_t *>(bytes.data()), bytes.size(), collect); };

    // A line split over several writes, \r\n endings, empty lines ignored.
    feed("CMND auth.");
    feed("status.get\r");
    CHECK(lines.empty());
    feed("\n\nCMND a\nCMND b");
    CHECK(lines.size() == 2 && lines[0] == "CMND auth.status.get" && lines[1] == "CMND a");
    feed("\n");
    CHECK(lines.size() == 3 && lines[2] == "CMND b");

    // Too long: dropped whole, the next line is intact.
    lines.clear();
    feed(std::string(25, 'x'));
    feed("yyyy\nCMND ok\n");
    CHECK(lines.size() == 1 && lines[0] == "CMND ok");
    // Exactly the limit is fine.
    lines.clear();
    feed(std::string(24, 'z') + "\n");
    CHECK(lines.size() == 1 && lines[0].size() == 24);
    // reset() forgets a partial line (the web app disconnected mid-command).
    lines.clear();
    feed("CMND half");
    a.reset();
    feed("CMND new\n");
    CHECK(lines.size() == 1 && lines[0] == "CMND new");
}

static void chunking()
{
    std::vector<std::pair<size_t, size_t>> parts;
    auto record = [&](size_t offset, size_t size) {
        parts.emplace_back(offset, size);
        return true;
    };
    CHECK(forEachChunk(10, 4, record));
    using Part = std::pair<size_t, size_t>;
    const std::vector<Part> expected{{0, 4}, {4, 4}, {8, 2}};
    CHECK(parts == expected);
    parts.clear();
    CHECK(forEachChunk(8, 4, record) && parts.size() == 2);
    parts.clear();
    CHECK(forEachChunk(0, 4, record) && parts.empty());
    CHECK(!forEachChunk(4, 0, record));
    // A failed send stops the rest.
    int calls = 0;
    CHECK(!forEachChunk(10, 2, [&](size_t, size_t) { return ++calls < 2; }));
    CHECK(calls == 2);
}

static void remaining()
{
    SetupWindow w;
    CHECK(w.remainingMs(1000) == 0);
    w.request(false, 1000);
    CHECK(w.remainingMs(1000) == SetupWindow::OPEN_MS);
    CHECK(w.remainingMs(1000 + SetupWindow::OPEN_MS - 1) == 1);
    CHECK(w.remainingMs(1000 + SetupWindow::OPEN_MS) == 0);
    // Across the millis() wrap.
    SetupWindow wrap;
    wrap.request(false, 0xFFFFFFF0u);
    CHECK(wrap.remainingMs(0x10) == SetupWindow::OPEN_MS - 0x20);

    CHECK(countdown(SetupWindow::OPEN_MS) == "10:00");
    CHECK(countdown(599001) == "10:00");
    CHECK(countdown(599000) == "09:59");
    CHECK(countdown(61000) == "01:01");
    CHECK(countdown(1) == "00:01");
    CHECK(countdown(0) == "00:00");
}

// A reader opens the window at boot (a request with its pairing state) and on the Touch's button.
static void readerTriggers()
{
    using C = SetupWindow::Change;
    // At boot: only an unpaired reader opens it.
    SetupWindow paired;
    CHECK(paired.request(true, 0) == C::None && !paired.isOpen());
    SetupWindow fresh;
    CHECK(fresh.request(false, 0) == C::Open && fresh.isOpen());

    // The button: only on an unpaired reader, only while no window is open.
    CHECK(buttonVisible(false, false));
    CHECK(!buttonVisible(false, true));
    CHECK(!buttonVisible(true, false));
    CHECK(!buttonVisible(true, true));
    // After the boot window timed out, the button opens a new one with a full 10 minutes.
    CHECK(fresh.update(false, SetupWindow::OPEN_MS) == C::Close);
    CHECK(buttonVisible(false, fresh.isOpen()));
    CHECK(fresh.request(false, SetupWindow::OPEN_MS + 5000) == C::Open);
    CHECK(fresh.remainingMs(SetupWindow::OPEN_MS + 5000) == SetupWindow::OPEN_MS);
    CHECK(!buttonVisible(false, fresh.isOpen()));
}

static void names()
{
    const uint8_t mac[6] = {0xDC, 0xB4, 0xD9, 0x21, 0x71, 0xC8};
    char name[MAX_NAME_LENGTH + 1];
    formatName(name, sizeof name, "Attractap Touch", mac);
    CHECK(std::string(name) == "Attractap Touch 71C8");
    formatName(name, sizeof name, "Attractap Lite", mac);
    CHECK(std::string(name) == "Attractap Lite 71C8");
    formatName(name, sizeof name, "Attractap Bridge", mac);
    CHECK(std::string(name) == "Attractap Bridge 71C8");
    // A prefix too long for the scan response is cut; the MAC part always stays.
    formatName(name, sizeof name, "Attractap Something Much Too Long", mac);
    CHECK(std::strlen(name) == MAX_NAME_LENGTH);
    CHECK(std::string(name).substr(MAX_NAME_LENGTH - NAME_SUFFIX_LENGTH) == " 71C8");
}

// Wrong PINs over Bluetooth: 5, then nothing until reset (a power cycle or a window opened at the device).
static void pinGuard()
{
    PinGuard guard;
    for (int i = 0; i < PinGuard::MAX_WRONG; i++)
    {
        CHECK(guard.allowed());
        guard.rejected();
    }
    CHECK(!guard.allowed());
    for (int i = 0; i < 300; i++) guard.rejected(); // no wrap back to "allowed"
    CHECK(!guard.allowed());
    guard.reset();
    CHECK(guard.allowed());

    // Restored after a restart: the count carries over, garbage clamps to "refused".
    CHECK(PinGuard(PinGuard::MAX_WRONG - 1).allowed());
    CHECK(PinGuard(PinGuard::MAX_WRONG - 1).count() == PinGuard::MAX_WRONG - 1);
    CHECK(!PinGuard(PinGuard::MAX_WRONG).allowed());
    CHECK(!PinGuard(0xDEADBEEFu).allowed());
}

// The 10 s close after an authenticated session also across the millis() wrap.
static void closeAfterPairedAcrossWrap()
{
    SetupWindow w;
    CHECK(w.request(false, 0xFFFFF000u) == SetupWindow::Change::Open);
    CHECK(w.update(true, 0xFFFFFFF0u) == SetupWindow::Change::None);
    CHECK(w.update(true, 0xFFFFFFF0u + SetupWindow::CLOSE_AFTER_PAIRED_MS - 1) == SetupWindow::Change::None);
    CHECK(w.update(true, 0xFFFFFFF0u + SetupWindow::CLOSE_AFTER_PAIRED_MS) == SetupWindow::Change::Close);
}

// The Lite ring: the pairing pattern above the Bluetooth setup above "Configuration Required" and "Initializing".
static void liteRing()
{
    using B = LedBtSetup::Base;
    CHECK(LedBtSetup::shows(B::ConfigRequired, true));
    CHECK(LedBtSetup::shows(B::Init, true));
    CHECK(!LedBtSetup::shows(B::PairingPending, true));
    CHECK(!LedBtSetup::shows(B::Other, true));
    for (B base : {B::ConfigRequired, B::Init, B::PairingPending, B::Other}) CHECK(!LedBtSetup::shows(base, false));

    // Waiting for the browser: two short blue pulses every period over a dim ring. Linked: steady.
    std::string pattern;
    for (uint32_t t = 0; t < LedBtSetup::PERIOD_MS; t += 50) pattern += LedBtSetup::level(t, false) == 255 ? '1' : '0';
    CHECK(pattern == "111" + std::string(2, '0') + "111" + std::string(22, '0'));
    CHECK(LedBtSetup::level(LedBtSetup::PERIOD_MS - 1, false) == LedBtSetup::DIM_LEVEL);
    CHECK(LedBtSetup::DIM_LEVEL > 0);
    for (uint32_t t = 0; t < LedBtSetup::PERIOD_MS; t += 50) CHECK(LedBtSetup::level(t, true) == 255);
}

int main()
{
    setupWindow();
    remaining();
    readerTriggers();
    names();
    lineAssembly();
    chunking();
    liteRing();
    pinGuard();
    closeAfterPairedAcrossWrap();
    if (failures) return 1;
    std::puts("bt setup logic ok");
    return 0;
}
