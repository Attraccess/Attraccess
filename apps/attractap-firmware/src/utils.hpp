#pragma once

#include <Arduino.h>

String hexToString(uint8_t *uid, uint8_t uidLength);
bool stringToHexArray(String hexString, uint8_t *array, uint8_t arrayLength);

/**
 * @brief Convert milliseconds to a time string in the format "HH:MM:SS"
 * @param millis The milliseconds to convert
 * @return The time string
 */
String millisToTimeString(double millis);

/**
 * @brief Convert a time_t to a time string in the format "DD.MM. HH:MM"
 * @param time The time_t to convert
 * @return The time string
 */
String timeToTimeString(time_t time);