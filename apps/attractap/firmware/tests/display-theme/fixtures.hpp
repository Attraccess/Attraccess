#pragma once

#include "state/state.hpp"
#include <vector>
#include "clock/wall_clock.hpp"

namespace Fixtures
{
inline constexpr char userName[] = "Alex Example";
inline constexpr char errorMessage[] = "Karte nicht berechtigt";
inline constexpr char supervisorHint[] = "Aufsicht kann auch im Web freigeben.";
inline constexpr char pin[] = "1234";
inline uint32_t nowMs = 1000;
inline State::NetworkState network{};
inline State::WebsocketState websocket{};
inline State::ApiState api{};
inline State::SessionProblem sessionProblem = State::SESSION_PROBLEM_NONE;
inline std::string activeLanguage = "de";
inline std::vector<uint8_t> deletedDemoCardIndices;
void resetDemoCards();
inline WallClock::LocalTime wallClock{};
}
