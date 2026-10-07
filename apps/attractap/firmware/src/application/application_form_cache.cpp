// Resource usage form flow: paging cursor, field rendering, page submission
// FEATURE: application-form-flow

#include "application.hpp"
#include <string>

#ifdef HAS_LVGL_DISPLAY
Application::FormPageCacheEntry *Application::findFormPageCache(uint32_t formId,
                                                               uint32_t offset) {
  for (uint8_t i = 0; i < FORM_PAGE_CACHE_SIZE; ++i) {
    FormPageCacheEntry &entry = this->formPageCache[i];
    if (entry.valid && entry.formId == formId && entry.offset == offset) {
      entry.lru = ++this->formCacheTick;
      return &entry;
    }
  }
  return nullptr;
}

Application::FormPageCacheEntry *
Application::storeFormPageCache(const API::ResourceUsageFormFieldsPage &page) {
  FormPageCacheEntry *slot = this->findFormPageCache(page.formId, page.offset);
  if (!slot) {
    // Reuse an empty slot, else evict the least-recently-used entry.
    slot = &this->formPageCache[0];
    for (uint8_t i = 0; i < FORM_PAGE_CACHE_SIZE; ++i) {
      if (!this->formPageCache[i].valid) {
        slot = &this->formPageCache[i];
        break;
      }
      if (this->formPageCache[i].lru < slot->lru) {
        slot = &this->formPageCache[i];
      }
    }
  }
  slot->valid = true;
  slot->formId = page.formId;
  slot->offset = page.offset;
  slot->lru = ++this->formCacheTick;
  slot->page = page;
  return slot;
}

void Application::invalidateFormPageCache(uint32_t formId, uint32_t offset) {
  for (uint8_t i = 0; i < FORM_PAGE_CACHE_SIZE; ++i) {
    FormPageCacheEntry &entry = this->formPageCache[i];
    if (entry.valid && entry.formId == formId && entry.offset == offset) {
      entry.valid = false;
    }
  }
}

void Application::clearFormPageCache() {
  for (uint8_t i = 0; i < FORM_PAGE_CACHE_SIZE; ++i) {
    this->formPageCache[i].valid = false;
  }
  this->formCacheTick = 0;
}

void Application::renderFormFieldPage(
    const API::ResourceUsageFormFieldsPage &page) {
  bool canGoBack = this->globalFormFieldNumber() > 1;
  Display::resourceDetailsScreen.renderFormField(
      page, canGoBack, this->isLastFormField(), this->globalFormFieldNumber(),
      this->totalFormFields());
}

bool Application::computeNextFormCursor(uint8_t &formIdx,
                                        uint32_t &offset) const {
  formIdx = this->formCursorFormIdx;
  offset = this->formCursorOffset + API::MAX_FORM_PAGE_FIELDS;
  if (formIdx < this->pendingFormRequest.formCount &&
      offset >= this->pendingFormRequest.forms[formIdx].fieldCount) {
    formIdx++;
    offset = 0;
  }
  while (formIdx < this->pendingFormRequest.formCount &&
         this->pendingFormRequest.forms[formIdx].fieldCount == 0) {
    formIdx++;
    offset = 0;
  }
  return formIdx < this->pendingFormRequest.formCount;
}

void Application::prefetchNextFormField() {
  if (!this->hasPendingFormRequest) {
    return;
  }
  // Never issue a prefetch while the current field's GET is still outstanding —
  // a second in-flight request could overwrite the shared scratch buffer and the
  // awaited render would be lost.
  if (this->awaitingFieldRender) {
    return;
  }
  uint8_t nextFormIdx = 0;
  uint32_t nextOffset = 0;
  if (!this->computeNextFormCursor(nextFormIdx, nextOffset)) {
    return; // current field is the last one
  }
  uint32_t formId = this->pendingFormRequest.forms[nextFormIdx].id;
  if (this->findFormPageCache(formId, nextOffset)) {
    return; // already cached
  }
  this->api.requestFormFields(this->pendingFormRequest.resourceId,
                              this->pendingFormRequest.action, formId, nextOffset,
                              API::MAX_FORM_PAGE_FIELDS);
}
#endif
