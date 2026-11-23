#include "render_harness.hpp"

// The image field of the forms screen (ATT-879): the QR code of the phone link and the live count follow the
// language and the server's answers; the page is submitted without photo ids.
void testFormImageField(Renderer &renderer)
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
    field.id = 105;
    field.name = "Foto des Werkstücks";
    field.type = API::ResourceUsageFormFieldType::IMAGE;
    field.handoffUrl = "https://demo.attraccess.invalid/form-photo/DemoToken0123456789abc";
    field.imageCount = 0;
    field.maxImages = 3;
    unsigned submissions = 0;
    details.setFormPageNextCallback([&](const API::FormPageSubmission &submission) {
        expect(submission.answerCount == 1 && submission.answers[0].fieldId == 105 &&
                   submission.answers[0].stringValue.empty(),
               "The image field is submitted without ids");
        ++submissions;
    });
    details.renderFormField(page, false, true, 1, 1);
    auto *count = requireObject(guard.root, &lv_label_class, "0 von 3 Fotos");
    requireObject(guard.root, &lv_label_class, "Mit dem Handy scannen, um Fotos hinzuzufügen");
    renderer.capture("form-image-german");
    field.imageCount = 2;
    details.updateImageField(field);
    expect(requireObject(guard.root, &lv_label_class, "2 von 3 Fotos") == count, "The count changes in place");
    FirmwareI18n::refreshTree(guard.root, "en");
    expect(requireObject(guard.root, &lv_label_class, "2 of 3 photos") == count, "The count follows the language");
    requireObject(guard.root, &lv_label_class, "Scan with your phone to add photos");
    renderer.capture("form-image-english");
    lv_obj_send_event(lv_obj_get_parent(requireObject(guard.root, &lv_label_class, "Submit")), LV_EVENT_CLICKED, nullptr);
    expect(submissions == 1, "Submitting the image page needs no local count");
    details.resetForm();
}
