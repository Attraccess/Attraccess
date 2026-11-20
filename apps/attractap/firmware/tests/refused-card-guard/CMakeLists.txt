cmake_minimum_required(VERSION 3.16)
project(attractap_refused_card_guard_tests LANGUAGES CXX)

enable_testing()
add_executable(refused_card_guard_test refused_card_guard_test.cpp ../../src/application/refused_card_guard.cpp)
target_compile_features(refused_card_guard_test PRIVATE cxx_std_17)
target_compile_options(refused_card_guard_test PRIVATE -Wall -Wextra -Wpedantic)
target_include_directories(refused_card_guard_test PRIVATE ../../src/application)
add_test(NAME refused_card_guard_test COMMAND refused_card_guard_test)
