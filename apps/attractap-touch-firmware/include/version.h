#pragma once

// Default firmware version - this will be overridden by build script with hash-based version
#ifndef FIRMWARE_VERSION
#error "FIRMWARE_VERSION is not defined"
#define FIRMWARE_VERSION "DEFAULT"
#endif