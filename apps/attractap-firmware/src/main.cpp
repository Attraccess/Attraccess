#include <Arduino.h>
#include "network.hpp"
#include "configuration.hpp"
#include "persistence.hpp"
#include "api.hpp"
#include "nfc.hpp"
#include "display.hpp"
#include "keypad.hpp"
#include "leds.hpp"
#include "web_server.hpp"

#include <SPI.h>
#include <Wire.h>

#include "improv_manager.hpp"

Leds leds;
Display display(&leds);
Network network(&display);
Keypad keypad;
API api(network.getInterface().getClient(), &display, &keypad);
NFC nfc;
ConfigWebServer webServer(&network.getInterface());

// Create the Improv manager
ImprovManager improvManager(&network.getInterface());

// Task handle for the display task
TaskHandle_t displayTaskHandle = NULL;
// Task handle for the Improv task
TaskHandle_t improvTaskHandle = NULL;
// Task handle for the web server task
TaskHandle_t webServerTaskHandle = NULL;

// Display task function
void userTask(void *parameter)
{
  const int REFRESH_RATE_HZ = 60;
  const int MS_PER_SECOND = 1000;
  const int LOOP_DELAY_MS = (MS_PER_SECOND / REFRESH_RATE_HZ) / portTICK_PERIOD_MS;

  for (;;)
  {
    display.loop();
    vTaskDelay(LOOP_DELAY_MS);
  }
}

// Improv task function
void improvTask(void *parameter)
{
  // Initialize Improv manager
  improvManager.setup();

  const int IMPROV_DELAY_MS = 10 / portTICK_PERIOD_MS;

  for (;;)
  {
    // Handle Improv commands
    improvManager.loop();
    vTaskDelay(IMPROV_DELAY_MS);
  }
}

// Web server task function
void webServerTask(void *parameter)
{
  // Wait for network to be available before starting web server
  while (!network.isHealthy())
  {
    Serial.println("[WebServer] Waiting for network...");
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }

  // Initialize web server
  webServer.setup();

  const int WEB_SERVER_DELAY_MS = 10 / portTICK_PERIOD_MS;

  for (;;)
  {
    webServer.loop();

    vTaskDelay(WEB_SERVER_DELAY_MS);
  }
}

void setup()
{
  Serial.begin(115200);
  delay(2000);

  Serial.println("Attractap starting...");

  // Initialize SPI for other peripherals if needed
  SPI.begin(PIN_SPI_SCK, PIN_SPI_MISO, PIN_SPI_MOSI);

  // Initialize I2C for NFC
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, I2C_FREQ);

  Persistence::setup();
  display.setup();
  leds.setup();

  // Create the display task (core 1, priority 1)
  xTaskCreate(
      userTask,          // Task function
      "DisplayTask",     // Task name
      4096,              // Stack size (bytes)
      NULL,              // Task parameters
      3,                 // Priority (1 is low, configMAX_PRIORITIES-1 is highest)
      &displayTaskHandle // Task handle
  );

  // Create the Improv task
  xTaskCreate(
      improvTask,       // Task function
      "ImprovTask",     // Task name
      4096,             // Stack size (bytes)
      NULL,             // Task parameters
      2,                // Priority (lower than display but higher than background)
      &improvTaskHandle // Task handle
  );

  // Create the web server task
  xTaskCreate(
      webServerTask,       // Task function
      "WebServerTask",     // Task name
      16384,               // Stack size (bytes) - increased from 8192 to fix route registration issues
      NULL,                // Task parameters
      6,                   // Priority (lowest of the tasks)
      &webServerTaskHandle // Task handle
  );

  keypad.setup();
  network.setup();
  api.setup();
  nfc.setup();

  api.setOnDisableNfcCardChecking([]()
                                  { nfc.disableLoopCardDetection(); });
  api.setOnEnableNfcCardChecking([]()
                                 { nfc.enableLoopCardDetection(); });
  api.setOnNfcAuthenticate([](uint8_t keyNumber, uint8_t *authenticationKey)
                           { return nfc.authenticate(keyNumber, authenticationKey); });
  api.setOnNfcChangeKey([](uint8_t keyNumber, uint8_t *authKey, uint8_t *oldKey, uint8_t *newKey)
                        { return nfc.changeKey(keyNumber, authKey, oldKey, newKey); });

  nfc.setOnNfcCardDetected([](char *uuid)
                           { api.sendNFCTapped(uuid, strlen(uuid)); });
}

void loop()
{
  network.loop();

  if (network.isHealthy())
  {
    api.enableLoop();
  }
  else
  {
    api.disableLoop();
  }
}