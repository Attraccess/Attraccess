idf_component_register(SRCS "main.c"
                       INCLUDE_DIRS "."
                       REQUIRES bt nvs_flash esp_timer esp_driver_i2c)
