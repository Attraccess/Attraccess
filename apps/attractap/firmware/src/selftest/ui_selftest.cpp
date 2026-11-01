// FEATURE: ui-selftest
#ifdef ATTRACTAP_UI_SELFTEST

#include "ui_selftest.hpp"

#include <ArduinoJson.h>

#include <string>

#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "../api/api.hpp"
#include "../display/display.hpp"
#include "../display/theme.hpp"
#include "../display/ui/ui_builder.hpp"
#include "../display/ui/ui_slots.hpp"
#include "../logger/logger.hpp"
#include "../state/state.hpp"

namespace UiSelftest
{
    namespace
    {
        Logger logger("UiSelftest");
        API *g_api = nullptr;

        std::string slot(int resource, const char *slotId, unsigned revision, const std::string &tree, const char *key)
        {
            return "{\"event\":\"EVENT\",\"data\":{\"type\":\"UI_SLOT_UPDATE\",\"messageId\":" + std::to_string(revision) +
                   ",\"payload\":{\"resourceId\":" + std::to_string(resource) + ",\"slot\":\"" + slotId + "\",\"revision\":" +
                   std::to_string(revision) + ",\"owner\":\"selftest\",\"key\":\"" + key +
                   "\",\"serverNowMs\":1000000,\"tree\":" + tree + "}}}";
        }

        std::string leafRow(int n)
        {
            std::string children;
            for (int i = 0; i < n; i++)
            {
                if (i) children += ",";
                children += i % 3 == 0   ? "{\"t\":\"text\",\"text\":\"Reserved by Anna M. until 16:00, then free again\"}"
                            : i % 3 == 1 ? "{\"t\":\"badge\",\"text\":\"Reserved\",\"tone\":\"warning\"}"
                                         : "{\"t\":\"progress\",\"value\":40}";
            }
            return "{\"t\":\"col\",\"c\":[" + children + "]}";
        }

        std::string deepTree(int levels)
        {
            std::string t = "{\"t\":\"text\",\"text\":\"x\"}";
            for (int i = 1; i < levels; i++) t = "{\"t\":\"col\",\"c\":[" + t + "]}";
            return t;
        }

        void inject(const std::string &json)
        {
            g_api->testInject(json.c_str(), json.size());
        }

        // Stack the task kept free at its lowest, in bytes (0 when the task is unknown).
        uint32_t stackFree(const char *name)
        {
            TaskHandle_t handle = xTaskGetHandle(name);
            return handle ? uxTaskGetStackHighWaterMark(handle) * sizeof(StackType_t) : 0;
        }

        void printStack(const char *tag)
        {
            logger.infof("%s lvgl_free_min=%u lvgl_size=12288 dispatch_free_min=%u dispatch_size=16384 tls_free_min=%u", tag,
                         (unsigned)stackFree("LvglTask"), (unsigned)stackFree("main"), (unsigned)stackFree("rl_tls"));
        }

        void printMem()
        {
            lv_lock();
            lv_mem_monitor_t m;
            lv_mem_monitor(&m);
            lv_unlock();
            logger.infof("UI_MEM total=%u used=%u max_used=%u free_biggest=%u frag=%u", (unsigned)m.total_size,
                         (unsigned)(m.total_size - m.free_size), (unsigned)m.max_used, (unsigned)m.free_biggest_size,
                         (unsigned)m.frag_pct);
        }

        void run(void *)
        {
            // Wait for Wi-Fi and the authenticated reader session so the inbound path is the real one.
            while (!State::getApiState().authenticated) vTaskDelay(pdMS_TO_TICKS(500));
            vTaskDelay(pdMS_TO_TICKS(5000));
            logger.info("UI_SELFTEST start");
            printStack("UI_STACK_BASE");

            // Fill every slot on three resources: 3 x (6 + 8 + 6) = 60 live nodes, plus ten row badges.
            const unsigned before = (unsigned)ui::slotCache().count();
            for (int r = 1; r <= 3; r++)
            {
                inject(slot(r, "resource.details.header", 1, leafRow(5), "hdr"));
                inject(slot(r, "resource.details.body", 1, leafRow(7), "body"));
                inject(slot(r, "resource.details.session", 1, leafRow(5), "sess"));
            }
            for (int r = 1; r <= 10; r++)
                inject(slot(r, "resourceList.row.status", 1, "{\"t\":\"badge\",\"text\":\"Reserved 14:00\",\"tone\":\"warning\"}", "row"));
            vTaskDelay(pdMS_TO_TICKS(2000));
            const unsigned filled = (unsigned)ui::slotCache().count();
            logger.infof("UI_FILL contributions=%u live_nodes=%d", filled - before, ui::slotCache().liveNodes());

            // Resource details with full slots; measure the screen init with all contributions (async-split above ~25 ms).
            API::ResourceBrief resource{};
            resource.id = 1;
            resource.isHealthy = true;
            strncpy(resource.name, "Selftest", sizeof(resource.name) - 1);
            lv_lock();
            Display::resourceDetailsScreen.setResourceAndUsageDetails(resource);
            const int64_t t0 = esp_timer_get_time();
            Display::transitionToScreen(&Display::resourceDetailsScreen);
            lv_unlock();
            vTaskDelay(pdMS_TO_TICKS(1500));
            lv_lock();
            const int64_t t1 = esp_timer_get_time();
            Display::resourceDetailsScreen.refreshUiSlots();
            const int64_t t2 = esp_timer_get_time();
            lv_unlock();
            logger.infof("UI_DETAILS_INIT us=%d", (int)(t2 - t1));
            (void)t0;

            // One 8-node contribution built inside the lock.
            lv_lock();
            ui::SlotRecord *rec = ui::allocRecord();
            JsonDocument doc;
            deserializeJson(doc, "{\"resourceId\":9,\"slot\":\"resource.details.body\",\"revision\":1,\"owner\":\"s\",\"key\":\"b\","
                                 "\"serverNowMs\":1,\"tree\":" + leafRow(7) + "}");
            if (rec && ui::parseSlotUpdate(doc.as<JsonObjectConst>(), measureJson(doc), *rec) == ui::Verdict::Accept)
            {
                lv_obj_t *holder = lv_obj_create(lv_layer_top());
                const int64_t b0 = esp_timer_get_time();
                lv_obj_t *built = ui::buildRecord(holder, *rec, millis(), true);
                const int64_t b1 = esp_timer_get_time();
                logger.infof("UI_BUILD nodes=%d us=%d", built ? rec->nodeCount : 0, (int)(b1 - b0));
                lv_obj_delete(holder);
            }
            ui::freeRecord(rec);
            lv_unlock();

            // A step open over details, plus the forms keyboard.
            ui::StepRequest step;
            step.stepId = "selftestselftestselfte";
            step.title = "Reserviert ab 14:00";
            step.body = "Sie haben noch 40 Minuten. Trotzdem starten?";
            step.serverNowMs = 1;
            step.expiresAtMs = 600001;
            step.countdownToMs = 2400001;
            step.receivedAtMillis = millis();
            lv_lock();
            Display::stepModal.show(step, millis());
            lv_obj_t *keyboard = lv_keyboard_create(lv_layer_top());
            DisplayTheme::keyboard(keyboard);
            lv_unlock();
            vTaskDelay(pdMS_TO_TICKS(1500));
            printMem();
            lv_lock();
            lv_obj_delete(keyboard);
            Display::stepModal.hide();
            lv_unlock();

            // Hostile payloads: each must only be dropped.
            const unsigned beforeHostile = (unsigned)ui::slotCache().count();
            unsigned hostile = 0;
            inject(slot(4, "resource.details.body", 1, deepTree(7), "deep")); hostile++;
            inject(slot(4, "resource.details.body", 2, "{\"t\":\"image\",\"src\":\"x\"}", "unknown")); hostile++;
            inject(slot(4, "resource.details.body", 3, "\"garbage\"", "garbage")); hostile++;
            inject(slot(4, "resource.details.header", 4, "{\"t\":\"text\",\"text\":\"" + std::string(5000, 'y') + "\"}", "huge")); hostile++;
            inject(slot(4, "resource.details.header", 5, "{\"t\":\"text\",\"text\":\"Maintenance\"}", "spoof")); hostile++;
            vTaskDelay(pdMS_TO_TICKS(1500));
            const unsigned dropped = hostile - ((unsigned)ui::slotCache().count() - beforeHostile);

            // Pool exhaustion: keep building 8-node blocks until the pre-check refuses; nothing may hang or assert.
            lv_lock();
            lv_obj_t *holder = lv_obj_create(lv_layer_top());
            ui::SlotRecord *big = ui::allocRecord();
            JsonDocument bigDoc;
            deserializeJson(bigDoc, "{\"resourceId\":9,\"slot\":\"resource.details.body\",\"revision\":1,\"owner\":\"s\",\"key\":\"b\","
                                    "\"serverNowMs\":1,\"tree\":" + leafRow(7) + "}");
            unsigned refused = 0, built = 0;
            if (big && ui::parseSlotUpdate(bigDoc.as<JsonObjectConst>(), measureJson(bigDoc), *big) == ui::Verdict::Accept)
            {
                for (int i = 0; i < 400 && refused == 0; i++)
                {
                    if (ui::buildRecord(holder, *big, millis(), true)) built++;
                    else refused++;
                }
            }
            ui::freeRecord(big);
            lv_obj_delete(holder);
            lv_unlock();
            logger.infof("UI_EXHAUST built=%u refused=%u", built, refused);
            vTaskDelay(pdMS_TO_TICKS(1000));

            printMem();
            printStack("UI_STACK");
            logger.infof("UI_HEAP int_min=%u", (unsigned)heap_caps_get_minimum_free_size(MALLOC_CAP_INTERNAL));
            logger.infof("UI_SELFTEST done dropped=%u expected_dropped=%u", dropped, hostile);
            vTaskDelete(nullptr);
        }
    }

    void start(API &api)
    {
        g_api = &api;
        xTaskCreatePinnedToCore(run, "ui_selftest", 6144, nullptr, 3, nullptr, 0);
    }
}
#endif
