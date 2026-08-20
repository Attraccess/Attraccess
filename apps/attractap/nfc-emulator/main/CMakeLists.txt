file(GLOB CORE_SOURCES "../core/src/*.cpp")
idf_component_register(
  SRCS "app_main.cpp" "nvs_store.cpp" "pn532_target.cpp" "control_api.cpp" "network.cpp" ${CORE_SOURCES}
  INCLUDE_DIRS "." "../core/include"
  REQUIRES driver esp_driver_gpio esp_driver_i2c esp_http_server esp_wifi esp_event esp_netif mdns nvs_flash json esp_timer esp_system
)
