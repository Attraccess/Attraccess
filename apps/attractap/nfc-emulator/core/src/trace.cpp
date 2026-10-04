#include "nfc_emulator/trace.hpp"

namespace nfc_emulator {
void TraceLog::append(TraceEntry entry) {
  if (entries_.size() == capacity_) entries_.pop_front();
  entries_.push_back(std::move(entry));
}
}  // namespace nfc_emulator
