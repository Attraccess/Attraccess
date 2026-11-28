#include "conversion_ui.hpp"

namespace
{
    std::atomic<uint8_t> currentPhase{static_cast<uint8_t>(ConversionUi::Phase::None)};
    std::atomic<int> currentPercent{0};
}

namespace ConversionUi
{
    void set(Phase phase, int percent)
    {
        currentPercent = percent < 0 ? 0 : percent > 100 ? 100 : percent;
        currentPhase = static_cast<uint8_t>(phase);
    }

    Phase phase()
    {
        return static_cast<Phase>(currentPhase.load());
    }

    int percent()
    {
        return currentPercent.load();
    }
}
