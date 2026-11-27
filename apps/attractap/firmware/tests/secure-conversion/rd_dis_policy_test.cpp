// The WR_DIS_RD_DIS lock of the secure app (ATT-1208, step 8) is compiled in only for release secure images: never for
// secure-lab, demo, debug, test-hook or plain builds. CMakeLists.txt builds this file once per build flavour with that
// flavour's defines and the expected answer (EXPECT_LOCK).
#include <cstdio>

#include "api/conversion/conversion_build.hpp"

#ifdef ATTRACTAP_RD_DIS_LOCK
constexpr bool lockMacro = true;
#else
constexpr bool lockMacro = false;
#endif

static_assert(ConversionBuild::rdDisLock() == lockMacro, "the constexpr and the macro must agree");
static_assert(ConversionBuild::rdDisLock() == (EXPECT_LOCK != 0), "RD_DIS lock compiled in the wrong build flavour");
#if defined(ATTRACTAP_SECURE_LAB) || defined(DEMO_MODE) || defined(ATTRACTAP_TEST_HOOKS) ||                         \
    defined(CONFIG_COMPILER_OPTIMIZATION_DEBUG)
static_assert(!ConversionBuild::rdDisLock(), "secure-lab, demo, debug and test builds never lock RD_DIS");
#endif
#ifdef ATTRACTAP_CONVERSION_STOP_BEFORE_BURN
static_assert(ConversionBuild::stopBeforeBurn(), "the stop-before-burn define reaches the build switch");
#endif

int main()
{
    std::printf("rd-dis lock %s\n", ConversionBuild::rdDisLock() ? "compiled in" : "compiled out");
    return ConversionBuild::rdDisLock() == (EXPECT_LOCK != 0) ? 0 : 1;
}
