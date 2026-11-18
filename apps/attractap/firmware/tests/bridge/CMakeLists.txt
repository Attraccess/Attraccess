cmake_minimum_required(VERSION 3.16)
project(attractap_bridge_tests LANGUAGES CXX)

enable_testing()
add_executable(bridge_logic_test bridge_logic_test.cpp)
target_compile_features(bridge_logic_test PRIVATE cxx_std_17)
target_compile_options(bridge_logic_test PRIVATE -Wall -Wextra -Wpedantic)
target_include_directories(bridge_logic_test PRIVATE ../../src/bridge)
add_test(NAME bridge_logic_test COMMAND bridge_logic_test)
