#ifdef ATTRACTAP_BLE_BRIDGE

#include "bridge.hpp"

#include "driver/gpio.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "sdkconfig.h"
#if CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH
#include "esp_core_dump.h"
#endif

#include "../api/conversion/conversion_migration.hpp"
#include "../bt_setup/bt_setup.hpp"
#include "../logger/logger.hpp"
#include "../platform.hpp"
#include "../state/state.hpp"

namespace bridge
{
    namespace
    {
        constexpr uint32_t TICK_MS = 50;
        // Also brings NimBLE up and down for the Bluetooth setup (esp_bt_controller_init runs on this task).
        constexpr uint32_t TASK_STACK = 4096;
        // Time the "all LEDs on" of a factory reset stays visible before the reboot.
        constexpr uint32_t RESET_SHOW_MS = 1000;

        Logger logger("Bridge");
        std::function<BleActivity()> activitySource;

        void requestSetup(uint32_t now)
        {
            switch (bt_setup::request(now, bt_setup::Trigger::User))
            {
            case bt_setup::Request::Opened:
                logger.info("Button held 3 s: Bluetooth setup open for 10 minutes");
                break;
            case bt_setup::Request::Paired:
                logger.info("Button held 3 s: Bluetooth setup is only available before the bridge is paired");
                break;
            default:
                break;
            }
        }

        // The S10's LEDs are active low.
        void setLed(int pin, bool on) { gpio_set_level(static_cast<gpio_num_t>(pin), on ? 0 : 1); }

        void show(const LedLevels &levels)
        {
            setLed(PIN_LED_POWER, levels.power);
            setLed(PIN_LED_NETWORK, levels.network);
            setLed(PIN_LED_BT, levels.bt);
        }

        // Clears Wi-Fi, the API address, the pairing credentials and the PIN (all of NVS) and any crash dump, then
        // reboots unconfigured. Setup starts again over Bluetooth (hold 3 s) or the serial pads.
        [[noreturn]] void factoryReset()
        {
            logger.warn("Button held 10 s: factory reset");
            LedInputs in;
            in.factoryReset = true;
            show(ledLevels(in, millis()));
            // Never while a conversion's data is staged (the bridge has no staging region, so this always passes).
            if (ConversionMigration::nvsErasePermitted())
            {
                nvs_flash_deinit();
                const esp_err_t err = nvs_flash_erase();
                if (err != ESP_OK) logger.errorf("NVS erase failed: %s", esp_err_to_name(err));
            }
#if CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH
            // A crash dump holds copies of task stacks, which may include the Wi-Fi password or the PIN.
            esp_core_dump_image_erase();
#endif
            delay(RESET_SHOW_MS);
            esp_restart();
        }

        void run(void *)
        {
            Button button;
            for (;;)
            {
                const uint32_t now = millis();
                const bool pressed = gpio_get_level(static_cast<gpio_num_t>(PIN_BUTTON)) == 0;
                switch (button.update(pressed, now))
                {
                case Button::Action::Reboot:
                    logger.info("Button pressed: reboot");
                    delay(100); // let the log line out
                    esp_restart();
                case Button::Action::FactoryReset:
                    factoryReset();
                case Button::Action::Setup:
                    requestSetup(now);
                    break;
                case Button::Action::None:
                    break;
                }

                bt_setup::update(State::getApiState().authenticated, now);

                const State::NetworkState network = State::getNetworkState();
                LedInputs in;
                in.networkUp = network.ethernet_connected || network.wifi_connected;
                in.apiConnected = State::getWebsocketState().connected;
                in.ble = activitySource ? activitySource() : BleActivity::Idle;
                in.buttonHeldMs = button.heldMs(now);
                in.setupWindow = bt_setup::isOpen();
                in.setupLinked = bt_setup::linked();
                show(ledLevels(in, now));
                vTaskDelay(pdMS_TO_TICKS(TICK_MS));
            }
        }
    }

    void start(std::function<BleActivity()> bleActivity)
    {
        activitySource = std::move(bleActivity);
        bt_setup::registerChannel();

        gpio_config_t leds = {};
        leds.pin_bit_mask = (1ULL << PIN_LED_POWER) | (1ULL << PIN_LED_NETWORK) | (1ULL << PIN_LED_BT);
        leds.mode = GPIO_MODE_OUTPUT;
        gpio_config(&leds);
        LedInputs boot;
        show(ledLevels(boot, 0));

        gpio_config_t buttonPin = {};
        buttonPin.pin_bit_mask = 1ULL << PIN_BUTTON;
        buttonPin.mode = GPIO_MODE_INPUT;
        buttonPin.pull_up_en = GPIO_PULLUP_ENABLE;
        gpio_config(&buttonPin);

        if (xTaskCreate(run, "bridge", TASK_STACK, nullptr, 2, nullptr) != pdPASS)
            logger.error("Could not start the LED/button task");
    }
}

#endif
