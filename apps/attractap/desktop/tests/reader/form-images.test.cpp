#include "workflow.hpp"

// The image field of a usage form (ATT-879): the reader shows the QR code of the link the server sends and the number
// of photos the server holds, asks for the count again while the page is open and updates it in place, sends the
// field without ids on Next/Submit (the server fills them in) and shows the server's REQUIRED_FIELD on the button.
namespace
{
    lv_obj_t *findQr(lv_obj_t *root)
    {
        if (lv_obj_check_type(root, &lv_qrcode_class)) return root;
        for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
            if (auto *found = findQr(lv_obj_get_child(root, i))) return found;
        return nullptr;
    }

    std::string imageFields(int count, const char *url)
    {
        return std::string(R"({"resourceId":1,"action":"start","formId":8,"offset":0,"totalFieldCount":1,"fields":[{"id":12,)") +
               R"("name":"Foto des Schadens","description":"Bitte Schaden fotografieren","type":"image","isRequired":true,"value":null,)" +
               R"("handoffUrl":")" + url + R"(","imageCount":)" + std::to_string(count) + R"(,"maxImages":3}]})";
    }
}

void ReaderWorkflow::testFormImageField()
{
    // The handshake (api/handlers/auth.cpp) announces that this display build renders image fields.
    assert(server.last("READER_FIRMWARE_INFO")["data"]["payload"]["capabilities"]["formImages"] == true);
    supervised = false; active = false;
    login();
    click("Lasercutter");
    click("Ressource verwenden");
    server.push("RESOURCE_USAGE_FORM_REQUEST", R"({"resourceId":1,"action":"start","forms":[{"id":8,"name":"Schaden","fieldCount":1}]})"); pump();
    constexpr auto firstUrl = "https://att.example/form-photo/AAAAAAAAAAAAAAAAAAAAAAAA";
    server.push("RESOURCE_USAGE_FORM_FIELDS", imageFields(0, firstUrl)); pump();
    assert(lv_screen_active() == Display::formsScreen.getScreen());
    auto *title = requireLabel(lv_screen_active(), "Foto des Schadens *");
    requireLabel(lv_screen_active(), "Bitte Schaden fotografieren");
    requireLabel(lv_screen_active(), "Mit dem Handy scannen, um Fotos hinzuzufügen");
    auto *count = requireLabel(lv_screen_active(), "0 von 3 Fotos");
    auto *qr = findQr(lv_screen_active());
    assert(qr && lv_obj_is_visible(qr));
    display.expectCleanLayout("form image field");
    display.capture(output, "form-image-field");
    State::setUserLanguage(true, "en"); pump();
    assert(label(lv_screen_active(), "0 of 3 photos") == count && label(lv_screen_active(), "Scan with your phone to add photos"));
    State::setUserLanguage(true, "de"); pump();
    assert(label(lv_screen_active(), "0 von 3 Fotos") == count);

    // The count is asked for again while the page is open, with the page's own form and offset.
    const auto gets = server.count("RESOURCE_USAGE_FORM_GET_FIELDS");
    pump(3500);
    assert(server.count("RESOURCE_USAGE_FORM_GET_FIELDS") > gets);
    const auto pollMessage = server.last("RESOURCE_USAGE_FORM_GET_FIELDS");
    const auto poll = pollMessage["data"]["payload"];
    assert(poll["formId"].as<uint32_t>() == 8 && poll["offset"].as<uint32_t>() == 0 && poll["resourceId"].as<uint32_t>() == 1 &&
           poll["action"].as<std::string>() == "start" && poll["limit"].as<uint32_t>() == 1);

    // One request at a time: a slow server gets no second one while the first is unanswered...
    const auto polled = server.count("RESOURCE_USAGE_FORM_GET_FIELDS");
    pump(3500);
    assert(server.count("RESOURCE_USAGE_FORM_GET_FIELDS") == polled);
    // ...but a lost answer does not stop the polling: after 15 s (FORM_IMAGE_POLL_TIMEOUT_MS) the reader asks again.
    hostAdvanceMillis(15000); pump();
    assert(server.count("RESOURCE_USAGE_FORM_GET_FIELDS") == polled + 1);

    // The answer updates the count in place: the page, the QR code and its link stay as they are.
    server.push("RESOURCE_USAGE_FORM_FIELDS", imageFields(2, firstUrl)); pump();
    assert(label(lv_screen_active(), "2 von 3 Fotos") == count && label(lv_screen_active(), "Foto des Schadens *") == title);
    assert(findQr(lv_screen_active()) == qr && lv_screen_active() == Display::formsScreen.getScreen());
    // After the answer the next request goes out on the usual interval.
    pump(3500);
    assert(server.count("RESOURCE_USAGE_FORM_GET_FIELDS") == polled + 2);
    // A new link (the old one expired) redraws the symbol in the same widget.
    server.push("RESOURCE_USAGE_FORM_FIELDS", imageFields(2, "https://att.example/form-photo/BBBBBBBBBBBBBBBBBBBBBBBB")); pump();
    assert(findQr(lv_screen_active()) == qr && lv_obj_is_visible(qr));
    display.capture(output, "form-image-field-two");

    // Submit: the field travels without ids; the server answers REQUIRED_FIELD while it holds no photo.
    click("Absenden");
    const auto pageMessage = server.last("RESOURCE_USAGE_FORM_SUBMIT_PAGE");
    const auto page = pageMessage["data"]["payload"];
    assert(page["answers"].size() == 1 && page["answers"][0]["fieldId"].as<uint32_t>() == 12 &&
           page["answers"][0]["value"].as<std::string>().empty());
    server.push("RESOURCE_USAGE_FORM_PAGE_RESULT",
                R"({"resourceId":1,"action":"start","formId":8,"offset":0,"valid":false,"errors":[{"fieldId":12,"code":"REQUIRED_FIELD","message":"required"}]})");
    pump();
    assert(lv_screen_active() == Display::formsScreen.getScreen() && label(lv_screen_active(), "Pflichtfeld"));
    display.capture(output, "form-image-field-required");

    // Leaving the form stops the polling.
    click("Abbrechen");
    const auto afterCancel = server.count("RESOURCE_USAGE_FORM_GET_FIELDS");
    pump(3500);
    assert(server.count("RESOURCE_USAGE_FORM_GET_FIELDS") == afterCancel);
    list();
}
