#include "workflow.hpp"

// The server refuses a usage form's fields or page the way its forms handler does: through the
// resource-action guard, as START_RESOURCE_USAGE_SESSION {"error"} without a request id, also
// while a stop form is open. A refused page stays on the form with the reason on Next/Submit; a
// form whose fields cannot be loaded closes, and the button that opened it says why.
namespace
{
    const std::string genericError = warned("Fehlgeschlagen – erneut tippen");

    std::string formRequest(const char *action, int fields)
    {
        return std::string(R"({"resourceId":1,"action":")") + action + R"(","forms":[{"id":8,"name":"Check","fieldCount":)" +
               std::to_string(fields) + "}]}";
    }

    std::string formFields(const char *action, int offset, int total)
    {
        return std::string(R"({"resourceId":1,"action":")") + action + R"(","formId":8,"offset":)" + std::to_string(offset) +
               R"(,"totalFieldCount":)" + std::to_string(total) + R"(,"fields":[{"id":)" + std::to_string(9 + offset) +
               R"(,"name":"Sichtprüfung","type":"text","isRequired":true,"value":"OK"}]})";
    }

    std::string pageResult(const char *action, int offset)
    {
        return std::string(R"({"resourceId":1,"action":")") + action + R"(","formId":8,"offset":)" + std::to_string(offset) + R"(,"valid":true})";
    }
}

void ReaderWorkflow::testFormErrors()
{
    supervised = false; active = false;
    login();
    const auto refuse = [&](const char *code = "RESOURCE_LOCKED") {
        server.push("START_RESOURCE_USAGE_SESSION", std::string(R"({"error":")") + code + "\"}");
        pump();
    };

    // Start form from the details: a refused page stays on the form, in place on "Weiter", then
    // on "Absenden"; a tap on the button sends the page again.
    click("Lasercutter");
    click("Ressource verwenden");
    server.push("RESOURCE_USAGE_FORM_REQUEST", formRequest("start", 2)); pump();
    server.push("RESOURCE_USAGE_FORM_FIELDS", formFields("start", 0, 2)); pump();
    assert(lv_screen_active() == Display::formsScreen.getScreen());
    {
        auto *next = buttonOf(lv_screen_active(), "Weiter");
        const lv_area_t before = areaOf(next);
        const auto pages = server.count("RESOURCE_USAGE_FORM_SUBMIT_PAGE");
        click("Weiter");
        assert(server.count("RESOURCE_USAGE_FORM_SUBMIT_PAGE") == pages + 1);
        refuse();
        assert(lv_screen_active() == Display::formsScreen.getScreen());
        auto *shown = buttonOf(lv_screen_active(), genericError.c_str());
        assert(shown == next && sameArea(areaOf(shown), before) && !lv_obj_has_state(next, LV_STATE_DISABLED));
        display.capture(output, "button-error-form-next");
        touchCentre(next);
        assert(server.count("RESOURCE_USAGE_FORM_SUBMIT_PAGE") == pages + 2 && !showsError(next));
        server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", pageResult("start", 0)); pump();
        server.push("RESOURCE_USAGE_FORM_FIELDS", formFields("start", 1, 2)); pump();
        auto *submit = buttonOf(lv_screen_active(), "Absenden");
        assert(submit && sameArea(areaOf(submit), before));
        click("Absenden");
        refuse("CARD_NOT_ACTIVE");
        assert(label(lv_screen_active(), warned("Karte ist nicht aktiv").c_str()) && showsError(submit) && sameArea(areaOf(submit), before));
        display.capture(output, "button-error-form-submit");
        const auto submits = server.count("RESOURCE_USAGE_FORM_SUBMIT_PAGE");
        touchCentre(submit);
        assert(server.count("RESOURCE_USAGE_FORM_SUBMIT_PAGE") == submits + 1 && !showsError(submit));
        refuse();
        assert(showsError(submit));
        pump(4300);
        assert(!showsError(submit) && label(lv_screen_active(), "Absenden") && sameArea(areaOf(submit), before));
        click("Absenden");
        refuse();
        assert(showsError(submit));
        // Leaving takes it away: Cancel closes the form, back on the details.
        click("Abbrechen");
        assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
        list();
    }

    // Start form from the details whose fields cannot be loaded: the form closes and
    // "Ressource verwenden" says why, after the refresh.
    {
        const lv_area_t before = areaOf(buttonOf(lv_screen_active(), "Ressource verwenden"));
        click("Ressource verwenden");
        server.push("RESOURCE_USAGE_FORM_REQUEST", formRequest("start", 1)); pump();
        assert(lv_screen_active() == Display::formsScreen.getScreen());
        refuse();
        assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen() && server.count("RESOURCE_USAGE_FORM_CANCEL") > 0);
        list();
        auto *shown = buttonOf(lv_screen_active(), genericError.c_str());
        assert(shown && sameArea(areaOf(shown), before));
    }

    // Stop form from the details: the server still answers with START_RESOURCE_USAGE_SESSION.
    // The form never stays busy: a refused page is shown on "Absenden", a refused field load
    // closes the form and puts the reason on "Sitzung beenden".
    active = true; list();
    {
        click("Sitzung beenden");
        server.push("RESOURCE_USAGE_FORM_REQUEST", formRequest("end", 1)); pump();
        server.push("RESOURCE_USAGE_FORM_FIELDS", formFields("end", 0, 1)); pump();
        auto *submit = buttonOf(lv_screen_active(), "Absenden");
        click("Absenden");
        refuse();
        assert(lv_screen_active() == Display::formsScreen.getScreen() && showsError(submit));
        assert(!lv_obj_has_state(buttonOf(lv_screen_active(), "Abbrechen"), LV_STATE_DISABLED));
        click("Abbrechen");
        list();
        const lv_area_t before = areaOf(buttonOf(lv_screen_active(), "Sitzung beenden"));
        click("Sitzung beenden");
        server.push("RESOURCE_USAGE_FORM_REQUEST", formRequest("end", 1)); pump();
        refuse();
        assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
        list();
        auto *shown = buttonOf(lv_screen_active(), genericError.c_str());
        assert(shown && sameArea(areaOf(shown), before));
        // Nothing is left waiting: the next stop goes through.
        pump(4300);
        click("Sitzung beenden");
        server.push("STOP_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(requestIdOf("STOP_RESOURCE_USAGE_SESSION")) + R"(,"success":true})");
        pump();
        active = false; list();
        clearStatus();
    }
    click(LV_SYMBOL_LEFT);

    // From the list: the form opens over the details, a refused field load goes back to the list
    // and the row's button says why, for start and for stop.
    for (const bool stop : {false, true})
    {
        active = stop; list();
        const char *caption = stop ? "Stop" : "Start";
        const lv_area_t before = areaOf(buttonOf(lv_screen_active(), caption));
        click(caption);
        server.push("RESOURCE_USAGE_FORM_REQUEST", formRequest(stop ? "end" : "start", 1)); pump();
        assert(lv_screen_active() == Display::formsScreen.getScreen());
        refuse();
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        list();
        auto *shown = buttonOf(lv_screen_active(), genericError.c_str());
        assert(shown && sameArea(areaOf(shown), before));
        if (!stop) display.capture(output, "button-error-list-form");
        pump(4300);
    }
    // A refused page of a stop form opened from the list stays on the form.
    {
        click("Stop");
        server.push("RESOURCE_USAGE_FORM_REQUEST", formRequest("end", 1)); pump();
        server.push("RESOURCE_USAGE_FORM_FIELDS", formFields("end", 0, 1)); pump();
        click("Absenden");
        refuse();
        assert(lv_screen_active() == Display::formsScreen.getScreen() && showsError(buttonOf(lv_screen_active(), genericError.c_str())));
        click("Abbrechen");
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        list();
    }
    active = false; list();
    click("Abmelden");
    list(false);
    std::cout << "PASS refused usage forms: in place on Next/Submit, or on the button that opened them" << std::endl;
}
