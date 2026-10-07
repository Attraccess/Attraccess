#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <string.h>
#include "resourceDetailsCopy.hpp"

void ResourceDetailsScreen::updateFormBreadcrumb()
{
   std::string pageTitle = "Bitte Formular ausfüllen";
   std::string resourceName = "";

   if (this->formsModalMeta)
   {
      if (this->formsModalMeta->action == API::ResourceUsageFormActionType::START)
      {
         pageTitle = "Bitte vor dem Start ausfüllen";
      }
      else if (this->formsModalMeta->action == API::ResourceUsageFormActionType::END)
      {
         pageTitle = "Bitte vor dem Ende ausfüllen";
      }
      else if (this->formsModalMeta->action == API::ResourceUsageFormActionType::TAKEOVER)
      {
         pageTitle = "Bitte vor der Übernahme ausfüllen";
      }

      if (this->formsModalMeta->resourceName.length() > 0)
      {
         resourceName = this->formsModalMeta->resourceName;
      }
   }

   std::string formName = "";
   if (this->formsModalMeta)
   {
      for (uint8_t i = 0; i < this->formsModalMeta->formCount && i < API::MAX_FORMS_PER_REQUEST; ++i)
      {
         if (this->formsModalMeta->forms[i].id == this->formsModalPage->formId)
         {
            formName = this->formsModalMeta->forms[i].name;
            break;
         }
      }
   }

   // Compact breadcrumb instead of three stacked headers: action context on the
   // first line, resource + form scope on the second.
   if (this->formsBreadcrumbLabel)
   {
      std::string breadcrumb = pageTitle;
      std::string scope = resourceName;
      if (formName.length() > 0)
      {
         if (scope.length() > 0)
         {
            scope += " - ";
         }
         scope += formName;
      }
      if (scope.length() > 0)
      {
         breadcrumb += "\n" + scope;
      }
      lv_label_set_text(this->formsBreadcrumbLabel, breadcrumb.c_str());
   }

}
