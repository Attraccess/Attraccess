#include "resourceListScreen.hpp"

void ResourceListScreen::init()
{
   this->screen = lv_obj_create(NULL);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_bg_image_src(this->screen, &lockscreen_background_image, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_left(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(this->screen, 20, LV_PART_MAIN | LV_STATE_DEFAULT);
}

void ResourceListScreen::setResourceList(JsonArray resourceList)
{
   // first, remove all existing resource list items
   lv_obj_t *resourceContainer = lv_obj_get_child(this->screen, 0);
   while (resourceContainer)
   {
      lv_obj_del(resourceContainer);
      resourceContainer = lv_obj_get_child(this->screen, 0);
   }

   this->resourceIdToEvent.clear();

   for (JsonObject resource : resourceList)
   {
      this->addResourceListItem(resource);
   }
}

void ResourceListScreen::addResourceListItem(JsonObject resource)
{
   lv_obj_t *resourceContainer = lv_obj_create(this->screen);
   lv_obj_remove_style_all(resourceContainer);
   lv_obj_set_width(resourceContainer, lv_pct(100));
   lv_obj_set_height(resourceContainer, LV_SIZE_CONTENT);
   lv_obj_set_x(resourceContainer, -103);
   lv_obj_set_y(resourceContainer, -153);
   lv_obj_set_align(resourceContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(resourceContainer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(resourceContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
   lv_obj_add_flag(resourceContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(resourceContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_radius(resourceContainer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(resourceContainer, lv_color_hex(0x2971CD), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(resourceContainer, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_left(resourceContainer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(resourceContainer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(resourceContainer, 5, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(resourceContainer, 5, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_row(resourceContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(resourceContainer, 20, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Prepare event data with a persistent copy of the resource
   // Copy resource into an independent JsonDocument to persist with the LVGL object
   JsonDocument *doc = new JsonDocument();
   doc->to<JsonObject>().set(resource);
   ResourceEventData *evt = new ResourceEventData{this, resourceContainer, doc};
   lv_obj_add_event_cb(resourceContainer, &ResourceListScreen::onResourceClicked, LV_EVENT_CLICKED, evt);
   lv_obj_add_event_cb(resourceContainer, &ResourceListScreen::onResourceClicked, LV_EVENT_DELETE, evt);

   lv_obj_t *thumbnailImage = lv_image_create(resourceContainer);
   lv_obj_set_style_border_width(thumbnailImage, 1, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(thumbnailImage, LV_OBJ_FLAG_EVENT_BUBBLE);
   lv_obj_set_width(thumbnailImage, 48);
   lv_obj_set_height(thumbnailImage, 48);

   // debug visuals
   lv_obj_set_style_border_width(thumbnailImage, 1, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_border_color(thumbnailImage, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);

   // store pointers for later update/cleanup
   evt->thumbnailImage = thumbnailImage;
   evt->imgDesc = nullptr;

   // ensure cleanup of allocated image buffers
   lv_obj_add_event_cb(resourceContainer, &ResourceListScreen::onContainerDelete, LV_EVENT_DELETE, evt);

   // index by resource id for later image update and set known image for first row
   if (resource["id"].is<uint32_t>())
   {
      uint32_t rid = resource["id"].as<uint32_t>();
      this->resourceIdToEvent[rid] = evt;
   }

   // Keep test logo until network image arrives; removed once we set a real image

   lv_obj_t *resourceLabelContainer = lv_obj_create(resourceContainer);
   lv_obj_remove_style_all(resourceLabelContainer);
   lv_obj_set_width(resourceLabelContainer, LV_SIZE_CONTENT);
   lv_obj_set_height(resourceLabelContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(resourceLabelContainer, LV_ALIGN_CENTER);
   lv_obj_set_flex_flow(resourceLabelContainer, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(resourceLabelContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(resourceLabelContainer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(resourceLabelContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_add_flag(resourceLabelContainer, LV_OBJ_FLAG_EVENT_BUBBLE);

   lv_obj_t *resourceNameLabel = lv_label_create(resourceLabelContainer);
   lv_obj_set_width(resourceNameLabel, LV_SIZE_CONTENT);
   lv_obj_set_height(resourceNameLabel, LV_SIZE_CONTENT);
   lv_obj_set_align(resourceNameLabel, LV_ALIGN_CENTER);
   lv_label_set_text(resourceNameLabel, resource["name"].as<String>().c_str());
   lv_obj_remove_flag(resourceNameLabel, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_text_font(resourceNameLabel, &lv_font_montserrat_24, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_min_width(resourceNameLabel, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_max_width(resourceNameLabel, 300, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *resourceDescriptionContainer = lv_label_create(resourceLabelContainer);
   lv_obj_set_height(resourceDescriptionContainer, 14);
   lv_obj_set_width(resourceDescriptionContainer, LV_SIZE_CONTENT);
   lv_obj_set_align(resourceDescriptionContainer, LV_ALIGN_CENTER);
   lv_label_set_text(resourceDescriptionContainer, resource["description"].as<String>().c_str());
   lv_obj_remove_flag(resourceDescriptionContainer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_style_text_font(resourceDescriptionContainer, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_min_width(resourceDescriptionContainer, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_max_width(resourceDescriptionContainer, 300, LV_PART_MAIN | LV_STATE_DEFAULT);
}

void ResourceListScreen::setNoResourcesMessage()
{
   lv_obj_t *noResourcesMessage = lv_label_create(this->screen);
   lv_obj_set_width(noResourcesMessage, lv_pct(100));
   lv_obj_set_height(noResourcesMessage, LV_SIZE_CONTENT);
   lv_obj_set_align(noResourcesMessage, LV_ALIGN_CENTER);
   lv_label_set_text(noResourcesMessage, "Keine Ressourcen mit diesem Reader verknuepft, bitte konfigurieren Sie den Reader in der Attraccess Administration");
   lv_obj_set_style_text_font(noResourcesMessage, &lv_font_montserrat_26, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(noResourcesMessage, lv_color_hex(0xff0000), LV_PART_MAIN | LV_STATE_DEFAULT);
}

lv_obj_t *ResourceListScreen::getScreen()
{
   return this->screen;
}

void ResourceListScreen::loop()
{
   // nothing to do
}

void ResourceListScreen::setResourceSelectionCallback(std::function<void(JsonObject)> callback)
{
   this->resourceSelectionCallback = callback;
}

void ResourceListScreen::onResourceClicked(lv_event_t *e)
{
   ResourceEventData *evt = static_cast<ResourceEventData *>(lv_event_get_user_data(e));
   if (!evt)
      return;
   lv_event_code_t code = lv_event_get_code(e);

   if (code == LV_EVENT_CLICKED)
   {
      if (!evt->self || !evt->doc)
         return;

      if (evt->self->resourceSelectionCallback)
      {
         JsonObject res = evt->doc->as<JsonObject>();
         evt->self->logger.infof("Resource selected: %s", res["name"].as<String>().c_str());
         evt->self->resourceSelectionCallback(res);
      }
   }
   else if (code == LV_EVENT_DELETE)
   {
      // handled in onContainerDelete to clean image first
   }
}

void ResourceListScreen::onContainerDelete(lv_event_t *e)
{
   ResourceEventData *evt = static_cast<ResourceEventData *>(lv_event_get_user_data(e));
   if (!evt)
      return;
   // free dynamic image descriptor and its data if any
   if (evt->imgDesc)
   {
      if (evt->imgDesc->data)
      {
         free((void *)evt->imgDesc->data);
      }
      free(evt->imgDesc);
      evt->imgDesc = nullptr;
   }
   if (evt->doc)
   {
      delete evt->doc;
      evt->doc = nullptr;
   }
   delete evt;
}

void ResourceListScreen::setResourceImage(uint32_t resourceId, uint16_t w, uint16_t h, const uint8_t *data, size_t len)
{
   // Ensure UI update happens on LVGL thread; copy buffer now and schedule async
   size_t sz = len;
   uint8_t *owned = (uint8_t *)malloc(sz);
   if (!owned)
      return;
   memcpy(owned, data, sz);

   bool exists = this->resourceIdToEvent.find(resourceId) != this->resourceIdToEvent.end();
   this->logger.infof("setResourceImage for resource %u (exists=%s)", resourceId, exists ? "true" : "false");

   auto it = this->resourceIdToEvent.find(resourceId);
   if (it == this->resourceIdToEvent.end())
   {
      this->logger.errorf("No container for resource %u found when setting image", resourceId);
      free(owned);
      return;
   }

   this->logger.infof("Found container for resource %u", resourceId);

   ResourceEventData *evt = it->second;
   if (!evt || !evt->thumbnailImage)
   {
      this->logger.errorf("Container for resource %u has no thumbnailImage", resourceId);
      free(owned);
      return;
   }

   this->logger.debugf("Setting image for resource %u", resourceId);

   // Free previous image if exists
   if (evt->imgDesc)
   {
      this->logger.debugf("Freeing previous image for resource %u", resourceId);
      if (evt->imgDesc->data)
      {
         this->logger.debugf("Freeing previous image data for resource %u", resourceId);
         free((void *)evt->imgDesc->data);
      }
      free(evt->imgDesc);
      evt->imgDesc = nullptr;
   }

   this->logger.debugf("Allocating new image descriptor for resource %u", resourceId);
   lv_image_dsc_t *img_dsc = (lv_image_dsc_t *)malloc(sizeof(lv_image_dsc_t));
   if (!img_dsc)
   {
      this->logger.errorf("Failed to allocate new image descriptor for resource %u", resourceId);
      free(owned);
      return;
   }

   this->logger.debugf("Setting image descriptor for resource %u", resourceId);

   img_dsc->header.cf = LV_COLOR_FORMAT_NATIVE;
   img_dsc->header.magic = LV_IMAGE_HEADER_MAGIC;
   img_dsc->header.w = w;
   img_dsc->header.h = h;
   img_dsc->data_size = w * h * 2;
   img_dsc->data = (uint8_t *)malloc(w * h * 2);
   memcpy((void *)img_dsc->data, owned, w * h * 2);

   this->logger.debugf("Setting image descriptor for resource %u", resourceId);
   evt->imgDesc = img_dsc;
   this->logger.debugf("Setting image for resource %u", resourceId);
   lv_image_set_src(evt->thumbnailImage, img_dsc);
   this->logger.debugf("Setting image for resource %u", resourceId);

   // Debug a few pixels
   if (sz >= 8)
   {
      uint16_t p0 = ((uint16_t *)owned)[0];
      uint16_t p1 = ((uint16_t *)owned)[1];
      this->logger.debugf("First pixels: 0x%04X 0x%04X", p0, p1);
   }

   lv_obj_update_layout(evt->thumbnailImage);
   this->logger.debugf("Updated layout for resource %u (%ux%u)", resourceId, w, h);

   free(owned); // buffer kept by imgDesc

   this->logger.debugf("Finished setting image for resource %u", resourceId);
}

String ResourceListScreen::getName()
{
   return "ResourceListScreen";
}