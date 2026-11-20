cmake_minimum_required(VERSION 3.16)
project(attractap_bt_setup_tests LANGUAGES CXX)

enable_testing()
add_executable(bt_setup_logic_test bt_setup_logic_test.cpp)
target_compile_features(bt_setup_logic_test PRIVATE cxx_std_17)
target_compile_options(bt_setup_logic_test PRIVATE -Wall -Wextra -Wpedantic)
target_include_directories(bt_setup_logic_test PRIVATE ../../src/bt_setup ../../src/led)
add_test(NAME bt_setup_logic_test COMMAND bt_setup_logic_test)
