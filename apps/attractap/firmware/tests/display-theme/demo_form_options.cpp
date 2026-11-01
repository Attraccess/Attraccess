#include "render_harness.hpp"

void testDemoMaterialCaptions(Renderer &renderer)
{
    FormsScreen details;
    API::ResourceUsageFormRequest request{};
    request.resourceId = 1;
    request.formCount = 1;
    request.forms[0] = {10, "CNC", 1};
    details.showForm(request);
    ScreenGuard guard(details.getScreen(), &details);
    API::ResourceUsageFormFieldsPage page{};
    page.resourceId = 1;
    page.formId = 10;
    page.fieldCount = page.totalFieldCount = 1;
    auto &field = page.fields[0];
    field.id = 101;
    field.name = "Material";
    field.type = API::ResourceUsageFormFieldType::SELECT;
    field.isRequired = true;
    field.options.select.count = 5;
    const char *values[] = {"Aluminium", "Holz", "Kunststoff", "Messing", "Stahl"};
    for (uint8_t i = 0; i < 5; ++i) field.options.select.values[i] = values[i];
    std::string submitted;
    unsigned submissions = 0;
    details.setFormPageNextCallback([&](const API::FormPageSubmission &submission) {
        expect(submission.answerCount == 1, "One material answer is submitted");
        submitted = submission.answers[0].stringValue;
        ++submissions;
    });
    const auto click = [&](const char *caption) {
        lv_obj_send_event(lv_obj_get_parent(requireObject(guard.root, &lv_label_class, caption)),
                          LV_EVENT_CLICKED, nullptr);
    };
    details.renderFormField(page, false, true, 1, 1);
    auto *wood = requireObject(guard.root, &lv_label_class, "Holz");
    click("Holz");
    for (const auto *locale : {"en", "de", "en"}) {
        Fixtures::activeLanguage = locale;
        FirmwareI18n::refreshTree(guard.root, locale);
        const bool english = std::string(locale) == "en";
        expect(requireObject(guard.root, &lv_label_class, english ? "Wood" : "Holz") == wood,
               "Existing option label refreshes without rebuilding the selection");
        for (const auto *caption : (english ? std::vector<const char *>{"Aluminium", "Wood", "Plastic", "Brass", "Steel"}
                                            : std::vector<const char *>{"Aluminium", "Holz", "Kunststoff", "Messing", "Stahl"}))
            requireObject(guard.root, &lv_label_class, caption);
        renderer.capture(english ? "demo-materials-english" : "demo-materials-german");
    }
    click("Submit");
    expect(submissions == 1 && submitted == "Holz", "English caption submits the original German wire value");
    field.hasValue = true;
    field.value = submitted;
    for (const auto *locale : {"de", "en"}) {
        Fixtures::activeLanguage = locale;
        details.renderFormField(page, false, true, 1, 1);
        requireObject(guard.root, &lv_label_class, std::string(locale) == "en" ? "Wood" : "Holz");
        click(std::string(locale) == "en" ? "Submit" : "Absenden");
        expect(submitted == "Holz", "Refetched selection remains valid on resubmission in either language");
    }
    expect(submissions == 3, "Both refetched selections were actually resubmitted");
    // Identical words in unrelated supplied forms must remain literal, even in demo builds.
    for (const auto [resourceId, formId, fieldId] : {std::array<uint32_t, 3>{2, 10, 101},
                                                   {1, 11, 101}, {1, 10, 102}}) {
        page.resourceId = resourceId;
        page.formId = formId;
        field.id = fieldId;
        details.renderFormField(page, false, true, 1, 1);
        FirmwareI18n::refreshTree(guard.root, "en");
        requireObject(guard.root, &lv_label_class, "Holz");
        expect(!findObject(guard.root, &lv_label_class, "Wood"), "Supplied option is not translated");
    }
    page.resourceId = 1;
    page.formId = 10;
    field.id = 101;
    field.options.select.values[1] = "Holz %s";
    details.renderFormField(page, false, true, 1, 1);
    FirmwareI18n::refreshTree(guard.root, "en");
    requireObject(guard.root, &lv_label_class, "Holz %s");
    details.resetForm();
}
