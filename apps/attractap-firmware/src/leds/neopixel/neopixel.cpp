
#include "neopixel.hpp"

namespace
{
    // Utility: wrap an index on the 8-LED ring
    inline int wrapIndex(int index, int count)
    {
        int m = index % count;
        return m < 0 ? m + count : m;
    }

    // Utility: set LED with wrap
    inline void setLedWrapped(CRGB *buffer, int count, int index, const CRGB &color)
    {
        buffer[wrapIndex(index, count)] = color;
    }

    // Utility: add LED with wrap (for tails/overlays) with saturation
    inline void addLedWrapped(CRGB *buffer, int count, int index, const CRGB &color)
    {
        int idx = wrapIndex(index, count);
        buffer[idx] += color; // saturating add per channel
    }

    inline void fillSolid(CRGB *buffer, int count, const CRGB &color)
    {
        fill_solid(buffer, count, color);
    }

    // Colors (sRGB)
    const CRGB COLOR_BLUE_NET = CRGB(0x00, 0x7B, 0xFF); // #007BFF
    const CRGB COLOR_CYAN_WS = CRGB(0x00, 0xE5, 0xFF);  // #00E5FF
    const CRGB COLOR_AMBER = CRGB(0xFF, 0xC1, 0x07);    // #FFC107
    const CRGB COLOR_RED_ERR = CRGB(0xFF, 0x00, 0x00);  // Pure red #FF0000
    const CRGB COLOR_GREEN_OK = CRGB(0x00, 0xFF, 0x00); // Pure green #00FF00
    const CRGB COLOR_WHITE = CRGB(0xFF, 0xFF, 0xFF);    // #FFFFFF
    const CRGB COLOR_BLUE_ACT = CRGB(0x29, 0x79, 0xFF); // #2979FF
    const CRGB COLOR_PURPLE = CRGB(0x9C, 0x27, 0xB0);   // #9C27B0
    const CRGB COLOR_ORANGE = CRGB(0xFF, 0x91, 0x00);   // #FF9100
    const CRGB COLOR_MAGENTA = CRGB(0xD5, 0x00, 0xF9);  // #D500F9

    // Timing helpers
    inline uint8_t breathe8(uint8_t bpm, uint8_t minV = 5, uint8_t maxV = 255)
    {
        // FastLED beatsin8 provides a sine-like wave between minV..maxV at bpm
        return beatsin8(bpm, minV, maxV);
    }

    inline int headFromPeriod(uint16_t periodMs, int steps)
    {
        if (periodMs == 0 || steps <= 0)
            return 0;
        uint8_t bpm = (uint8_t)(60000UL / periodMs);
        return scale8(beat8(bpm), (uint8_t)steps);
    }
}

void Neopixel::setup()
{

    xTaskCreatePinnedToCore(
        Neopixel::taskFn,
        "leds",
        4096,
        this,
        TASK_PRIORITY_LED,
        NULL,
        1);
}
void Neopixel::taskFn(void *parameter)
{
    Neopixel *instance = (Neopixel *)parameter;

    instance->logger.info("Setup");
    FastLED.addLeds<WS2812B, PIN_NEOPIXEL_LED, GRB>(instance->ledStrip, LED_COUNT);
    FastLED.setBrightness(255);
    fillSolid(instance->ledStrip, LED_COUNT, CRGB::Black);
    FastLED.show();

    // const int REFRESH_RATE_HZ = 60;
    // const int MS_PER_SECOND = 1000;
    // const int LOOP_DELAY_MS = (MS_PER_SECOND / REFRESH_RATE_HZ);
    const int LOOP_DELAY_MS = 200;

    while (true)
    {
        instance->loop();
        vTaskDelay(LOOP_DELAY_MS / portTICK_PERIOD_MS);
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
        this->nfcAnimationActivated = false;
        this->runDisplayErrorAnimation();
        break;
    case State::API_EVENT_STATE_DISPLAY_SUCCESS:
        this->nfcAnimationActivated = false;
        this->runDisplaySuccessAnimation();
        break;
    case State::API_EVENT_STATE_DISPLAY_TEXT:
        this->nfcAnimationActivated = false;
        this->runDisplayTextAnimation();
        break;
    case State::API_EVENT_STATE_CONFIRM_ACTION:
        this->nfcAnimationActivated = false;
        this->runConfirmActionAnimation();
        break;
    case State::API_EVENT_STATE_RESOURCE_SELECTION:
        this->nfcAnimationActivated = false;
        this->runResourceSelectionAnimation();
        break;
    case State::API_EVENT_STATE_WAIT_FOR_PROCESSING:
        // this->runWaitForProcessingAnimation();
        this->nfcAnimationWorkaround();
        break;
    case State::API_EVENT_STATE_WAIT_FOR_NFC_TAP:
        // this->runWaitForNfcTapAnimation();
        this->nfcAnimationWorkaround();
        break;
    case State::API_EVENT_STATE_FIRMWARE_UPDATE:
        this->nfcAnimationActivated = false;
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

    int head = headFromPeriod(revolutionMs, LED_COUNT);

    fillSolid(ledStrip, LED_COUNT, CRGB::Black);

    // Optional subtle background breathe (~5% base white)
    uint8_t bg = breathe8(12, 3, 10); // slow, very dim
    for (int i = 0; i < LED_COUNT; ++i)
    {
        CRGB c = COLOR_WHITE;
        c.nscale8_video(bg);
        addLedWrapped(ledStrip, LED_COUNT, i, c);
    }

    // Comet with 2-LED tail
    {
        CRGB c = COLOR_BLUE_NET;
        c.nscale8_video(headBrightness);
        setLedWrapped(ledStrip, LED_COUNT, head, c);
    }
    {
        CRGB c = COLOR_BLUE_NET;
        c.nscale8_video(tail1);
        addLedWrapped(ledStrip, LED_COUNT, head - 1, c);
    }
    {
        CRGB c = COLOR_BLUE_NET;
        c.nscale8_video(tail2);
        addLedWrapped(ledStrip, LED_COUNT, head - 2, c);
    }

    FastLED.show();
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

    int head = headFromPeriod(revolutionMs, LED_COUNT);
    int head2 = head + LED_COUNT / 2; // 180° apart

    fillSolid(ledStrip, LED_COUNT, CRGB::Black);

    // Two comets
    {
        CRGB c = COLOR_CYAN_WS;
        c.nscale8_video(headBrightness);
        setLedWrapped(ledStrip, LED_COUNT, head, c);
    }
    {
        CRGB c = COLOR_CYAN_WS;
        c.nscale8_video(tail);
        addLedWrapped(ledStrip, LED_COUNT, head - 1, c);
    }
    {
        CRGB c = COLOR_CYAN_WS;
        c.nscale8_video(headBrightness);
        setLedWrapped(ledStrip, LED_COUNT, head2, c);
    }
    {
        CRGB c = COLOR_CYAN_WS;
        c.nscale8_video(tail);
        addLedWrapped(ledStrip, LED_COUNT, head2 - 1, c);
    }

    // Handshake micro‑flash every ~3s (one frame)
    {
        static bool flash = false;
        EVERY_N_MILLISECONDS_I(wsFlash, 3000) { flash = true; }
        if (flash)
        {
            flash = false;
            for (int i = 0; i < LED_COUNT; ++i)
            {
                CRGB c = COLOR_WHITE;
                c.nscale8_video(28);
                addLedWrapped(ledStrip, LED_COUNT, i, c);
            }
        }
    }

    FastLED.show();
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

    {
        CRGB c = COLOR_AMBER;
        c.nscale8_video(base);
        fillSolid(ledStrip, LED_COUNT, c);
    }

    // Continuous running dot with short tail, slow pace (~2.4s per revolution)
    int head = headFromPeriod(2400, LED_COUNT);
    {
        CRGB c = COLOR_AMBER;
        c.nscale8_video(160);
        addLedWrapped(ledStrip, LED_COUNT, head, c);
    }
    {
        CRGB c = COLOR_AMBER;
        c.nscale8_video(64);
        addLedWrapped(ledStrip, LED_COUNT, head - 1, c);
    }

    FastLED.show();
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
    fillSolid(ledStrip, LED_COUNT, CRGB::Black);

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
                CRGB c = COLOR_RED_ERR;
                c.nscale8_video(level);
                setLedWrapped(ledStrip, LED_COUNT, i, c);
            }
        }
        FastLED.show();
        return;
    }

    // Idle heartbeat at ~1 Hz
    // Heartbeat pulse ~1 Hz using FastLED timing
    static uint8_t beatLevel = 0;
    EVERY_N_MILLISECONDS_I(errBeat, 1000)
    {
        beatLevel = 96;
    }
    if (beatLevel > 0)
    {
        beatLevel = qsub8(beatLevel, 32); // decay quickly over ~150ms
        for (int i = 0; i < LED_COUNT; ++i)
        {
            CRGB c = COLOR_RED_ERR;
            c.nscale8_video(beatLevel);
            addLedWrapped(ledStrip, LED_COUNT, i, c);
        }
    }

    FastLED.show();
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
    const uint32_t sinceEvent = millis() - this->lastApiEventTime;
    if (sinceEvent < 500)
    {
        // solid green for first 500ms
        CRGB c = COLOR_GREEN_OK;
        fillSolid(ledStrip, LED_COUNT, c);
        FastLED.show();
        return;
    }

    // Idle upbeat breathe 0.5 Hz → 30 BPM, breathing from 50% to 100% brightness
    uint8_t level = breathe8(30, 128, 255); // 50% to 100% brightness
    CRGB c = COLOR_GREEN_OK;
    c.nscale8_video(level);
    fillSolid(ledStrip, LED_COUNT, c);

    FastLED.show();
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
    {
        CRGB c = COLOR_WHITE;
        c.nscale8_video(level);
        fillSolid(ledStrip, LED_COUNT, c);
    }
    FastLED.show();
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
    fillSolid(ledStrip, LED_COUNT, CRGB::Black);

    for (int i = 0; i < LED_COUNT; ++i)
    {
        bool firstHalf = (i < (LED_COUNT / 2));
        if (firstHalf)
        {
            {
                CRGB c = COLOR_GREEN_OK;
                c.nscale8_video(levelA);
                setLedWrapped(ledStrip, LED_COUNT, i, c);
            }
        }
        else
        {
            {
                CRGB c = COLOR_BLUE_ACT;
                c.nscale8_video(levelB);
                setLedWrapped(ledStrip, LED_COUNT, i, c);
            }
        }
    }

    // Bidirectional sweep every ~1.5s for ~150ms
    // Bidirectional sweep every ~1.5s (single-frame cue)
    {
        static bool sweep = false;
        EVERY_N_MILLISECONDS_I(confirmSweep, 1500) { sweep = true; }
        if (sweep)
        {
            sweep = false;
            int pos = headFromPeriod(150, LED_COUNT);
            // Green clockwise
            {
                CRGB c = COLOR_GREEN_OK;
                c.nscale8_video(170);
                addLedWrapped(ledStrip, LED_COUNT, pos, c);
            }
            // Blue counter‑clockwise
            {
                CRGB c = COLOR_BLUE_ACT;
                c.nscale8_video(170);
                addLedWrapped(ledStrip, LED_COUNT, (LED_COUNT - pos), c);
            }
        }
    }

    FastLED.show();
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
    int head = headFromPeriod(stepMs * LED_COUNT, LED_COUNT);

    fillSolid(ledStrip, LED_COUNT, CRGB::Black);

    // Cursor and 1-LED tail (both white to read as a single moving unit)
    {
        CRGB c = COLOR_WHITE;
        c.nscale8_video(180);
        setLedWrapped(ledStrip, LED_COUNT, head, c);
    } // brighter head
    {
        CRGB c = COLOR_WHITE;
        c.nscale8_video(60);
        addLedWrapped(ledStrip, LED_COUNT, head - 1, c);
    } // softer tail

    FastLED.show();
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
    int head = headFromPeriod(revolutionMs, LED_COUNT);

    fillSolid(ledStrip, LED_COUNT, CRGB::Black);

    // 2 bright adjacent + 2 fading tail
    {
        CRGB c = COLOR_ORANGE;
        c.nscale8_video(128);
        setLedWrapped(ledStrip, LED_COUNT, head, c);
    }
    {
        CRGB c = COLOR_ORANGE;
        c.nscale8_video(128);
        setLedWrapped(ledStrip, LED_COUNT, head - 1, c);
    }
    {
        CRGB c = COLOR_ORANGE;
        c.nscale8_video(64);
        addLedWrapped(ledStrip, LED_COUNT, head - 2, c);
    }
    {
        CRGB c = COLOR_ORANGE;
        c.nscale8_video(32);
        addLedWrapped(ledStrip, LED_COUNT, head - 3, c);
    }

    // Subtle global overlay breathe (±5%)
    uint8_t overlay = breathe8(30, 5, 13);
    for (int i = 0; i < LED_COUNT; ++i)
    {
        CRGB c = COLOR_ORANGE;
        c.nscale8_video(overlay);
        addLedWrapped(ledStrip, LED_COUNT, i, c);
    }

    FastLED.show();
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
    // 4 steps across the ring, each ~375ms
    int step = headFromPeriod(1500, 4); // 0..3

    fillSolid(ledStrip, LED_COUNT, CRGB::Black);

    // Base magenta pairs, moving inward
    // Define pair starts: (0,4)->(1,5)->(2,6)->(3,7)
    int a = step;
    int b = step + 4;
    {
        CRGB c = COLOR_MAGENTA;
        c.nscale8_video(128);
        setLedWrapped(ledStrip, LED_COUNT, a, c);
    }
    {
        CRGB c = COLOR_MAGENTA;
        c.nscale8_video(128);
        setLedWrapped(ledStrip, LED_COUNT, b, c);
    }
    // Neighbor fade
    {
        CRGB c = COLOR_MAGENTA;
        c.nscale8_video(64);
        addLedWrapped(ledStrip, LED_COUNT, a + 1, c);
    }
    {
        CRGB c = COLOR_MAGENTA;
        c.nscale8_video(64);
        addLedWrapped(ledStrip, LED_COUNT, b - 1, c);
    }

    // White sparkle invite every second pulse end (~80ms at phase wrap)
    // White sparkle invite once per cycle (~1.5s)
    {
        static bool invite = false;
        EVERY_N_MILLISECONDS_I(inviteTick, 1500) { invite = true; }
        if (invite)
        {
            invite = false;
            for (int i = 0; i < LED_COUNT; ++i)
            {
                CRGB c = COLOR_WHITE;
                c.nscale8_video(48);
                addLedWrapped(ledStrip, LED_COUNT, i, c);
            }
        }
    }

    FastLED.show();
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
    fillSolid(ledStrip, LED_COUNT, CRGB::Black);

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
                CRGB c = COLOR_BLUE_ACT;
                c.nscale8_video(90); // ~35%
                setLedWrapped(ledStrip, LED_COUNT, i, c);
            }
            else if (i == lit)
            {
                // breathing next LED to show activity
                uint8_t level = breathe8(32, 26, 90);
                CRGB c = COLOR_BLUE_ACT;
                c.nscale8_video(level);
                setLedWrapped(ledStrip, LED_COUNT, i, c);
            }
        }
    }
    else
    {
        // Spinner wedge (3 LEDs) at ~0.8 rev/s → 1250ms per rev
        int head = headFromPeriod(1250, LED_COUNT);
        {
            CRGB c = COLOR_BLUE_ACT;
            c.nscale8_video(120);
            setLedWrapped(ledStrip, LED_COUNT, head, c);
        }
        {
            CRGB c = COLOR_BLUE_ACT;
            c.nscale8_video(64);
            addLedWrapped(ledStrip, LED_COUNT, head - 1, c);
        }
        {
            CRGB c = COLOR_BLUE_ACT;
            c.nscale8_video(32);
            addLedWrapped(ledStrip, LED_COUNT, head - 2, c);
        }
    }

    // Activity tick every ~2s (single-frame)
    {
        static bool tick = false;
        EVERY_N_MILLISECONDS_I(updateTick, 2000) { tick = true; }
        if (tick)
        {
            tick = false;
            for (int i = 0; i < LED_COUNT; ++i)
            {
                CRGB c = COLOR_WHITE;
                c.nscale8_video(28);
                addLedWrapped(ledStrip, LED_COUNT, i, c);
            }
        }
    }

    FastLED.show();
}

void Neopixel::nfcAnimationWorkaround()
{
    if (this->nfcAnimationActivated)
    {
        return;
    }

    this->nfcAnimationActivated = true;

    // make all leds solid white
    for (int i = 0; i < LED_COUNT; ++i)
    {
        CRGB c = COLOR_WHITE;
        c.nscale8_video(255);
        setLedWrapped(ledStrip, LED_COUNT, i, c);
    }

    FastLED.show();
}