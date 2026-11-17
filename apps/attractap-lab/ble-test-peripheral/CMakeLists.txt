# Lab-only generic GATT test peripheral for the plugin BLE transport hardware tests.
# Not shipped and not part of the reader firmware. See README.md.
cmake_minimum_required(VERSION 3.22)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)
project(ble-test-peripheral)
