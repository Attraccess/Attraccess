#pragma once

// Compile-time reader UI self-test (ATT-1187 phase 3). Built with -DATTRACTAP_UI_SELFTEST=ON on a real display
// variant (not the demo variants, which have a mock API) with Wi-Fi and the reader session connected. It injects
// plugin UI through the same inbound path the server uses, runs the hostile fixtures and prints the UI_* lines
// that `attractap-lab --check-ui-selftest` checks. Never part of a release image.

#ifdef ATTRACTAP_UI_SELFTEST
class API;

namespace UiSelftest
{
    void start(API &api);
}
#endif
