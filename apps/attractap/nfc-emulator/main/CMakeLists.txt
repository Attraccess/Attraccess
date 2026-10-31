file(GLOB CORE_SOURCES "../core/src/*.cpp")
idf_component_register(
  SRCS "app_main.cpp" "nvs_store.cpp" "pn532_target.cpp" "commands.cpp" "reader_button.cpp" "serial_console.cpp" ${CORE_SOURCES}
  INCLUDE_DIRS "." "../core/include"
  REQUIRES esp_driver_gpio esp_driver_i2c esp_driver_usb_serial_jtag nvs_flash cjson esp_timer esp_system
)
