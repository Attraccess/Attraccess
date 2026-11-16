#include "workflow.hpp"

// An action that fails shows in place on the button that started it: the button keeps its size
// and place, nothing else moves, a real tap on it retries, it goes after about 4 s or when the
// screen is left, and it is dropped when the button now means something else.
namespace
{
    const std::string genericError = warned("Fehlgeschlagen – erneut tippen");
}

void ReaderWorkflow::testButtonErrors()
{
    supervised = false; active = false;
    login();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    const char *start = "START_RESOURCE_USAGE_SESSION";

    // The list row.
    {
        const lv_area_t before = areaOf(buttonOf(lv_screen_active(), "Start"));
        click("Start");
        const auto requests = server.count(start);
        failAction(start, "RESOURCE_LOCKED");
        // The status refresh that follows the failure still covers the list: the error waits for it.
        assert(!label(lv_screen_active(), genericError.c_str()));
        list();
        auto *shown = buttonOf(lv_screen_active(), genericError.c_str());
        assert(shown && sameArea(areaOf(shown), before) && showsError(shown));
        display.capture(output, "button-error-list");
        pump(2500); // Its 4 s started when it became visible.
        assert(showsError(shown));
        touchCentre(shown); // The button is still the button: a tap is the retry.
        assert(server.count(start) == requests + 1 && !label(lv_screen_active(), genericError.c_str()));
        failAction(start, "RESOURCE_LOCKED");
        list();
        assert(label(lv_screen_active(), genericError.c_str()));
        pump(4300);
        assert(!label(lv_screen_active(), genericError.c_str()) && sameArea(areaOf(buttonOf(lv_screen_active(), "Start")), before));
        // A known reader error is shown instead of the generic text.
        click("Start");
        failAction(start, "CARD_NOT_ACTIVE");
        list();
        assert(label(lv_screen_active(), warned("Karte ist nicht aktiv").c_str()));
        // Leaving the screen takes it away.
        click("Lasercutter");
        click(LV_SYMBOL_LEFT);
        assert(!label(lv_screen_active(), warned("Karte ist nicht aktiv").c_str()));
        // The row's action changed meanwhile (the session started elsewhere): the error is dropped,
        // a tap must not stop what the button no longer says.
        click("Start");
        failAction(start, "RESOURCE_LOCKED");
        active = true; list();
        auto *stop = buttonOf(lv_screen_active(), "Stop");
        assert(stop && !showsError(stop) && !label(lv_screen_active(), genericError.c_str()));
        active = false; list();
    }

    // The details action button.
    click("Lasercutter");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    {
        const lv_area_t before = areaOf(buttonOf(lv_screen_active(), "Ressource verwenden"));
        click("Ressource verwenden");
        const auto requests = server.count(start);
        failAction(start, "RESOURCE_LOCKED");
        assert(!label(lv_screen_active(), genericError.c_str())); // waits for the refresh
        list();
        auto *shown = buttonOf(lv_screen_active(), genericError.c_str());
        assert(shown && sameArea(areaOf(shown), before));
        display.capture(output, "button-error-details");
        touchCentre(shown);
        assert(server.count(start) == requests + 1 && !label(lv_screen_active(), genericError.c_str()));
        failAction(start, "RESOURCE_LOCKED");
        list();
        assert(label(lv_screen_active(), genericError.c_str()));
        pump(4300);
        assert(!label(lv_screen_active(), genericError.c_str()) && sameArea(areaOf(buttonOf(lv_screen_active(), "Ressource verwenden")), before));
        click("Ressource verwenden");
        failAction(start, "RESOURCE_LOCKED");
        list();
        assert(label(lv_screen_active(), genericError.c_str()));
        click(LV_SYMBOL_LEFT); // Leaving takes it away.
        click("Lasercutter");
        assert(!label(lv_screen_active(), genericError.c_str()));
        // Someone else started meanwhile and the resource may be taken over: the button now says
        // "Übernehmen". The error is dropped, a tap must not take over another user's session.
        click("Ressource verwenden");
        failAction(start, "RESOURCE_LOCKED");
        active = true; activeUser = "Robin"; allowTakeOver = true; list();
        auto *takeOver = buttonOf(lv_screen_active(), "Übernehmen");
        assert(takeOver && !showsError(takeOver) && !label(lv_screen_active(), genericError.c_str()));
        active = false; activeUser.clear(); allowTakeOver = false; list();
    }

    // A flow button keeps its error through the refresh that rebuilds every flow button.
    active = true; flowButtons = {{"light", "Licht"}}; list();
    {
        const lv_area_t before = areaOf(buttonOf(lv_screen_active(), "Licht"));
        click("Licht");
        failAction("TRIGGER_FLOW_BUTTON", "RESOURCE_LOCKED");
        list();
        auto *shown = buttonOf(lv_screen_active(), genericError.c_str());
        assert(shown && sameArea(areaOf(shown), before));
        pump(4300);
        assert(!label(lv_screen_active(), genericError.c_str()));
        // The button is gone when the result arrives (the flow was removed meanwhile): a
        // full-screen error with the code, and "Zurück" returns to the details.
        click("Licht");
        flowButtons.clear(); list();
        assert(!label(lv_screen_active(), "Licht"));
        failAction("TRIGGER_FLOW_BUTTON", "RESOURCE_LOCKED");
        assert(lv_screen_active() == Display::statusScreen.getScreen());
        assert(label(lv_screen_active(), "Etwas ist schiefgelaufen") && label(lv_screen_active(), "Code: RESOURCE_LOCKED"));
        display.capture(output, "generic-error");
        click("Zurück");
        assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
        list();
        assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen() && !Display::transientActive());
    }
    active = false; list();

    // The top-up screen's "Aufladen".
    click("Ressource verwenden");
    server.push(start, "{\"requestId\":" + std::to_string(requestIdOf(start)) + R"(,"error":"INSUFFICIENT_BALANCE","sumUpEnabled":true})");
    pump(); list();
    assert(lv_screen_active() == Display::topUpScreen.getScreen());
    {
        auto *topUp = buttonOf(lv_screen_active(), "Aufladen");
        const lv_area_t before = areaOf(topUp);
        const auto topUps = server.count("BILLING_REQUEST_TOPUP");
        touchCentre(topUp); // Nothing typed yet.
        assert(label(lv_screen_active(), warned("Betrag fehlt").c_str()) && sameArea(areaOf(topUp), before) && showsError(topUp));
        assert(server.count("BILLING_REQUEST_TOPUP") == topUps);
        display.capture(output, "button-error-top-up");
        pump(4300);
        assert(!showsError(topUp) && sameArea(areaOf(topUp), before));
        touchCentre(topUp);
        assert(showsError(topUp));
        click("Abbrechen"); // Leaving takes it away.
        assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
        click("Ressource verwenden");
        server.push(start, "{\"requestId\":" + std::to_string(requestIdOf(start)) + R"(,"error":"INSUFFICIENT_BALANCE","sumUpEnabled":true})");
        pump(); list();
        topUp = buttonOf(lv_screen_active(), "Aufladen");
        assert(!showsError(topUp));
        // The server refuses the request: back to the amount that was typed, the reason on
        // "Aufladen", and a tap there sends the same amount again.
        click("2"); click("5");
        touchCentre(topUp);
        assert(server.last("BILLING_REQUEST_TOPUP")["data"]["payload"]["amountCents"].as<uint32_t>() == 2500);
        assert(lv_screen_active() == Display::statusScreen.getScreen());
        server.push("BILLING_REQUEST_TOPUP", R"({"error":"NO_SUMUP_TERMINALS_AVAILABLE"})"); pump();
        assert(lv_screen_active() == Display::topUpScreen.getScreen() && label(lv_screen_active(), "25 \xE2\x82\xAC"));
        topUp = buttonOf(lv_screen_active(), "Aufladen");
        assert(showsError(topUp) && sameArea(areaOf(topUp), before));
        touchCentre(topUp);
        assert(server.count("BILLING_REQUEST_TOPUP") == topUps + 2 &&
               server.last("BILLING_REQUEST_TOPUP")["data"]["payload"]["amountCents"].as<uint32_t>() == 2500);
        pump(6300); // "Continue at the payment terminal" returns by itself.
        assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
        // The retry is refused as well, later: the top-up comes back once more.
        server.push("BILLING_REQUEST_TOPUP", R"({"error":"NO_SUMUP_TERMINALS_AVAILABLE"})"); pump();
        assert(lv_screen_active() == Display::topUpScreen.getScreen());
        click("Abbrechen");
        // A refusal nobody waits for any more shows nothing.
        server.push("BILLING_REQUEST_TOPUP", R"({"error":"NO_SUMUP_TERMINALS_AVAILABLE"})"); pump();
        assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen() && !Display::transientActive());
    }
    click(LV_SYMBOL_LEFT);
    click("Abmelden");
    list(false);
    std::cout << "PASS in-place button errors on list rows, details, flow buttons and top-up" << std::endl;
}
