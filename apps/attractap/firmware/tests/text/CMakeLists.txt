cmake_minimum_required(VERSION 3.16)
project(attractap_text_tests LANGUAGES CXX)

enable_testing()
add_executable(utf8_copy_test utf8_copy_test.cpp ../../src/text/utf8_copy.cpp)
target_compile_features(utf8_copy_test PRIVATE cxx_std_17)
target_compile_options(utf8_copy_test PRIVATE -Wall -Wextra -Wpedantic)
add_test(NAME utf8_copy_test COMMAND utf8_copy_test)
