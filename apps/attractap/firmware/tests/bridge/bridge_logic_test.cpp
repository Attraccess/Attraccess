// Host test: the BLE bridge's Wi-Fi fallback, status LEDs, button and PHY detection (src/bridge/bridge_logic.hpp),
// and the Bluetooth setup window, line assembly and chunking (src/bridge/provisioning_logic.hpp).
#include "bridge_logic.hpp"
#include "provisioning_logic.hpp"

#include <cstdio>
#include <string>
#include <string_view>
#include <vector>

static int failures = 0;
#define CHECK(cond)                                                              \
    do {                                                                         \
        if (!(cond)) { std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); failures++; } \
    } while (0)

using namespace bridge;

static void networkFallback()
{
    constexpr uint32_t GRACE = NetworkFallback::ETHERNET_GRACE_MS;
    const uint32_t boot = 5000;

    // No Ethernet since boot: Wi-Fi after the grace period, not before.
    NetworkFallback f;
    CHECK(!f.update(false, true, boot));
    CHECK(!f.update(false, true, boot + GRACE - 1));
    CHECK(f.update(false, true, boot + GRACE));
    // Ethernet returns: back to Ethernet at once.
    CHECK(!f.update(true, true, boot + GRACE + 10));
    // Ethernet drops again: a fresh grace period starts from its last moment up.
    CHECK(!f.update(false, true, boot + GRACE + 20));
    CHECK(!f.update(false, true, boot + 2 * GRACE + 9));
    CHECK(f.update(false, true, boot + 2 * GRACE + 10));

    // Without Wi-Fi credentials there is nothing to fall back to.
    NetworkFallback noWifi;
    CHECK(!noWifi.update(false, false, 0));
    CHECK(!noWifi.update(false, false, 10 * GRACE));
    // Credentials saved later (Serial Configurator) count from the original outage.
    CHECK(noWifi.update(false, true, 10 * GRACE + 1));

    // Ethernet up from boot: Wi-Fi never starts.
    NetworkFallback eth;
    for (uint32_t t = 0; t < 3 * GRACE; t += 1000) CHECK(!eth.update(true, true, t));

    // millis() wraps after ~49 days; the grace period still counts correctly.
    NetworkFallback wrap;
    CHECK(!wrap.update(true, true, 0xFFFFFF00u));
    CHECK(!wrap.update(false, true, 0xFFFFFF10u));
    CHECK(!wrap.update(false, true, GRACE - 0x101));
    CHECK(wrap.update(false, true, GRACE - 0x100));
}

static void leds()
{
    // Power is on while the firmware runs.
    LedInputs in;
    CHECK(ledLevels(in, 0).power && ledLevels(in, 12345).power);

    // Network: on with the API, slow blink with a network but no API, fast blink without a network.
    in.apiConnected = true;
    in.networkUp = true;
    for (uint32_t t : {0u, 250u, 500u, 750u}) CHECK(ledLevels(in, t).network);
    in.apiConnected = false;
    CHECK(ledLevels(in, 0).network && ledLevels(in, SLOW_BLINK_MS / 2 - 1).network);
    CHECK(!ledLevels(in, SLOW_BLINK_MS / 2).network && !ledLevels(in, SLOW_BLINK_MS - 1).network);
    CHECK(ledLevels(in, SLOW_BLINK_MS).network);
    in.networkUp = false;
    CHECK(ledLevels(in, 0).network && !ledLevels(in, FAST_BLINK_MS / 2).network && ledLevels(in, FAST_BLINK_MS).network);

    // BT: off idle, slow blink while scanning or watching, on with a connection.
    in = {};
    CHECK(!ledLevels(in, 0).bt && !ledLevels(in, 700).bt);
    in.ble = BleActivity::Scanning;
    CHECK(ledLevels(in, 0).bt && !ledLevels(in, SLOW_BLINK_MS / 2).bt);
    in.ble = BleActivity::Connected;
    CHECK(ledLevels(in, 0).bt && ledLevels(in, SLOW_BLINK_MS / 2).bt);

    // Holding the button: no feedback for a short press, all LEDs blink fast towards the reset, all on once it runs.
    in = {};
    in.apiConnected = true;
    in.buttonHeldMs = HOLD_FEEDBACK_MS - 1;
    CHECK(ledLevels(in, FAST_BLINK_MS / 2).network);
    in.buttonHeldMs = HOLD_FEEDBACK_MS;
    LedLevels a = ledLevels(in, 0), b = ledLevels(in, FAST_BLINK_MS / 2);
    CHECK(a.power && a.network && a.bt && !b.power && !b.network && !b.bt);
    in.factoryReset = true;
    b = ledLevels(in, FAST_BLINK_MS / 2);
    CHECK(b.power && b.network && b.bt);

    // Bluetooth setup window: the BT LED double-flashes while it waits, stays on with the web app connected, and
    // overrides the proxy activity. The network LED keeps its meaning.
    in = {};
    in.setupWindow = true;
    in.ble = BleActivity::Connected;
    std::string pattern;
    for (uint32_t t = 0; t < DOUBLE_FLASH_PERIOD_MS; t += 50) pattern += ledLevels(in, t).bt ? '1' : '0';
    CHECK(pattern == "110011" + std::string(24, '0'));
    CHECK(ledLevels(in, DOUBLE_FLASH_PERIOD_MS).bt);
    CHECK(ledLevels(in, 0).network && !ledLevels(in, FAST_BLINK_MS / 2).network);
    in.setupLinked = true;
    for (uint32_t t = 0; t < DOUBLE_FLASH_PERIOD_MS; t += 50) CHECK(ledLevels(in, t).bt);
}

static void button()
{
    using A = Button::Action;
    // Short press: reboot on release.
    Button b;
    CHECK(b.update(false, 0) == A::None);
    CHECK(b.update(true, 100) == A::None);
    CHECK(b.heldMs(400) == 300);
    CHECK(b.update(true, 400) == A::None);
    CHECK(b.update(false, 400) == A::Reboot);
    CHECK(b.heldMs(500) == 0);

    // Bounce shorter than the debounce time: nothing.
    CHECK(b.update(true, 1000) == A::None);
    CHECK(b.update(false, 1000 + Button::DEBOUNCE_MS - 1) == A::None);

    // Released after the short-press window but before the setup hold: cancelled.
    CHECK(b.update(true, 2000) == A::None);
    CHECK(b.update(false, 2000 + Button::SHORT_PRESS_MAX_MS) == A::None);
    CHECK(b.update(true, 5000) == A::None);
    CHECK(b.update(false, 5000 + Button::SETUP_HOLD_MS - 1) == A::None);

    // Released between the setup hold and the reset: the Bluetooth setup.
    CHECK(Button::SETUP_HOLD_MS == 3000 && Button::SETUP_HOLD_MS > Button::SHORT_PRESS_MAX_MS);
    CHECK(b.update(true, 20000) == A::None);
    CHECK(b.update(true, 20000 + Button::SETUP_HOLD_MS) == A::None);
    CHECK(b.update(false, 20000 + Button::SETUP_HOLD_MS) == A::Setup);
    CHECK(b.update(true, 30000) == A::None);
    CHECK(b.update(false, 30000 + Button::FACTORY_RESET_HOLD_MS - 1) == A::Setup);

    // Held 10 s: factory reset once, while still held; the release afterwards does nothing.
    CHECK(b.update(true, 10000) == A::None);
    CHECK(b.update(true, 10000 + Button::FACTORY_RESET_HOLD_MS - 1) == A::None);
    CHECK(b.update(true, 10000 + Button::FACTORY_RESET_HOLD_MS) == A::FactoryReset);
    CHECK(b.update(true, 10000 + Button::FACTORY_RESET_HOLD_MS + 5000) == A::None);
    CHECK(b.update(false, 10000 + Button::FACTORY_RESET_HOLD_MS + 6000) == A::None);

    // A new press after that works again.
    CHECK(b.update(true, 40000) == A::None);
    CHECK(b.update(false, 40100) == A::Reboot);

    // The last sample while held came just before 10 s, the release is seen just after: still a factory reset.
    CHECK(b.update(true, 50000) == A::None);
    CHECK(b.update(true, 50000 + Button::FACTORY_RESET_HOLD_MS - 10) == A::None);
    CHECK(b.update(false, 50000 + Button::FACTORY_RESET_HOLD_MS + 40) == A::FactoryReset);
}

static void phy()
{
    CHECK(std::string_view(phyName(0x0007, 0xc0f1)) == "LAN8720");
    CHECK(std::string_view(phyName(0x0243, 0x0c54)) == "IP101");
    CHECK(std::string_view(phyName(0x0022, 0x1555)) == "unknown");
    CHECK(std::string_view(phyName(0xffff, 0xffff)) == "unknown");
}

static void setupWindow()
{
    using C = SetupWindow::Change;
    // A paired bridge never opens it.
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

static void linkGuard()
{
    LinkGuard g;
    CHECK(!g.shouldDrop(0));
    // Not encrypted within 30 s: dropped.
    g.connected(1000);
    CHECK(!g.shouldDrop(1000 + LinkGuard::UNENCRYPTED_MS - 1));
    CHECK(g.shouldDrop(1000 + LinkGuard::UNENCRYPTED_MS));
    // Encrypted: the idle limit applies, every command restarts it.
    g.connected(100000);
    g.encryptedNow();
    CHECK(!g.shouldDrop(100000 + LinkGuard::UNENCRYPTED_MS));
    g.command(200000);
    CHECK(!g.shouldDrop(200000 + LinkGuard::IDLE_MS - 1));
    CHECK(g.shouldDrop(200000 + LinkGuard::IDLE_MS));
    g.disconnected();
    CHECK(!g.shouldDrop(200000 + LinkGuard::IDLE_MS));
    // millis() wrap.
    g.connected(0xFFFFFF00u);
    CHECK(!g.shouldDrop(0x10));
    // Wrong PINs: locked out after the limit, across reconnects, until the next window.
    g.connected(0);
    g.encryptedNow();
    for (int i = 0; i < LinkGuard::MAX_PIN_FAILURES - 1; i++) g.pinFailed();
    CHECK(!g.lockedOut() && !g.shouldDrop(1));
    g.pinFailed();
    CHECK(g.lockedOut() && g.shouldDrop(1));
    g.disconnected();
    g.connected(10);
    g.encryptedNow();
    CHECK(g.lockedOut() && g.shouldDrop(10));
    g.reset();
    CHECK(!g.lockedOut() && !g.shouldDrop(10));
}

int main()
{
    setupWindow();
    linkGuard();
    lineAssembly();
    chunking();
    networkFallback();
    leds();
    button();
    phy();
    if (failures) return 1;
    std::puts("bridge logic ok");
    return 0;
}
