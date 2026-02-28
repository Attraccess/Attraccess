#include "display.hpp"
#include <algorithm>

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#endif

#if defined(DISPLAY_DRIVER_GT911)
#include "driver/gt911/rgb_gt911_driver.hpp"
#endif
#if defined(DISPLAY_DRIVER_QUALIA)
#include "driver/qualia/qualia_ft_cst_driver.hpp"
#endif
#if defined(DISPLAY_DRIVER_P4_DSI)
#include "driver/p4_dsi/p4_dsi_gt911_driver.hpp"
#endif

// Static member definitions
Logger Display::logger("Display");
uint32_t Display::screenWidth = 0;
uint32_t Display::screenHeight = 0;
IDisplayDriver *Display::driver = nullptr;
lv_display_t *Display::disp = NULL;
lv_indev_t *Display::indev = NULL;
IScreen *Display::activeScreen = NULL;
std::vector<IScreen *> Display::pendingDestroyScreens;
uint32_t Display::transitionStartTime = 0;
bool Display::transitionComplete = true;
std::function<void()> Display::onTransitionComplete = nullptr;
String Display::deviceNameInitValue = "Attractap";

lv_obj_t *Display::deviceNameLabel = NULL;
BootScreen Display::bootScreen;
SetPinScreen Display::setPinScreen;
ConnectionConfigurationScreen Display::connectionConfigurationScreen;
InitScreen Display::initScreen;
Lockscreen Display::lockscreen;
NoResourcesScreen Display::noResourcesScreen;
ResourceListScreen Display::resourceListScreen;
ResourceDetailsScreen Display::resourceDetailsScreen;
EnrollmentScreen Display::enrollmentScreen;
FirmwareUpdateScreen Display::firmwareUpdateScreen;

std::function<void(int16_t, int16_t)> Display::touchCallback = nullptr;
lv_obj_t *Display::activePopup = nullptr;
lv_timer_t *Display::popupAutoCloseTimer = nullptr;

#if LV_USE_LOG != 0
/* Serial debugging */
void Display::logFromLvgl(lv_log_level_t level, const char *buf) {
  switch (level) {
  case LV_LOG_LEVEL_ERROR:
    Display::logger.error(buf);
    break;
  case LV_LOG_LEVEL_WARN:
    Display::logger.info(buf); // map warn to info
    break;
  case LV_LOG_LEVEL_INFO:
    Display::logger.info(buf);
    break;
  case LV_LOG_LEVEL_TRACE:
  default:
    Display::logger.debug(buf);
    break;
  }
}
static void lvgl_log_cb(lv_log_level_t level, const char *buf) {
  Display::logFromLvgl(level, buf);
}
#endif

uint8_t Display::reboot_count = 0;
void Display::increase_reboot(void *arg) {
  Display::reboot_count++;
  if (Display::reboot_count == 30) {
    esp_restart();
  }
}

/* Display flushing (LVGL v9 signature) */
void Display::flush(lv_display_t *disp, const lv_area_t *area,
                    uint8_t *px_map) {
  if (Display::driver) {
    Display::driver->flush(area, px_map);
  }
  lv_display_flush_ready(disp);
}

/* Read the touchpad (LVGL v9 signature) */
void Display::touchpad_read(lv_indev_t *indev_driver, lv_indev_data_t *data) {
  if (!Display::driver) {
    data->state = LV_INDEV_STATE_RELEASED;
    return;
  }

  TouchPoint point;
  if (!Display::driver->readTouch(point) || !point.pressed) {
    data->state = LV_INDEV_STATE_RELEASED;
    return;
  }

  data->state = LV_INDEV_STATE_PRESSED;
  data->point.x = point.x;
  data->point.y = point.y;

  if (Display::touchCallback) {
    Display::touchCallback(point.x, point.y);
  }
}

uint32_t Display::tick_cb() { return millis(); }

void Display::setup() {
  Display::logger.info("Initializing");

#if defined(DISPLAY_DRIVER_GT911)
  Display::driver = new RgbGt911Driver(Display::logger);
#elif defined(DISPLAY_DRIVER_QUALIA)
  Display::driver = new QualiaFtCstDriver(Display::logger);
#elif defined(DISPLAY_DRIVER_P4_DSI)
  Display::driver = new P4DsiGt911Driver(Display::logger);
#else
  Display::driver = nullptr;
#endif

  if (!Display::driver || !Display::driver->begin()) {
    Display::logger.error("Display driver init failed");
    while (1) {
      delay(1000);
    }
  }

  Display::screenWidth = Display::driver->width();
  Display::screenHeight = Display::driver->height();

  lv_init();

#if LV_USE_LOG != 0
  /* Route LVGL logs to our logger */
  lv_log_register_print_cb(lvgl_log_cb);
#endif

  /* Set LVGL tick source (v9) */
  lv_tick_set_cb(Display::tick_cb);

  /* Allocate draw buffers in bytes for LVGL v9 */
#if defined(ATTRACTAP_P4)
  /* P4 has more RAM (768KB SRAM + PSRAM): larger buffers + double buffering for
   * smoother animations. Larger buffer = fewer chunks per frame = less
   * chunky/stuttery fade/transition animations. 150 lines = ~25% of 1024x600 →
   * ~4 chunks per full frame instead of ~10. (~600KB total) */
  const uint32_t buf_pixels =
      (Display::screenWidth * Display::screenHeight) / 3;
#else
  const uint32_t buf_pixels =
      Display::screenWidth * 20; /* eighth of screen to save RAM */
#endif
  const uint32_t buf_size_bytes = buf_pixels * (LV_COLOR_DEPTH / 8);
  uint8_t *buf1 = (uint8_t *)heap_caps_malloc(buf_size_bytes, MALLOC_CAP_DMA);
#if defined(ATTRACTAP_P4)
  /* P4 has 768KB internal SRAM; 1/3 screen buffers (~800KB) exceed that.
   * Fall back to PSRAM if DMA allocation fails. */
  if (!buf1) {
    buf1 = (uint8_t *)heap_caps_malloc(buf_size_bytes, MALLOC_CAP_SPIRAM);
    if (buf1)
      Display::logger.info("LVGL buf1: using PSRAM (DMA failed)");
  }
  uint8_t *buf2 = (uint8_t *)heap_caps_malloc(buf_size_bytes, MALLOC_CAP_DMA);
  if (!buf2)
    buf2 = (uint8_t *)heap_caps_malloc(buf_size_bytes, MALLOC_CAP_SPIRAM);
  if (!buf2)
    Display::logger.info(
        "LVGL buf2: allocation failed, using single buffering");
#else
  uint8_t *buf2 = NULL; /* single buffering to further reduce RAM usage */
#endif

  if (!buf1) {
    Display::logger.error("LVGL disp_draw_buf allocation failed");
    while (1)
      delay(1000);
  }

  /* Create display and set buffers/callbacks (v9) */
  Display::disp = lv_display_create((int32_t)Display::screenWidth,
                                    (int32_t)Display::screenHeight);
  lv_display_set_flush_cb(Display::disp, Display::flush);
  lv_display_set_buffers(Display::disp, buf1, buf2, buf_size_bytes,
                         LV_DISPLAY_RENDER_MODE_PARTIAL);

  /* Initialize input device (v9) */
  Display::indev = lv_indev_create();
  lv_indev_set_type(Display::indev, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(Display::indev, Display::touchpad_read);

  const esp_timer_create_args_t reboot_timer_args = {
      .callback = &Display::increase_reboot, .name = "reboot"};

  lv_theme_t *base_theme = lv_theme_default_init(
      disp, lv_palette_main(LV_PALETTE_BLUE), /* Primary color */
      lv_palette_lighten(LV_PALETTE_BLUE, 2), /* Secondary color */
      false,                                  /* Dark mode */
      &lv_font_montserrat_18                  /* Normal font */
  );

  static lv_style_t global_bg_style;
  lv_style_init(&global_bg_style);

  /* Background gradient */
  lv_style_set_bg_color(&global_bg_style, lv_color_hex(0x1F2C47));
  lv_style_set_bg_grad_color(&global_bg_style, lv_color_hex(0x364C7C));
  lv_style_set_bg_grad_dir(&global_bg_style, LV_GRAD_DIR_VER);
  lv_style_set_bg_opa(&global_bg_style, LV_OPA_COVER);

  /* Default text color */
  lv_style_set_text_color(&global_bg_style, lv_color_white());

  lv_obj_t *scr = lv_disp_get_scr_act(disp);
  lv_obj_add_style(scr, &global_bg_style, 0);
  lv_display_set_theme(disp, base_theme);

  Display::initDeviceOverlay();

  Display::transitionToScreen(&Display::bootScreen);

  Display::logger.info("Setup done");
}

void Display::loop() {
  lv_timer_handler(); /* let the GUI do its work */
  if (Display::activeScreen) {
    Display::activeScreen->loop();
  }

  if (!Display::transitionComplete) {
    uint32_t currentTime = millis();
    if (Display::transitionStartTime + Display::TRANSITION_DURATION + 500 <
        currentTime) {
      Display::transitionComplete = true;
      if (Display::onTransitionComplete) {
        Display::onTransitionComplete();
        Display::onTransitionComplete = nullptr;
      }
      if (!Display::pendingDestroyScreens.empty()) {
        for (IScreen *scr : Display::pendingDestroyScreens) {
          if (scr && scr != Display::activeScreen) {
            Display::logger.debugf("Destroying screen: %s",
                                   scr->getName().c_str());
            scr->destroy();
          }
        }
        Display::pendingDestroyScreens.clear();
      }
    }
  }
}

void Display::transitionToScreen(IScreen *screen) {
  Display::transitionToScreen(screen, nullptr);
}

void Display::transitionToScreen(IScreen *screen,
                                 std::function<void()> onTransitionComplete) {
  if (!screen) {
    Display::logger.error("transitionToScreen called with null screen");
    return;
  }

  Display::logger.infof("Transitioning to screen: %s",
                        screen->getName().c_str());

  if (!screen->isLoaded()) {
    screen->init();
  }

  lv_obj_t *targetRoot = screen->getScreen();
  if (!targetRoot) {
    Display::logger.error(
        "Screen failed to provide lvgl root; aborting transition");
    return;
  }

  IScreen *previousScreen = Display::activeScreen;
  if (Display::activeScreen) {
    Display::activeScreen->onScreenLeave();
  }

  Display::activeScreen = screen;

  /* Remove target from pending destroy if it was queued (e.g. rapid A→B→A) */
  Display::pendingDestroyScreens.erase(
      std::remove(Display::pendingDestroyScreens.begin(),
                  Display::pendingDestroyScreens.end(), screen),
      Display::pendingDestroyScreens.end());

  lv_screen_load_anim(targetRoot, Display::TRANSITION_ANIMATION,
                      Display::TRANSITION_DURATION, 0, false);
  Display::transitionStartTime = millis();
  Display::transitionComplete = false;

  if (onTransitionComplete) {
    Display::onTransitionComplete = onTransitionComplete;
  } else {
    Display::onTransitionComplete = nullptr;
  }

  if (previousScreen && previousScreen != screen &&
      previousScreen->shouldAutoUnload()) {
    Display::logger.debugf("Queued screen %s for unload",
                           previousScreen->getName().c_str());
    Display::pendingDestroyScreens.push_back(previousScreen);
  }
}

void Display::setTouchCallback(std::function<void(int16_t, int16_t)> callback) {
  Display::touchCallback = callback;
}

void Display::initDeviceOverlay() {
  lv_obj_t *top = lv_layer_top();
  lv_obj_remove_flag(top, LV_OBJ_FLAG_SCROLLABLE);
  // Keep the top layer passive; don't assign a layout directly
  lv_obj_add_flag(top, LV_OBJ_FLAG_IGNORE_LAYOUT);

  lv_obj_t *deviceInfoContainer = lv_obj_create(top);
  lv_obj_remove_style_all(deviceInfoContainer);
  lv_obj_set_width(deviceInfoContainer, lv_pct(100));
  lv_obj_set_height(deviceInfoContainer, LV_SIZE_CONTENT);
  lv_obj_set_align(deviceInfoContainer, LV_ALIGN_BOTTOM_MID);
  lv_obj_set_x(deviceInfoContainer, 0);
  lv_obj_set_y(deviceInfoContainer, 0);
  lv_obj_set_flex_flow(deviceInfoContainer, LV_FLEX_FLOW_ROW);
  // Spread labels horizontally in a bottom bar
  lv_obj_set_flex_align(deviceInfoContainer, LV_FLEX_ALIGN_SPACE_BETWEEN,
                        LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
  lv_obj_remove_flag(deviceInfoContainer, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(deviceInfoContainer, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_pad_left(deviceInfoContainer, 20,
                            LV_PART_MAIN | LV_STATE_DEFAULT);
  lv_obj_set_style_pad_right(deviceInfoContainer, 20,
                             LV_PART_MAIN | LV_STATE_DEFAULT);
  lv_obj_set_style_pad_top(deviceInfoContainer, 0,
                           LV_PART_MAIN | LV_STATE_DEFAULT);
  lv_obj_set_style_pad_bottom(deviceInfoContainer, 10,
                              LV_PART_MAIN | LV_STATE_DEFAULT);

  Display::deviceNameLabel = lv_label_create(deviceInfoContainer);
  lv_obj_set_width(Display::deviceNameLabel, LV_SIZE_CONTENT);
  lv_obj_set_height(Display::deviceNameLabel, LV_SIZE_CONTENT);
  lv_obj_set_x(Display::deviceNameLabel, -75);
  lv_obj_set_y(Display::deviceNameLabel, -18);
  lv_obj_set_align(Display::deviceNameLabel, LV_ALIGN_CENTER);
  lv_label_set_text(Display::deviceNameLabel,
                    Display::deviceNameInitValue.c_str());

  lv_obj_set_style_text_color(Display::deviceNameLabel, lv_color_hex(0xFFFFFF),
                              LV_PART_MAIN | LV_STATE_DEFAULT);
  lv_obj_set_style_text_opa(Display::deviceNameLabel, 255,
                            LV_PART_MAIN | LV_STATE_DEFAULT);
  lv_obj_set_style_text_font(Display::deviceNameLabel, &lv_font_montserrat_10,
                             LV_PART_MAIN | LV_STATE_DEFAULT);

  lv_obj_t *firmwareLabel = lv_label_create(deviceInfoContainer);
  lv_obj_set_width(firmwareLabel, LV_SIZE_CONTENT);
  lv_obj_set_height(firmwareLabel, LV_SIZE_CONTENT);
  lv_obj_set_align(firmwareLabel, LV_ALIGN_CENTER);
  lv_label_set_text(firmwareLabel, (String(FIRMWARE_FRIENDLY_NAME) + " v" +
                                    String(FIRMWARE_VERSION))
                                       .c_str());
  lv_obj_set_style_text_color(firmwareLabel, lv_color_hex(0xFFFFFF),
                              LV_PART_MAIN | LV_STATE_DEFAULT);
  lv_obj_set_style_text_opa(firmwareLabel, 255,
                            LV_PART_MAIN | LV_STATE_DEFAULT);
  lv_obj_set_style_text_font(firmwareLabel, &lv_font_montserrat_10,
                             LV_PART_MAIN | LV_STATE_DEFAULT);
}

void Display::setDeviceName(String deviceName) {
  if (!Display::deviceNameLabel) {
    Display::deviceNameInitValue = deviceName;
    return;
  }

  // Schedule label update on LVGL thread to avoid cross-thread access
  char *text = (char *)malloc(deviceName.length() + 1);
  if (!text) {
    return;
  }
  strcpy(text, deviceName.c_str());
  lv_async_call(
      [](void *p) {
        if (Display::deviceNameLabel) {
          lv_label_set_text(Display::deviceNameLabel, (const char *)p);
        }
        free(p);
      },
      text);
}