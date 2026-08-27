cmake_minimum_required(VERSION 3.16)
project(attractap_supervision_flow_tests LANGUAGES CXX)

enable_testing()
add_executable(supervision_flow_test
    supervision_flow_test.cpp
    ../../src/application/supervision.cpp
)
target_compile_features(supervision_flow_test PRIVATE cxx_std_17)
target_compile_definitions(supervision_flow_test PRIVATE HAS_LVGL_DISPLAY SUPERVISION_FLOW_TEST)
target_include_directories(supervision_flow_test PRIVATE fakes)
add_test(NAME supervision_flow_test COMMAND supervision_flow_test)
