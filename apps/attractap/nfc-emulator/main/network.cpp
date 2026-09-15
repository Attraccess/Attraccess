#include "network.hpp"
#include "nfc_emulator/api_validation.hpp"

#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "mdns.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <cstdio>
#include <cstring>

namespace nfc_emulator {
namespace {
constexpr char tag[] = "network";
bool mdns_started = false;

void reconnect_task(void *) {
  vTaskDelay(pdMS_TO_TICKS(1000));
  esp_wifi_connect();
  vTaskDelete(nullptr);
}

void on_wifi(void *, esp_event_base_t base, int32_t id, void *) {
  if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) esp_wifi_connect();
  if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
    if (mdns_started) { mdns_free(); mdns_started = false; }
    xTaskCreate(reconnect_task, "wifi-reconnect", 2048, nullptr, 3, nullptr);
  }
}

void on_ip(void *, esp_event_base_t, int32_t, void *) {
  if (mdns_started) mdns_free();
  if (mdns_init() != ESP_OK) return;
  mdns_started = true;
  mdns_hostname_set("attractap-nfc-emulator");
  mdns_instance_name_set("Attractap NFC emulator");
  mdns_service_add(nullptr, "_http", "_tcp", 80, nullptr, 0);
  ESP_LOGI(tag, "ready at http://attractap-nfc-emulator.local");
}

void serial_task(void *argument) {
  auto &store = *static_cast<NvsStore *>(argument);
  char line[320];
  ESP_LOGI(tag, "serial provisioning: PROVISION <ssid>|<password>|<token>");
  while (fgets(line, sizeof(line), stdin)) {
    if (strncmp(line, "PROVISION ", 10) != 0) continue;
    char *ssid = line + 10;
    char *password = strchr(ssid, '|');
    if (!password) continue;
    *password++ = 0;
    char *token = strchr(password, '|');
    if (!token) continue;
    *token++ = 0;
    token[strcspn(token, "\r\n")] = 0;
    ApiValidationResult validation = validate_provisioning(ssid, password, token);
    if (!validation.valid) {
      ESP_LOGE(tag, "ERR %s", validation.message);
      continue;
    }
    if (store.save_provisioning({ssid, password, token})) {
      ESP_LOGI(tag, "OK provisioned; restarting");
      vTaskDelay(pdMS_TO_TICKS(100));
      esp_restart();
    }
    ESP_LOGE(tag, "ERR NVS write failed");
  }
  vTaskDelete(nullptr);
}

void setup_timeout_task(void *) {
  vTaskDelay(pdMS_TO_TICKS(10 * 60 * 1000));
  ESP_LOGW(tag, "setup AP window expired; serial provisioning remains available");
  esp_wifi_stop();
  vTaskDelete(nullptr);
}
}  // namespace

void start_serial_provisioning(NvsStore &store) {
  xTaskCreate(serial_task, "serial-provision", 4096, &store, 4, nullptr);
}

bool start_network(NvsStore &store) {
  ProvisioningConfig provisioning;
  bool provisioned = store.load_provisioning(provisioning);
  if (esp_netif_init() != ESP_OK || esp_event_loop_create_default() != ESP_OK) return false;
  wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
  if (esp_wifi_init(&init) != ESP_OK) return false;
  if (provisioned) {
    esp_netif_create_default_wifi_sta();
    esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, on_wifi, nullptr);
    esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_ip, nullptr);
    wifi_config_t config{};
    strlcpy(reinterpret_cast<char *>(config.sta.ssid), provisioning.ssid.c_str(), sizeof(config.sta.ssid));
    strlcpy(reinterpret_cast<char *>(config.sta.password), provisioning.password.c_str(), sizeof(config.sta.password));
    config.sta.threshold.authmode = provisioning.password.empty()
                                         ? WIFI_AUTH_OPEN : WIFI_AUTH_WPA2_PSK;
    config.sta.pmf_cfg.capable = true;
    config.sta.pmf_cfg.required = false;
    return esp_wifi_set_mode(WIFI_MODE_STA) == ESP_OK &&
           esp_wifi_set_config(WIFI_IF_STA, &config) == ESP_OK && esp_wifi_start() == ESP_OK;
  }

  esp_netif_create_default_wifi_ap();
  uint8_t mac[6]; esp_read_mac(mac, ESP_MAC_WIFI_SOFTAP);
  char setup_ssid[33]; snprintf(setup_ssid, sizeof(setup_ssid), "Attractap-NFC-%02X%02X", mac[4], mac[5]);
  wifi_config_t config{};
  strlcpy(reinterpret_cast<char *>(config.ap.ssid), setup_ssid, sizeof(config.ap.ssid));
  config.ap.ssid_len = strlen(setup_ssid);
  config.ap.max_connection = 4;
  config.ap.authmode = WIFI_AUTH_OPEN;
  ESP_LOGW(tag, "setup AP '%s'; POST /provision at http://192.168.4.1", setup_ssid);
  bool started = esp_wifi_set_mode(WIFI_MODE_AP) == ESP_OK &&
                 esp_wifi_set_config(WIFI_IF_AP, &config) == ESP_OK &&
                 esp_wifi_start() == ESP_OK;
  if (started) xTaskCreate(setup_timeout_task, "setup-timeout", 2048, nullptr, 3, nullptr);
  return started;
}

}  // namespace nfc_emulator
