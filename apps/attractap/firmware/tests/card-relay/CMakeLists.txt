cmake_minimum_required(VERSION 3.16)
project(attractap_card_relay_tests LANGUAGES CXX)

enable_testing()
add_executable(card_relay_test card_relay_test.cpp)
target_compile_features(card_relay_test PRIVATE cxx_std_17)
target_include_directories(card_relay_test PRIVATE ../../src/application)
add_test(NAME card_relay_test COMMAND card_relay_test)
