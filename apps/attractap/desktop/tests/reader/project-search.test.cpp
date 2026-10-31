#include "workflow.hpp"

static lv_obj_t *visibleObject(lv_obj_t *root, const lv_obj_class_t *type) {
    if (!root || lv_obj_has_flag(root, LV_OBJ_FLAG_HIDDEN)) return nullptr;
    if (lv_obj_check_type(root, type)) return root;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (auto *found = visibleObject(lv_obj_get_child(root, i), type)) return found;
    return nullptr;
}

static bool shown(const char *text) {
    auto *found = label(lv_screen_active(), text);
    return found && lv_obj_is_visible(found);
}

void ReaderWorkflow::testProjectSearch()
{
    // Search runs on the server across all pages; the reader keeps the query while paging.
    click("Projekt wählen");
    assert(shown("Werkstattprojekt") && shown("Projekte suchen") && !shown("Zurücksetzen"));
    // The search field shows the placeholder or the active query; tapping it opens the editor.
    const auto search = [this](const char *fieldCaption, const char *query) {
        click(fieldCaption);
        auto *keyboard = visibleObject(lv_screen_active(), &lv_keyboard_class);
        assert(keyboard && lv_keyboard_get_textarea(keyboard));
        lv_textarea_set_text(lv_keyboard_get_textarea(keyboard), query);
        display.capture(output, "project-search-editor");
        lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
        pump();
        assert(!visibleObject(lv_screen_active(), &lv_keyboard_class));
    };
    search("Projekte suchen", "  laser ");
    const auto lastRequest = [this] { JsonDocument payload; payload.set(server.last("PROJECTS_OF_USER")["data"]["payload"]); return payload; };
    JsonDocument request = lastRequest();
    assert(request["search"] == "laser" && request["page"] == 1);
    // A late answer to the previous, unfiltered request must not replace the search results.
    server.push("PROJECTS_OF_USER", R"({"page":1,"limit":4,"total":1,"search":"","projects":[{"id":42,"name":"Werkstattprojekt"}]})"); pump();
    assert(shown("Lade Projekte ...") && !shown("Werkstattprojekt"));
    server.push("PROJECTS_OF_USER", R"({"page":1,"limit":4,"total":5,"search":"laser","projects":[{"id":1,"name":"Laser A"},{"id":2,"name":"Laser B"},{"id":3,"name":"Laser C"},{"id":4,"name":"Laser D"}]})"); pump();
    assert(shown("Laser A") && shown("Laser D") && shown("Seite 1 von 2"));
    assert(shown("laser") && shown("Zurücksetzen"));
    display.capture(output, "project-search-results");
    click("Weiter");
    request = lastRequest();
    assert(request["search"] == "laser" && request["page"] == 2);
    server.push("PROJECTS_OF_USER", R"({"page":2,"limit":4,"total":5,"search":"laser","projects":[{"id":5,"name":"Laser E"}]})"); pump();
    assert(shown("Laser E") && shown("Seite 2 von 2"));

    search("laser", "zzz");
    assert(server.last("PROJECTS_OF_USER")["data"]["payload"]["search"] == "zzz");
    server.push("PROJECTS_OF_USER", R"({"page":1,"limit":4,"total":0,"search":"zzz","projects":[]})"); pump();
    assert(shown("Keine passenden Projekte gefunden") && !shown("Keine Projekte verfügbar"));
    display.capture(output, "project-search-no-matches");

    // Clearing returns to the normal, unfiltered list.
    click("Zurücksetzen");
    request = lastRequest();
    assert(request["search"].isNull() && request["page"] == 1);
    server.push("PROJECTS_OF_USER", R"({"page":1,"limit":4,"total":1,"search":"","projects":[{"id":42,"name":"Werkstattprojekt"}]})"); pump();
    assert(shown("Werkstattprojekt") && shown("Projekte suchen") && !shown("Zurücksetzen"));

    // A reply to an earlier request with the same page and query (e.g. for the previous
    // user) must not be shown: only the echoed ID of the latest request is accepted.
    const auto laserPage = [](uint32_t requestId) {
        return R"({"page":1,"limit":4,"total":5,"search":"laser","requestId":)" + std::to_string(requestId) +
               R"(,"projects":[{"id":1,"name":"Laser A"},{"id":2,"name":"Laser B"},{"id":3,"name":"Laser C"},{"id":4,"name":"Laser D"}]})";
    };
    search("Projekte suchen", "laser");
    const auto supersededId = lastRequest()["requestId"].as<uint32_t>();
    search("laser", "laser");
    const auto latestId = lastRequest()["requestId"].as<uint32_t>();
    assert(latestId > supersededId);
    server.push("PROJECTS_OF_USER", laserPage(supersededId)); pump();
    assert(shown("Lade Projekte ...") && !shown("Laser A"));
    server.push("PROJECTS_OF_USER", laserPage(latestId)); pump();
    assert(shown("Laser A") && shown("Seite 1 von 2"));

    // A request that cannot be sent keeps the previous results instead of loading forever.
    const auto requestsBeforeFailure = server.count("PROJECTS_OF_USER");
    server.failSends = true;
    click("Weiter");
    search("laser", "werk");
    server.failSends = false;
    assert(server.count("PROJECTS_OF_USER") == requestsBeforeFailure);
    assert(shown("Laser A") && shown("Seite 1 von 2") && shown("laser") && !shown("Lade Projekte ..."));
    // A server answer to the restored request is still accepted.
    server.push("PROJECTS_OF_USER", laserPage(latestId)); pump();
    assert(shown("Laser A"));

    // Reopening while a search is pending asks again instead of showing the old results.
    search("laser", "werk");
    click(LV_SYMBOL_CLOSE);
    const auto requestsBeforeReopen = server.count("PROJECTS_OF_USER");
    click("Projekt wählen");
    assert(server.count("PROJECTS_OF_USER") == requestsBeforeReopen + 1);
    assert(lastRequest()["search"] == "werk");
    assert(shown("Lade Projekte ...") && !shown("Laser A"));
    server.push("PROJECTS_OF_USER", R"({"page":1,"limit":4,"total":1,"search":"werk","requestId":)" +
                                        std::to_string(lastRequest()["requestId"].as<uint32_t>()) +
                                        R"(,"projects":[{"id":42,"name":"Werkstattprojekt"}]})"); pump();
    click("Werkstattprojekt");
    assert(label(lv_screen_active(), "Projekt: Werkstattprojekt"));
    assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Werkstattprojekt")));
}
