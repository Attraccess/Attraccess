cmake_minimum_required(VERSION 3.16)
project(attractap_form_request_tests LANGUAGES CXX)

enable_testing()
add_executable(form_request_gate_test form_request_gate_test.cpp)
target_compile_features(form_request_gate_test PRIVATE cxx_std_17)
target_compile_options(form_request_gate_test PRIVATE -Wall -Wextra -Wpedantic)
target_include_directories(form_request_gate_test PRIVATE ../../src/application)
add_test(NAME form_request_gate_test COMMAND form_request_gate_test)
