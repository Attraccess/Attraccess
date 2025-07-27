#include <Arduino.h>
#include <SPI.h>
#include <XPT2046_Touchscreen.h>
#include <TFT_eSPI.h>
#include <lv_conf.h>
#include <lvgl.h>
#include <Wire.h>
#include <ArduinoJson.h>

#include "ScreenManager.h"
#include "MainScreenUI.h"
#include "WiFiService.h"
#include "SettingsManager.h"
#include "AttraccessService.h"
#include "nfc.hpp"
#include "CLIService.h"
#include "LEDService.h"

// for XPT2046 Touch ////////////////////////////////
SPIClass xptSPI = SPIClass(VSPI);                 // SPI-Interface for XPT2046_Touchscreen
XPT2046_Touchscreen xpt(XPT2046_CS, XPT2046_IRQ); // create an XPT object (Digitizer)

// for TFT Display //////////////////////////////////
TFT_eSPI tft = TFT_eSPI(); // create an TFT object (TFT-Display)

// for LVGL ////////////////////////////////////
// LVGL draw into this buffer, 1/20 screen size for memory optimization. The size is in bytes
#define DRAW_BUF_SIZE (TFT_HOR_RES * TFT_VER_RES / 20 * (LV_COLOR_DEPTH / 8))
uint32_t draw_buf[DRAW_BUF_SIZE / 4];

lv_indev_t *indev;        // Touchscreen input device for LVGL
uint32_t lv_lastTick = 0; // Used to track the tick timer

// New Architecture: Services and UI
ScreenManager screenManager;
MainScreenUI mainScreenUI(&screenManager);
WiFiService wifiService;
SettingsManager settingsManager;
AttraccessService attraccessService;
NFC nfc;
CLIService cliService;
LEDService ledService;

// Initialization state
bool setupComplete = false;

// read position of XPT digitizer and corresponding TFT position
void xptPosition(uint16_t *xptX, uint16_t *xptY, uint8_t *xptZ, uint16_t *tftX, uint16_t *tftY)
{
  uint16_t x, y;
  uint8_t z;       // XPT
  uint16_t tx, ty; // TFT

  float xx = (XPT2046_XMAX - XPT2046_XMIN); // width XPT-Points
  float yy = (XPT2046_YMAX - XPT2046_YMIN); // height XPT-Points

  xpt.readData(&x, &y, &z);

  // calc position for TFT display from digitizer position (Portrait mode - rotation 0)
  // Map touch coordinates to portrait orientation (240x320)
  tx = (x - XPT2046_XMIN) * TFT_HOR_RES / xx; // Map to width (240)
  ty = (y - XPT2046_YMIN) * TFT_VER_RES / yy; // Map to height (320)

  // avoid invalid values
  if (tx < 0)
    tx = 0;
  if (ty < 0)
    ty = 0;
  if (tx >= TFT_HOR_RES)
    tx = TFT_HOR_RES - 1;
  if (ty >= TFT_VER_RES)
    ty = TFT_VER_RES - 1;

  *xptX = x;
  *xptY = y;
  *xptZ = z;
  *tftX = tx;
  *tftY = ty;
}

// user function, that is called from LVGL
// Implement and register a function which can copy the rendered image to an area of your display:
void my_disp_flush(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map)
{ // Display flushing

  uint32_t w = lv_area_get_width(area);
  uint32_t h = lv_area_get_height(area);

  // Fix color inversion issue by inverting each pixel
  // uint16_t *pixels = (uint16_t *)px_map;
  // uint32_t pixel_count = w * h;
  /*
    for (uint32_t i = 0; i < pixel_count; i++)
    {
      pixels[i] = ~pixels[i]; // Invert each 16-bit pixel
    }*/

  tft.startWrite();
  tft.setAddrWindow(area->x1, area->y1, w, h);     // Set window area to pour pixels into
  tft.pushColors((uint16_t *)px_map, w * h, true); // Push Color Informations into area
  tft.endWrite();

  lv_disp_flush_ready(disp); // Indicate you are ready with the flushing
}

// user function, that is called from LVGL
// Implement and register a function which can read an input device. E.g. for a touchpad:
void my_touchpad_read(lv_indev_t *indev, lv_indev_data_t *data)
{ // Read the touchscreen
  uint16_t xptX, xptY, tftX, tftY;
  uint8_t xptZ;

  if (xpt.touched())
  {
    xptPosition(&xptX, &xptY, &xptZ, &tftX, &tftY);
    data->point.x = tftX;
    data->point.y = tftY;
    data->state = LV_INDEV_STATE_PRESSED;

    // Debug touch coordinates (comment out after testing)
    // Serial.printf("Touch: raw(%d,%d) -> mapped(%d,%d)\n", xptX, xptY, tftX, tftY);
  }
  else
  {
    data->state = LV_INDEV_STATE_RELEASED;
  }
}

#if LV_USE_LOG
// user function, that is called from LVGL
// Serial debugging
void lvgl_debug_print(lv_log_level_t level, const char *buf)
{
  LV_UNUSED(level);
  Serial.printf(buf);
  Serial.flush();
}
#endif

// Application callbacks
void onSettingsButtonPressed()
{
  Serial.println("Application: Settings button pressed");
  settingsManager.showPinEntryScreen();
}

void onWiFiConnectionChange(bool connected, const String &ssid)
{
  Serial.printf("Application: WiFi connection changed - Connected: %s\n", connected ? "true" : "false");

  if (connected)
  {
    Serial.println("Connected to WiFi: " + ssid);
    Serial.println("IP Address: " + wifiService.getLocalIP());

    // Update main screen WiFi status
    mainScreenUI.updateWiFiStatus(true, ssid, wifiService.getLocalIP());

    // Only return to main screen if setup is complete AND settings are not currently visible
    if (setupComplete && !settingsManager.isSettingsVisible())
    {
      Serial.println("WiFi connected - returning to main screen (settings not visible)");
      screenManager.showScreen(ScreenManager::SCREEN_MAIN);
    }
    else if (settingsManager.isSettingsVisible())
    {
      Serial.println("WiFi connected - staying in settings since user is actively using them");
    }
  }
  else
  {
    Serial.println("WiFi disconnected");
    mainScreenUI.updateWiFiStatus(false);
  }

  // Notify settings manager (this will update the WiFi settings UI if visible)
  settingsManager.handleWiFiConnectionChange(connected, ssid);
}

void onAttraccessConnectionChange(AttraccessService::ConnectionState state, const String &message)
{
  Serial.printf("Application: Attraccess connection state changed: %s (%s)\n",
                attraccessService.getConnectionStateString().c_str(), message.c_str());

  bool connected = attraccessService.isConnected();
  bool authenticated = attraccessService.isAuthenticated();

  // Update main screen status
  mainScreenUI.updateAttraccessStatus(connected, authenticated, attraccessService.getConnectionStateString(), attraccessService.getReaderName());

  // Show not available message if disconnected or connection failed
  if (state == AttraccessService::DISCONNECTED || state == AttraccessService::ERROR_FAILED)
  {
    MainScreenUI::MainContent content;
    content.type = MainScreenUI::CONTENT_ERROR;
    content.message = "Sorry, this reader is currently not available";
    content.textColor = 0xFFFF00; // Yellow
    content.subMessage = "please contact an attraccess administrator";
    content.subTextColor = 0xAAAAAA; // Light gray
    content.durationMs = 0;          // Persistent
    content.showCancelButton = false;
    mainScreenUI.setMainContent(content);
  }

  // Update settings screen status if visible
  settingsManager.handleAttraccessConnectionChange(connected, authenticated, attraccessService.getConnectionStateString());
}

void onMainContentEvent(const MainScreenUI::MainContent &content)
{
  Serial.printf("Application: Main content event: type=%d, message=%s, duration=%lu\n", (int)content.type, content.message.c_str(), (unsigned long)content.durationMs);
  mainScreenUI.setMainContent(content);
}

void setup()
{
  Serial.begin(115200);
  delay(100); // Give serial time to initialize
  Serial.println("\n=== PROGRAM STARTING ===");
  Serial.print("Using LVGL Version ");
  Serial.print(lv_version_major());
  Serial.print(".");
  Serial.print(lv_version_minor());
  Serial.print(".");
  Serial.println(lv_version_patch());

  // Initialize I2C for NFC
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, I2C_FREQ);

  // Initialize LED Service
  Serial.println("0. Initializing LED Service...");
  ledService.begin();

  // Start the SPI for the touch screen and init the XPT2046 library
  Serial.println("1. Initializing SPI and Touch...");
  xptSPI.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
  xpt.begin(xptSPI);
  xpt.setRotation(0); // portrait, USB ports at bottom

  // Init the eSPI-TFT Library
  Serial.println("2. Initializing TFT Display...");
  tft.init();
  tft.setRotation(0); // portrait, USB ports at bottom
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.fillScreen(TFT_BLACK); // clear screen
  tft.initDMA();             // init DMA for faster drawing in my_disp_flush

  // Init the LVGL Library
  Serial.println("3. Initializing LVGL...");
  lv_init();

  lv_display_t *disp;

#if LV_USE_TFT_ESPI
  // TFT_eSPI can be enabled lv_conf.h to initialize the display in a simple way
  disp = lv_tft_espi_create(TFT_HOR_RES, TFT_VER_RES, draw_buf, sizeof(draw_buf));
  lv_display_set_rotation(disp, TFT_ROTATION);
#else
  // Else create a display yourself <-- We use our own TFT_eSPI and display routines
  disp = lv_display_create(TFT_HOR_RES, TFT_VER_RES);
  lv_display_set_flush_cb(disp, my_disp_flush);
  lv_display_set_buffers(disp, draw_buf, NULL, sizeof(draw_buf), LV_DISPLAY_RENDER_MODE_PARTIAL);
#endif

  // Initialize the XPT2046 input device driver
  Serial.println("4. Initializing Touch Input...");
  indev = lv_indev_create();
  lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(indev, my_touchpad_read);

#if LV_USE_LOG != 0
  lv_log_register_print_cb(lvgl_debug_print); // register print function for debugging
#endif

  // Initialize the new architecture
  Serial.println("5. Initializing Screen Manager...");
  screenManager.init();

  // Initialize Main Screen UI
  Serial.println("6. Initializing Main Screen UI...");
  mainScreenUI.init();
  mainScreenUI.setSettingsButtonCallback(onSettingsButtonPressed);

  // Initialize WiFi Service
  Serial.println("7. Initializing WiFi Service...");
  wifiService.setConnectionCallback(onWiFiConnectionChange);
  wifiService.begin();

  // Try to auto-connect to saved WiFi network
  Serial.println("7a. Attempting auto-connect to saved WiFi...");
  if (wifiService.hasSavedCredentials())
  {
    Serial.println("Found saved WiFi credentials, attempting auto-connect...");
    wifiService.tryAutoConnect();

    // Give some time for connection attempt
    uint32_t connectStartTime = millis();
    while (!wifiService.isConnected() && wifiService.isConnecting() &&
           (millis() - connectStartTime) < 10000) // 10 second timeout
    {
      wifiService.update(); // Process connection updates
      delay(100);
    }

    if (wifiService.isConnected())
    {
      Serial.println("Auto-connect successful!");
    }
    else
    {
      Serial.println("Auto-connect failed or timed out");
    }
  }
  else
  {
    Serial.println("No saved WiFi credentials found");
  }

  // Initialize Settings Manager
  Serial.println("8. Initializing Settings Manager...");
  settingsManager.begin();
  settingsManager.setWiFiManager(&wifiService); // Pass WiFi service after begin()

  // Initialize Attraccess Service
  Serial.println("8a. Initializing Attraccess Service...");
  attraccessService.setConnectionStateCallback(onAttraccessConnectionChange);
  attraccessService.setMainContentCallback(onMainContentEvent);
  attraccessService.begin();

  // --- Wire up SELECT_ITEM event ---
  attraccessService.setSelectItemCallback([](const String &label, const JsonArray &options)
                                          { mainScreenUI.showSelectItemDialog(label, options, [](const String &selectedId)
                                                                              {
                                                                                Serial.printf("SELECT_ITEM callback: selectedId: %s\n", selectedId.c_str());
                                                                                // Clean up the select dialog UI
                                                                                mainScreenUI.cleanupSelectDialog();
                                                                                // Send SELECT_ITEM response with selectedId
                                                                                StaticJsonDocument<64> doc;
                                                                                doc["selectedId"] = selectedId.c_str();
                                                                                extern AttraccessService attraccessService;
                                                                                attraccessService.sendMessage("SELECT_ITEM", doc.as<JsonObject>()); // Note: event type is SELECT_ITEM (response)
                                                                              }); });

  // Initialize NFC
  Serial.println("8b. Initializing NFC...");
  nfc.setup();
  nfc.setNFCTappedCallback([](const uint8_t *uid, uint8_t uidLength)
                           { attraccessService.onNFCTapped(uid, uidLength); });

  // Pass Attraccess service to settings manager
  settingsManager.setAttraccessService(&attraccessService);

  // Show main screen
  Serial.println("9. Showing Main Screen...");
  screenManager.showScreen(ScreenManager::SCREEN_MAIN);

  // Update initial WiFi status
  mainScreenUI.updateWiFiStatus(wifiService.isConnected(),
                                wifiService.getConnectedSSID(),
                                wifiService.getLocalIP());

  // Inject NFC into AttraccessService for direct event-based control
  attraccessService.setNFC(&nfc);

  // Update initial Attraccess status
  mainScreenUI.updateAttraccessStatus(attraccessService.isConnected(),
                                      attraccessService.isAuthenticated(),
                                      attraccessService.getConnectionStateString(),
                                      attraccessService.getReaderName());

  // Initialize OTA
  Serial.println("9a. Initializing OTA...");

  // Initialize CLI Service
  Serial.println("9b. Initializing CLI Service...");
  cliService.setWiFiService(&wifiService);
  cliService.setAttraccessService(&attraccessService);
  cliService.begin();

  // Mark setup as complete
  setupComplete = true;
  Serial.println("=== SETUP COMPLETE ===");
  screenManager.dumpScreenInfo();
}

void loop()
{
  // CRITICAL: LVGL must be processed first to ensure UI responsiveness
  lv_tick_inc(millis() - lv_lastTick); // Update the tick timer. Tick is new for LVGL 9
  lv_lastTick = millis();
  lv_timer_handler(); // Update the GUI - HIGHEST PRIORITY

  // Process other services with lower priority
  wifiService.update();     // Update WiFi service
  settingsManager.update(); // Update Settings manager

  // NFC processing with additional safety measures
  static uint32_t lastNFCUpdate = 0;
  static uint32_t nfcStatusCheckInterval = 10000; // Check NFC status every 10 seconds

  // Limit NFC updates to prevent excessive I2C traffic
  if (millis() - lastNFCUpdate >= 50) // Minimum 50ms between NFC updates
  {
    lastNFCUpdate = millis();
    nfc.loop(); // Update NFC service (now with error handling)
  }

  // Monitor NFC status and log periodically
  static uint32_t lastNFCStatusLog = 0;
  if (millis() - lastNFCStatusLog >= nfcStatusCheckInterval)
  {
    lastNFCStatusLog = millis();
    if (nfc.isNFCDisabled() || nfc.getConsecutiveErrors() > 0)
    {
      Serial.printf("[MAIN] NFC Status: %s\n", nfc.getStatusString().c_str());
    }
  }

  attraccessService.update(); // Update Attraccess service
  cliService.update();        // Update CLI service

  // Handle navigation back to main screen from settings
  static bool wasSettingsVisible = false;
  static uint32_t lastScreenSwitch = 0;
  bool isSettingsVisible = settingsManager.isSettingsVisible();

  if (wasSettingsVisible && !isSettingsVisible)
  {
    // Prevent rapid screen switches (debounce)
    if (millis() - lastScreenSwitch > 250)
    {
      // Settings was closed, return to main screen
      Serial.println("Settings closed, returning to main screen");
      screenManager.showScreen(ScreenManager::SCREEN_MAIN);
      lastScreenSwitch = millis();
    }
  }

  wasSettingsVisible = isSettingsVisible;

  // Update WiFi status on main screen periodically
  static uint32_t lastMainStatusUpdate = 0;
  if (millis() - lastMainStatusUpdate > 5000) // Update every 5 seconds
  {
    lastMainStatusUpdate = millis();
    // Only update if we're on main screen
    if (screenManager.getCurrentScreen() == ScreenManager::SCREEN_MAIN &&
        !settingsManager.isSettingsVisible())
    {
      mainScreenUI.updateWiFiStatus(wifiService.isConnected(),
                                    wifiService.getConnectedSSID(),
                                    wifiService.getLocalIP());
    }
  }
}