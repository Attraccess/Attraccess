cmake_minimum_required(VERSION 3.16)
project(attractap_led_pattern_tests LANGUAGES CXX)

enable_testing()
add_executable(led_pattern_test led_pattern_test.cpp)
target_compile_features(led_pattern_test PRIVATE cxx_std_17)
target_compile_options(led_pattern_test PRIVATE -Wall -Wextra -Wpedantic)
target_include_directories(led_pattern_test PRIVATE ../../src/led)
add_test(NAME led_pattern_test COMMAND led_pattern_test)
