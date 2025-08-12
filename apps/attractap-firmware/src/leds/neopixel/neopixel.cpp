// Restored NeoPixelBus-based implementation (packed 0xRRGGBB framebuffer)
#include "neopixel.hpp"
#include <math.h>

namespace
{
    using crgb_t = uint32_t; // 0xRRGGBB packed color for local helpers

    // Utility: wrap an index on the 8-LED ring
    inline int wrapIndex(int index, int count)
    {
        int m = index % count;
        return m < 0 ? m + count : m;
    }

    inline uint8_t scale8(uint8_t value, uint8_t scale)
    {
        return (uint16_t(value) * uint16_t(scale) + 127) / 255; // rounded
    }

    inline uint8_t chanR(crgb_t c) { return (c >> 16) & 0xFF; }
    inline uint8_t chanG(crgb_t c) { return (c >> 8) & 0xFF; }
    inline uint8_t chanB(crgb_t c) { return (c >> 0) & 0xFF; }
    inline crgb_t makeColor(uint8_t r, uint8_t g, uint8_t b)
    {
        return (crgb_t)(((uint32_t)r << 16) | ((uint32_t)g << 8) | (uint32_t)b);
    }

    // Utility: scaled copy of a color (approx. "video" safe)
    inline crgb_t scaledColor(crgb_t c, uint8_t scale)
    {
        uint8_t r = scale8(chanR(c), scale);
        uint8_t g = scale8(chanG(c), scale);
        uint8_t b = scale8(chanB(c), scale);
        return makeColor(r, g, b);
    }

    inline uint8_t addSaturate(uint8_t a, uint8_t b)
    {
        uint16_t s = uint16_t(a) + uint16_t(b);
        return s > 255 ? 255 : uint8_t(s);
    }

    inline crgb_t addColor(crgb_t base, crgb_t overlay)
    {
        uint8_t r = addSaturate(chanR(base), chanR(overlay));
        uint8_t g = addSaturate(chanG(base), chanG(overlay));
        uint8_t b = addSaturate(chanB(base), chanB(overlay));
        return makeColor(r, g, b);
    }

    // Utility: set LED with wrap
    inline void setLedWrapped(crgb_t *buffer, int count, int index, crgb_t color)
    {
        buffer[wrapIndex(index, count)] = color;
    }

    // Utility: add LED with wrap (for tails/overlays)
    inline void addLedWrapped(crgb_t *buffer, int count, int index, crgb_t color)
    {
        int idx = wrapIndex(index, count);
        buffer[idx] = addColor(buffer[idx], color);
    }

    inline void fillSolid(crgb_t *buffer, int count, crgb_t color)
    {
        for (int i = 0; i < count; ++i)
        {
            buffer[i] = color;
        }
    }

    using LedDriver = NeoPixelBus<NeoGrbFeature, NeoEsp32Rmt0Ws2812xMethod>;

    inline void flushFrame(LedDriver &driver, crgb_t *buffer, int count)
    {
        if (count <= 0)
            return;
        for (int i = 0; i < count; ++i)
        {
            const uint8_t r = chanR(buffer[i]);
            const uint8_t g = chanG(buffer[i]);
            const uint8_t b = chanB(buffer[i]);
            driver.SetPixelColor(i, RgbColor(r, g, b));
        }
        driver.Show();
    }

    // Colors (sRGB)
    const crgb_t COLOR_BLUE_NET = 0x007BFF; // #007BFF
    const crgb_t COLOR_CYAN_WS = 0x00E5FF;  // #00E5FF
    const crgb_t COLOR_AMBER = 0xFFC107;    // #FFC107
    const crgb_t COLOR_RED_ERR = 0xFF0000;  // Pure red #FF0000
    const crgb_t COLOR_GREEN_OK = 0x00FF00; // Pure green #00FF00
    const crgb_t COLOR_WHITE = 0xFFFFFF;    // #FFFFFF
    const crgb_t COLOR_BLUE_ACT = 0x2979FF; // #2979FF
    const crgb_t COLOR_PURPLE = 0x9C27B0;   // #9C27B0
    const crgb_t COLOR_ORANGE = 0xFF9100;   // #FF9100
    const crgb_t COLOR_MAGENTA = 0xD500F9;  // #D500F9

    // Timing helpers
    inline uint8_t breathe8(uint8_t bpm, uint8_t minV = 5, uint8_t maxV = 255)
    {
        // Sine wave between minV..maxV at bpm
        float t = millis() / 1000.0f;
        float freq = (float)bpm / 60.0f;
        float phase = sinf(2.0f * 3.14159265f * freq * t) * 0.5f + 0.5f;
        uint8_t range = (uint8_t)(maxV - minV);
        return (uint8_t)(minV + phase * range);
    }

    inline int stepFromPeriod(uint32_t nowMs, uint16_t periodMs, int steps)
    {
        if (periodMs == 0 || steps <= 0)
            return 0;
        uint32_t phase = nowMs % periodMs;
        return (int)((uint64_t)phase * (uint32_t)steps / (uint32_t)periodMs);
    }
}

void Neopixel::setup()
{
    logger.info("Setup");
    leds.Begin();
    fillSolid(frame, LED_COUNT, 0x000000);
    flushFrame(leds, frame, LED_COUNT);

    /*
    xTaskCreate(
        Neopixel::taskFn,
        "leds",
        4096,
        this,
        TASK_PRIORITY_LED,
        NULL);
    */
}
void Neopixel::taskFn(void *parameter)
{
    const int REFRESH_RATE_HZ = 60;
    const int MS_PER_SECOND = 1000;
    const int LOOP_DELAY_MS = (MS_PER_SECOND / REFRESH_RATE_HZ) / portTICK_PERIOD_MS;

    Neopixel *instance = (Neopixel *)parameter;

    while (true)
    {
        instance->loop();
        vTaskDelay(LOOP_DELAY_MS);
    }
}

void Neopixel::loop()
{
    this->updateAppStateData();
    this->updateApiEventData();

    this->runAnimation();
}

void Neopixel::updateAppStateData()
{
    uint32_t lastStateChangeTime = State::getLastStateChangeTime();
    if (lastStateChangeTime <= this->lastKnownStateChangeTime)
    {
        return;
    }

    this->lastKnownStateChangeTime = lastStateChangeTime;

    this->networkState = State::getNetworkState();
    this->websocketState = State::getWebsocketState();
    this->apiState = State::getApiState();
}

void Neopixel::updateApiEventData()
{
    uint32_t lastApiEventTime = State::getLastApiEventTime();
    if (lastApiEventTime <= this->lastApiEventTime)
    {
        return;
    }

    this->lastApiEventTime = lastApiEventTime;
    this->apiEventData = State::getApiEventData();
}

void Neopixel::runAnimation()
{
    bool isNetworkConnected = this->networkState.wifi_connected || this->networkState.ethernet_connected;

    if (!isNetworkConnected)
    {
        return this->runWaitingForNetworkAnimation();
    }

    if (!this->websocketState.connected)
    {
        return this->runWaitingForWebsocketConnectionAnimation();
    }

    if (!this->apiState.authenticated)
    {
        return this->runWaitingForApiAuthenticationAnimation();
    }

    switch (this->apiEventData.state)
    {
    case State::API_EVENT_STATE_DISPLAY_ERROR:
        this->runDisplayErrorAnimation();
        break;
    case State::API_EVENT_STATE_DISPLAY_SUCCESS:
        this->runDisplaySuccessAnimation();
        break;
    case State::API_EVENT_STATE_DISPLAY_TEXT:
        this->runDisplayTextAnimation();
        break;
    case State::API_EVENT_STATE_CONFIRM_ACTION:
        this->runConfirmActionAnimation();
        break;
    case State::API_EVENT_STATE_RESOURCE_SELECTION:
        this->runResourceSelectionAnimation();
        break;
    case State::API_EVENT_STATE_WAIT_FOR_PROCESSING:
        this->runWaitForProcessingAnimation();
        break;
    case State::API_EVENT_STATE_WAIT_FOR_NFC_TAP:
        this->runWaitForNfcTapAnimation();
        break;
    case State::API_EVENT_STATE_FIRMWARE_UPDATE:
        this->runFirmwareUpdateAnimation();
        break;
    }
}

/**
 * We are waiting for the network to be connected
 * Animation:
 * - Color: Deep network blue (#007BFF)
 * - Pattern: Single "comet" rotates clockwise with a soft fading tail
 *   - Head brightness ~60%, tail on the 2 following LEDs at ~30% and ~10%
 *   - One full revolution every ~2.0s (calm pace)
 * - Background: Optional very soft global white breathe at ~5% to indicate power
 * - User guidance: No action required; device is trying to connect to Wi‑Fi/Ethernet
 */
void Neopixel::runWaitingForNetworkAnimation()
{
    const uint16_t revolutionMs = 2000; // ~2.0s per revolution
    const uint8_t headBrightness = 160; // ~60%
    const uint8_t tail1 = 96;           // ~38%
    const uint8_t tail2 = 40;           // ~16%

    uint32_t now = millis();
    int head = stepFromPeriod(now, revolutionMs, LED_COUNT);

    fillSolid(frame, LED_COUNT, 0x000000);

    // Optional subtle background breathe (~5% base white)
    uint8_t bg = breathe8(12, 3, 10); // slow, very dim
    for (int i = 0; i < LED_COUNT; ++i)
    {
        addLedWrapped(frame, LED_COUNT, i, scaledColor(COLOR_WHITE, bg));
    }

    // Comet with 2-LED tail
    setLedWrapped(frame, LED_COUNT, head, scaledColor(COLOR_BLUE_NET, headBrightness));
    addLedWrapped(frame, LED_COUNT, head - 1, scaledColor(COLOR_BLUE_NET, tail1));
    addLedWrapped(frame, LED_COUNT, head - 2, scaledColor(COLOR_BLUE_NET, tail2));

    flushFrame(leds, frame, LED_COUNT);
}

/**
 * We are waiting for the websocket connection to be established
 * Animation:
 * - Color: Teal/Cyan (#00E5FF)
 * - Pattern: Two comets rotate clockwise 180° apart with short tails
 *   - Head brightness ~55%, short tail on 1 following LED at ~25%
 *   - One full revolution every ~1.5s (slightly more active than network)
 * - Sync cue: Brief 80ms micro‑flash of all LEDs at ~10% every ~3s to imply handshaking
 * - User guidance: No action required; establishing realtime connection
 */
void Neopixel::runWaitingForWebsocketConnectionAnimation()
{
    const uint16_t revolutionMs = 1500; // ~1.5s per revolution
    const uint8_t headBrightness = 140; // ~55%
    const uint8_t tail = 64;            // ~25%

    uint32_t now = millis();
    int head = stepFromPeriod(now, revolutionMs, LED_COUNT);
    int head2 = head + LED_COUNT / 2; // 180° apart

    fillSolid(frame, LED_COUNT, 0x000000);

    // Two comets
    setLedWrapped(frame, LED_COUNT, head, scaledColor(COLOR_CYAN_WS, headBrightness));
    addLedWrapped(frame, LED_COUNT, head - 1, scaledColor(COLOR_CYAN_WS, tail));
    setLedWrapped(frame, LED_COUNT, head2, scaledColor(COLOR_CYAN_WS, headBrightness));
    addLedWrapped(frame, LED_COUNT, head2 - 1, scaledColor(COLOR_CYAN_WS, tail));

    // Handshake micro‑flash every ~3s
    if ((now % 3000) < 80)
    {
        for (int i = 0; i < LED_COUNT; ++i)
        {
            addLedWrapped(frame, LED_COUNT, i, scaledColor(COLOR_WHITE, 28)); // ~11%
        }
    }

    flushFrame(leds, frame, LED_COUNT);
}

/**
 * We are waiting for the API authentication to be established
 * Animation:
 * - Color: Amber/Yellow (#FFC107)
 * - Pattern: Gentle global breathe between ~5% and ~40% brightness at ~0.6 Hz
 * - Activity tick: After every 2 breaths, a quick 250ms clockwise pulse runs around the ring
 * - User guidance: No action required; logging in/authenticating
 */
void Neopixel::runWaitingForApiAuthenticationAnimation()
{
    // Smooth, calm: base amber breathe + continuous subtle running highlight (no blinks)
    // Breathe at ~0.6 Hz → 36 BPM
    uint8_t base = breathe8(36, 13, 64); // ~5% to ~25%

    uint32_t now = millis();
    fillSolid(frame, LED_COUNT, scaledColor(COLOR_AMBER, base));

    // Continuous running dot with short tail, slow pace (~2.4s per revolution)
    int head = stepFromPeriod(now, 2400, LED_COUNT);
    addLedWrapped(frame, LED_COUNT, head, scaledColor(COLOR_AMBER, 160));    // head ~60%
    addLedWrapped(frame, LED_COUNT, head - 1, scaledColor(COLOR_AMBER, 64)); // tail ~25%

    flushFrame(leds, frame, LED_COUNT);
}

/**
 * We are displaying an error message
 * Animation:
 * - Color: Alert Red (#FF1744)
 * - Pattern: Attention sequence followed by idle alert
 *   1) Attention: 3 double‑flashes (200ms on, 200ms off, repeat twice per flash),
 *      with even and odd LEDs alternating per flash to create a zig‑zag effect
 *   2) Idle alert: Slow heartbeat at ~1 Hz (on ~150ms at ~30%, off ~850ms)
 * - User guidance: Something went wrong; check the screen for details
 */
void Neopixel::runDisplayErrorAnimation()
{
    uint32_t now = millis();
    fillSolid(frame, LED_COUNT, 0x000000);

    // Intro: 3 double‑flashes with even/odd alternation (~2.4s total)
    uint32_t sinceEvent = now - this->lastApiEventTime;
    if (sinceEvent < 2400)
    {
        // Each double flash window: 800ms (on 200, off 200, on 200, off 200)
        uint32_t inDouble = sinceEvent % 800;
        bool onPhase = (inDouble < 200) || (inDouble >= 400 && inDouble < 600);
        bool even = ((sinceEvent / 800) % 2) == 0; // alternate even/odd per double flash
        uint8_t level = onPhase ? 180 : 0;         // ~70%
        for (int i = 0; i < LED_COUNT; ++i)
        {
            bool isEven = (i % 2) == 0;
            if ((even && isEven) || (!even && !isEven))
            {
                setLedWrapped(frame, LED_COUNT, i, scaledColor(COLOR_RED_ERR, level));
            }
        }
        flushFrame(leds, frame, LED_COUNT);
        return;
    }

    // Idle heartbeat at ~1 Hz
    uint8_t beat = ((now % 1000) < 150) ? 96 : 0; // 150ms pulse, pure red
    for (int i = 0; i < LED_COUNT; ++i)
    {
        addLedWrapped(frame, LED_COUNT, i, scaledColor(COLOR_RED_ERR, beat));
    }

    flushFrame(leds, frame, LED_COUNT);
}

/**
 * We are displaying a success message
 * Animation:
 * - Color: Success Green (#00E676)
 * - Pattern:
 *   1) Celebration wipe: Clockwise progressive fill of the ring over ~600ms
 *   2) Hold: Solid green at ~20% for ~2s
 *   3) Idle: Gentle breathe between ~10% and ~25% at ~0.4 Hz
 * - User guidance: Action completed successfully
 */
void Neopixel::runDisplaySuccessAnimation()
{
    uint32_t now = millis();
    uint32_t sinceEvent = now - this->lastApiEventTime;

    fillSolid(frame, LED_COUNT, 0x000000);

    if (sinceEvent < 800)
    {
        // Celebration: fast radial sparkle + progressive fill over ~800ms
        int lit = (int)((sinceEvent * LED_COUNT) / 800);
        for (int i = 0; i <= lit && i < LED_COUNT; ++i)
        {
            setLedWrapped(frame, LED_COUNT, i, scaledColor(COLOR_GREEN_OK, 200));
        }
        // subtle white sparkles on remaining LEDs (excitement)
        for (int i = lit + 1; i < LED_COUNT; ++i)
        {
            if (((now + i * 73) % 120) < 20)
            {
                addLedWrapped(frame, LED_COUNT, i, scaledColor(COLOR_WHITE, 64));
            }
        }
    }
    else if (sinceEvent < 2800)
    {
        // Hold vivid green ~2s with gentle shimmer to read as celebratory
        for (int i = 0; i < LED_COUNT; ++i)
        {
            uint8_t jitter = ((now + i * 41) % 250) < 12 ? 30 : 0; // brief local lift
            frame[i] = scaledColor(COLOR_GREEN_OK, 120 + jitter);  // base ~47%
        }
    }
    else
    {
        // Idle upbeat breathe 0.5 Hz → 30 BPM, a bit brighter
        uint8_t level = breathe8(30, 38, 96); // ~15% to ~38%
        fillSolid(frame, LED_COUNT, scaledColor(COLOR_GREEN_OK, level));
    }

    flushFrame(leds, frame, LED_COUNT);
}

/**
 * We are displaying a text message
 * Animation:
 * - Color: Soft neutral white (#FFFFFF)
 * - Pattern: Static ring at low brightness (~8–12%) with very subtle drift (±3%) at ~0.2 Hz
 * - Intent: Non‑distracting ambient light while the user reads text on the display
 * - User guidance: Read the message; no immediate action required
 */
void Neopixel::runDisplayTextAnimation()
{
    // Soft neutral white, subtle drift at ~0.2 Hz (12 BPM)
    uint8_t level = breathe8(12, 20, 31); // ~8–12%
    fillSolid(frame, LED_COUNT, scaledColor(COLOR_WHITE, level));
    flushFrame(leds, frame, LED_COUNT);
}

/**
 * We are confirming an action
 * Animation:
 * - Colors: Confirm Green (#00E676) and Cancel Blue (#2979FF)
 * - Pattern: The ring is split into two halves (4+4 LEDs)
 *   - One half breathes green while the opposite half breathes blue, 180° out of phase (~0.8 Hz)
 *   - Every 1.5s, a quick bidirectional sweep (green clockwise, blue counter‑clockwise) signals input needed
 * - User guidance: Choose/confirm on the screen; LEDs indicate that a decision is required
 */
void Neopixel::runConfirmActionAnimation()
{
    uint32_t now = millis();
    // Two halves out of phase breathe (~0.8 Hz → 48 BPM)
    uint8_t levelA = breathe8(48, 26, 102); // green half
    uint8_t levelB = 128 - (levelA / 2);    // simple phase contrast
    fillSolid(frame, LED_COUNT, 0x000000);

    for (int i = 0; i < LED_COUNT; ++i)
    {
        bool firstHalf = (i < (LED_COUNT / 2));
        if (firstHalf)
        {
            setLedWrapped(frame, LED_COUNT, i, scaledColor(COLOR_GREEN_OK, levelA));
        }
        else
        {
            setLedWrapped(frame, LED_COUNT, i, scaledColor(COLOR_BLUE_ACT, levelB));
        }
    }

    // Bidirectional sweep every ~1.5s for ~150ms
    uint32_t phase = now % 1500;
    if (phase < 150)
    {
        int pos = stepFromPeriod(phase, 150, LED_COUNT);
        // Green clockwise
        addLedWrapped(frame, LED_COUNT, pos, scaledColor(COLOR_GREEN_OK, 170));
        // Blue counter‑clockwise
        addLedWrapped(frame, LED_COUNT, (LED_COUNT - pos), scaledColor(COLOR_BLUE_ACT, 170));
    }

    flushFrame(leds, frame, LED_COUNT);
}

/**
 * We are selecting a resource
 * Animation:
 * - Color: White cursor with a purple tail (Cursor: #FFFFFF at ~60%, Tail: #9C27B0 at ~20%)
 * - Pattern: Single "selector" LED steps clockwise around the ring every ~250ms
 *   - One trailing LED provides a subtle motion tail
 * - User guidance: Navigate/select on the screen; the ring hints at a scrollable/list selection context
 */
void Neopixel::runResourceSelectionAnimation()
{
    const uint16_t stepMs = 250;
    uint32_t now = millis();
    int head = stepFromPeriod(now, stepMs * LED_COUNT, LED_COUNT);

    fillSolid(frame, LED_COUNT, 0x000000);

    // Cursor and 1-LED tail (both white to read as a single moving unit)
    setLedWrapped(frame, LED_COUNT, head, scaledColor(COLOR_WHITE, 180));    // brighter head
    addLedWrapped(frame, LED_COUNT, head - 1, scaledColor(COLOR_WHITE, 60)); // softer tail

    flushFrame(leds, frame, LED_COUNT);
}

/**
 * We are waiting for processing
 * Animation:
 * - Color: Processing Orange (#FF9100)
 * - Pattern: Spinner with 2 bright adjacent LEDs (~50%) and a 2‑LED fading tail (25%/10%)
 *   - Rotates clockwise at ~0.75 rev/s; subtle global breathe (±5%) overlays to indicate ongoing work
 * - User guidance: Please wait; operation in progress
 */
void Neopixel::runWaitForProcessingAnimation()
{
    const uint16_t revolutionMs = 1333; // ~0.75 rev/s
    uint32_t now = millis();
    int head = stepFromPeriod(now, revolutionMs, LED_COUNT);

    fillSolid(frame, LED_COUNT, 0x000000);

    // 2 bright adjacent + 2 fading tail
    setLedWrapped(frame, LED_COUNT, head, scaledColor(COLOR_ORANGE, 128));
    setLedWrapped(frame, LED_COUNT, head - 1, scaledColor(COLOR_ORANGE, 128));
    addLedWrapped(frame, LED_COUNT, head - 2, scaledColor(COLOR_ORANGE, 64));
    addLedWrapped(frame, LED_COUNT, head - 3, scaledColor(COLOR_ORANGE, 32));

    // Subtle global overlay breathe (±5%)
    uint8_t overlay = breathe8(30, 5, 13);
    for (int i = 0; i < LED_COUNT; ++i)
    {
        addLedWrapped(frame, LED_COUNT, i, scaledColor(COLOR_ORANGE, overlay));
    }

    flushFrame(leds, frame, LED_COUNT);
}

/**
 * We are waiting for an NFC tap
 * Animation:
 * - Colors: Magenta/Purple (#D500F9) with crisp white accents (#FFFFFF)
 * - Pattern: Symmetric "attract" pulses
 *   - Pairs of opposite LEDs light up in magenta and move inward toward their neighbors, fading as they converge
 *   - Cycle repeats at ~1.5 Hz; every second pulse ends with a brief 80ms white sparkle to invite a tap
 * - User guidance: Hold a compatible NFC card/tag near the reader to proceed
 */
void Neopixel::runWaitForNfcTapAnimation()
{
    // Attract pulses ~1.5 Hz → 90 BPM; animate opposing pairs moving inward
    uint32_t now = millis();
    uint32_t cycleMs = 1500;
    uint32_t phase = now % cycleMs;
    // 4 steps across the ring, each ~375ms
    int step = (phase * 4) / cycleMs; // 0..3

    fillSolid(frame, LED_COUNT, 0x000000);

    // Base magenta pairs, moving inward
    // Define pair starts: (0,4)->(1,5)->(2,6)->(3,7)
    int a = step;
    int b = step + 4;
    setLedWrapped(frame, LED_COUNT, a, scaledColor(COLOR_MAGENTA, 128));
    setLedWrapped(frame, LED_COUNT, b, scaledColor(COLOR_MAGENTA, 128));
    // Neighbor fade
    addLedWrapped(frame, LED_COUNT, a + 1, scaledColor(COLOR_MAGENTA, 64));
    addLedWrapped(frame, LED_COUNT, b - 1, scaledColor(COLOR_MAGENTA, 64));

    // White sparkle invite every second pulse end (~80ms at phase wrap)
    if (phase > cycleMs - 120)
    {
        for (int i = 0; i < LED_COUNT; ++i)
        {
            addLedWrapped(frame, LED_COUNT, i, scaledColor(COLOR_WHITE, 48));
        }
    }

    flushFrame(leds, frame, LED_COUNT);
}

/**
 * We are updating the firmware
 * Animation:
 * - Primary color: Update Blue (#2979FF)
 * - If progress percentage is available: Map 0–100% to 0–8 LEDs filled clockwise
 *   - Filled LEDs solid blue at ~35%; the next LED shows a breathing blue to indicate movement
 * - If progress is not available: Continuous clockwise progress spinner (3‑LED wedge) at ~0.8 rev/s
 * - Status cues: Brief white tick every ~2s to indicate activity; any error would transition to the error animation
 * - User guidance: Do not power off; updating firmware
 */
void Neopixel::runFirmwareUpdateAnimation()
{
    uint32_t now = millis();
    fillSolid(frame, LED_COUNT, 0x000000);

    // If progress present, map 0..100 to 0..8 LEDs
    bool hasProgress = false;
    int progress = 0;
    if (!this->apiEventData.payload.isNull())
    {
        if (this->apiEventData.payload["progress"].is<int>())
        {
            progress = (int)this->apiEventData.payload["progress"].as<int>();
            if (progress < 0)
                progress = 0;
            if (progress > 100)
                progress = 100;
            hasProgress = true;
        }
    }

    if (hasProgress)
    {
        int lit = (progress * LED_COUNT) / 100;
        for (int i = 0; i < LED_COUNT; ++i)
        {
            if (i < lit)
            {
                setLedWrapped(frame, LED_COUNT, i, scaledColor(COLOR_BLUE_ACT, 90)); // ~35%
            }
            else if (i == lit)
            {
                // breathing next LED to show activity
                uint8_t level = breathe8(32, 26, 90);
                setLedWrapped(frame, LED_COUNT, i, scaledColor(COLOR_BLUE_ACT, level));
            }
        }
    }
    else
    {
        // Spinner wedge (3 LEDs) at ~0.8 rev/s → 1250ms per rev
        int head = stepFromPeriod(now, 1250, LED_COUNT);
        setLedWrapped(frame, LED_COUNT, head, scaledColor(COLOR_BLUE_ACT, 120));
        addLedWrapped(frame, LED_COUNT, head - 1, scaledColor(COLOR_BLUE_ACT, 64));
        addLedWrapped(frame, LED_COUNT, head - 2, scaledColor(COLOR_BLUE_ACT, 32));
    }

    // Activity tick every ~2s (~80ms)
    if ((now % 2000) < 80)
    {
        for (int i = 0; i < LED_COUNT; ++i)
        {
            addLedWrapped(frame, LED_COUNT, i, scaledColor(COLOR_WHITE, 28));
        }
    }

    flushFrame(leds, frame, LED_COUNT);
}
