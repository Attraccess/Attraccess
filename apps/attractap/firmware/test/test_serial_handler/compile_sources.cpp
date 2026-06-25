// Pull the firmware modules under test into this translation unit.
// PlatformIO's native test runner only compiles the test suite directory,
// not src/. This file bridges the gap without code duplication.
#include "../../src/serial/serialCommandHandler.cpp"
#include "../../src/logger/logger.cpp"
