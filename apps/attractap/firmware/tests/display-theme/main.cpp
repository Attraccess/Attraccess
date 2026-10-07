#include "render_harness.hpp"

int main(int argc, char **argv)
{
    std::filesystem::path output;
    if (argc == 2 && std::string(argv[1]) == "--help") {
        std::cout << "Usage: display-theme-host [--output DIR]\nWrites optional 480x480, top-down, packed RGBA8 .rgba files.\n";
        return 0;
    }
    if (argc == 3 && std::string(argv[1]) == "--output") output = argv[2];
    else if (argc != 1) {
        std::cerr << "Usage: display-theme-host [--output DIR]\n";
        return 2;
    }
    try {
        Renderer renderer(output);
        unsigned passed = 0, failed = 0;
        const auto test = [&](const char *name, auto run) {
            Fixtures::nowMs = 1000;
            Fixtures::network = {};
            Fixtures::websocket = {};
            Fixtures::api = {};
            const auto errorsBefore = lvglErrors;
            try {
                run();
                expect(lvglErrors == errorsBefore, "No LVGL error logs");
                ++passed;
                std::cout << "PASS " << name << '\n';
            } catch (const std::exception &error) {
                ++failed;
                std::cerr << "FAIL " << name << ": " << error.what() << '\n';
            }
        };
        test("render/latin1-all-sizes", [&] { testLatin1Fonts(renderer); });
        test("theme/surfaces-and-font", [&] { testSurfaces(renderer); });
        test("theme/automatic-button-states", [&] { testButtons(renderer, false); });
        test("theme/helper-button-states", [&] { testButtons(renderer, true); });
        test("theme/fields-and-keyboard-states", [&] { testInputs(renderer); });
        test("render/production-logo-bytes", [&] { testLogos(renderer); });
        test("screen/att-880-authenticated-list", [&] { testAuthenticatedList(renderer); });
        test("screen/restored-backgrounds", [&] { testBackgroundScreens(renderer); });
        test("screen/boot", [&] { testBoot(renderer); });
        test("screen/init", [&] { testInit(renderer); });
        test("screen/enrollment", [&] { testCard<EnrollmentScreen>(renderer, "enrollment", "Karte wird beschrieben...\nbitte nicht bewegen", "Karte registriert!"); });
        test("screen/reset", [&] { testCard<ResetScreen>(renderer, "reset", "Karte wird zurückgesetzt...\nbitte nicht bewegen", "Karte zurückgesetzt!"); });
        test("screen/supervision", [&] { testSupervision(renderer); });
        test("screen/introducer-details", [&] { testIntroducerDetails(renderer); });
        test("screen/usage-stats-expiry", [&] { testUsageStatsExpiry(renderer); });
        test("screen/pin-and-real-keyboard-events", [&] { testPin(renderer); });
        std::cout << "RESULT " << passed << " passed, " << failed << " failed; " << checks << " checks; "
                  << renderer.captures << " real LVGL frames\n";
        std::cout << "COVERAGE: production theme, boot/init/enrollment/reset/supervision/PIN, lockscreen/resource list/no resources and image assets.\n"
                     "NOT COVERED: devices, RTOS, transport, full router/overlays, remaining screens or pixel-golden approval.\n";
        if (!output.empty()) std::cout << "OUTPUT " << std::filesystem::absolute(output) << '\n';
        return failed || lvglErrors ? 1 : 0;
    } catch (const std::exception &error) {
        std::cerr << "Harness error: " << error.what() << '\n';
        return 2;
    }
}
