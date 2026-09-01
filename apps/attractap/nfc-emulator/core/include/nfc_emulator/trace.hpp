#pragma once

#include "nfc_emulator/engine.hpp"

#include <deque>

namespace nfc_emulator {

struct TraceEntry {
  uint64_t timestamp_ms = 0;
  uint32_t duration_ms = 0;
  Bytes command;
  Bytes response;
  Outcome outcome = Outcome::Response;
  std::string source;
};

class TraceLog {
 public:
  explicit TraceLog(size_t capacity = 64) : capacity_(capacity) {}
  void append(TraceEntry entry);
  void clear() { entries_.clear(); }
  const std::deque<TraceEntry> &entries() const { return entries_; }

 private:
  size_t capacity_;
  std::deque<TraceEntry> entries_;
};

}  // namespace nfc_emulator
