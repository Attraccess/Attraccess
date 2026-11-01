#include <lvgl.h>
#include "esp_heap_caps.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static size_t allocated_size;
static uint32_t allocated_caps;
static int allocation_count;

void *heap_caps_malloc(size_t size, uint32_t capabilities)
{
    allocated_size = size;
    allocated_caps = capabilities;
    allocation_count++;
    return malloc(size);
}

// ATT-1187: the live plugin nodes (ui::MAX_LIVE_NODES, passed in from ui_schema.hpp) plus 10 list-row badges must
// fit the 32 KiB reserve (ui_builder.hpp POOL_FLOOR_BYTES). Mirrors ui_builder.cpp: every node is an lv object with
// the local style properties the builder sets. The host is 64-bit, the device 32-bit: the hardware spike measured
// 230-390 B per node on the device, and this host build of the same node mix measures ~490 B, so the device figure
// is host x 0.73 (358 B per node, inside the spike range). That estimate must fit the reserve. The stricter reading
// (host / 0.73) is printed for the record; the lab self-test (UI_MEM max_used) is the final arbiter.
#define PLUGIN_RESERVE_BYTES (32 * 1024)
#ifndef PLUGIN_LIVE_NODES
#define PLUGIN_LIVE_NODES 64
#endif
#define PLUGIN_ROW_BADGES 10

// Local style properties exactly as ui_builder.cpp sets them per node kind.
static void style_container(lv_obj_t *obj)
{
    lv_obj_remove_style_all(obj);
    lv_obj_set_width(obj, LV_SIZE_CONTENT);
    lv_obj_set_height(obj, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(obj, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(obj, 4, LV_PART_MAIN);
    lv_obj_set_style_pad_column(obj, 4, LV_PART_MAIN);
    lv_obj_set_style_pad_all(obj, 6, LV_PART_MAIN);
}

static void style_text(lv_obj_t *label)
{
    lv_label_set_long_mode(label, LV_LABEL_LONG_MODE_WRAP);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_18, LV_PART_MAIN);
    lv_obj_set_style_text_color(label, lv_color_hex(0xF4F8F8), LV_PART_MAIN);
    lv_obj_set_style_max_width(label, lv_pct(100), LV_PART_MAIN);
}

static void style_badge(lv_obj_t *obj)
{
    lv_obj_remove_style_all(obj);
    lv_obj_set_size(obj, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_color(obj, lv_color_hex(0x203C42), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_radius(obj, 6, LV_PART_MAIN);
    lv_obj_set_style_pad_hor(obj, 8, LV_PART_MAIN);
    lv_obj_set_style_pad_ver(obj, 2, LV_PART_MAIN);
}

static size_t build_plugin_slots(lv_obj_t *parent, int nodes)
{
    static const char text80[] = "Reserved by Anna M. - the machine is booked until 16:00 and free again afterwards";
    lv_mem_monitor_t before, after;
    lv_mem_monitor(&before);
    int built = 0;
    while (built < nodes) {
        // One slot: framed root, a row, then mixed leaf nodes (up to 8 per slot like resource.details.body).
        lv_obj_t *frame = lv_obj_create(parent);
        lv_obj_remove_style_all(frame);
        lv_obj_set_width(frame, lv_pct(100));
        lv_obj_set_height(frame, LV_SIZE_CONTENT);
        lv_obj_set_style_bg_color(frame, lv_color_hex(0x1E2C2F), LV_PART_MAIN);
        lv_obj_set_style_bg_opa(frame, LV_OPA_COVER, LV_PART_MAIN);
        lv_obj_set_style_border_color(frame, lv_color_hex(0x42575C), LV_PART_MAIN);
        lv_obj_set_style_border_width(frame, 1, LV_PART_MAIN);
        lv_obj_set_style_radius(frame, 6, LV_PART_MAIN);
        lv_obj_set_style_pad_all(frame, 8, LV_PART_MAIN);
        lv_obj_t *row = lv_obj_create(frame);
        style_container(row);
        built++;
        for (int leaf = 0; leaf < 7 && built < nodes; leaf++, built++) {
            switch (leaf % 4) {
            case 0: { lv_obj_t *l = lv_label_create(row); style_text(l); lv_label_set_text(l, text80); break; }
            case 1: { lv_obj_t *l = lv_label_create(row); style_text(l); lv_label_set_text(l, "14:00 - 16:00"); break; }
            case 2: { lv_obj_t *b = lv_bar_create(row); lv_obj_set_size(b, lv_pct(100), 8); lv_bar_set_value(b, 40, LV_ANIM_OFF);
                      lv_obj_set_style_bg_color(b, lv_color_hex(0x203C42), LV_PART_MAIN); lv_obj_set_style_bg_opa(b, LV_OPA_COVER, LV_PART_MAIN);
                      lv_obj_set_style_bg_color(b, lv_color_hex(0x82C4CE), LV_PART_INDICATOR); lv_obj_set_style_bg_opa(b, LV_OPA_COVER, LV_PART_INDICATOR); break; }
            default: { lv_obj_t *b = lv_obj_create(row); style_badge(b); lv_obj_t *l = lv_label_create(b); lv_obj_set_style_text_font(l, &lv_font_montserrat_14, LV_PART_MAIN); lv_obj_set_style_text_color(l, lv_color_hex(0xF5C578), LV_PART_MAIN); lv_label_set_text(l, "Reserved"); break; }
            }
        }
    }
    lv_mem_monitor(&after);
    return before.free_size - after.free_size;
}

static size_t build_row_badges(lv_obj_t *parent, int count)
{
    lv_mem_monitor_t before, after;
    lv_mem_monitor(&before);
    for (int i = 0; i < count; i++) {
        lv_obj_t *b = lv_obj_create(parent);
        style_badge(b);
        lv_obj_t *l = lv_label_create(b);
        lv_obj_set_style_text_font(l, &lv_font_montserrat_14, LV_PART_MAIN);
        lv_obj_set_style_text_color(l, lv_color_hex(0xF5C578), LV_PART_MAIN);
        lv_label_set_text(l, "Reserved 14:00");
    }
    lv_mem_monitor(&after);
    return before.free_size - after.free_size;
}

static int plugin_ui_pool_check(void)
{
    lv_obj_t *root = lv_obj_create(lv_screen_active());
    const size_t nodes = build_plugin_slots(root, PLUGIN_LIVE_NODES);
    const size_t badges = build_row_badges(root, PLUGIN_ROW_BADGES);
    const size_t device_estimate = (size_t)((double)nodes * 0.73) + badges; // badges stay at host size
    const size_t strict_estimate = (size_t)((double)nodes / 0.73) + badges;
    printf("INFO: %d plugin nodes use %zu host bytes (device estimate %zu, %zu per node), %d row badges %zu bytes; "
           "total %zu of %d reserve (strict host/0.73 reading: %zu)\n",
           PLUGIN_LIVE_NODES, nodes, (size_t)((double)nodes * 0.73), (size_t)((double)nodes * 0.73) / PLUGIN_LIVE_NODES,
           PLUGIN_ROW_BADGES, badges, device_estimate, PLUGIN_RESERVE_BYTES, strict_estimate);
    if (lv_mem_test() != LV_RESULT_OK) {
        fprintf(stderr, "FAIL: LVGL pool corrupted by plugin UI nodes\n");
        return 1;
    }
    lv_obj_delete(root);
    if (device_estimate > PLUGIN_RESERVE_BYTES) {
        fprintf(stderr, "FAIL: %d plugin nodes plus 10 badges need %zu bytes, reserve is %d; lower the cap in the SDK, "
                "ui_schema.hpp and the docs together\n", PLUGIN_LIVE_NODES, device_estimate, PLUGIN_RESERVE_BYTES);
        return 1;
    }
    return 0;
}

int main(void)
{
    lv_init();
    if (allocation_count != 1 || allocated_size != LV_MEM_SIZE ||
        allocated_caps != (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)) {
        fprintf(stderr, "FAIL: LVGL must reserve its %u-byte pool in PSRAM; allocations=%d size=%zu caps=%u\n",
                LV_MEM_SIZE, allocation_count, allocated_size, allocated_caps);
        return 1;
    }
    // Exercise the real TLSF pool, including freeing and reusing allocations.
    lv_display_create(480, 480);
    for (int pass = 0; pass < 3; pass++) {
        lv_obj_t *screen = lv_obj_create(lv_screen_active());
        for (int i = 0; i < 100; i++) {
            lv_obj_t *label = lv_label_create(screen);
            lv_label_set_text(label, "OTA firmware update");
        }
        lv_obj_delete(screen);
    }
    if (lv_mem_test() != LV_RESULT_OK) {
        fprintf(stderr, "FAIL: LVGL memory pool integrity check\n");
        return 1;
    }

    // Enrollment QR (ATT-1170): create once, update on every 30 s rotation, delete with the screen.
    lv_mem_monitor_t before;
    lv_mem_monitor(&before);
    // An 80-character and a ~200-character https enrollment link.
    static const char prefix[] = "https://attraccess.example.org/?enroll=";
    char short_url[81];
    char long_url[201];
    memset(short_url, 'a', sizeof short_url - 1);
    memcpy(short_url, prefix, sizeof prefix - 1);
    short_url[80] = '\0';
    memset(long_url, 'a', sizeof long_url - 1);
    memcpy(long_url, prefix, sizeof prefix - 1);
    long_url[200] = '\0';
    for (int round = 0; round < 3; round++) {
        lv_obj_t *card = lv_obj_create(lv_screen_active());
        lv_obj_t *qr = lv_qrcode_create(card);
        lv_qrcode_set_size(qr, 184);
        lv_qrcode_set_dark_color(qr, lv_color_black());
        lv_qrcode_set_light_color(qr, lv_color_white());
        for (int update = 0; update < 50; update++) {
            const char *url = (update % 2) ? long_url : short_url;
            if (lv_qrcode_update(qr, url, strlen(url)) != LV_RESULT_OK) {
                fprintf(stderr, "FAIL: QR update %d of round %d failed\n", update, round);
                return 1;
            }
            lv_refr_now(NULL);
            if (round == 0 && update == 1) {
                lv_mem_monitor_t with_qr;
                lv_mem_monitor(&with_qr);
                printf("INFO: one live QR object (184 px canvas, updated in place) holds %zu bytes of the LVGL pool\n",
                       (size_t)(before.free_size - with_qr.free_size));
            }
        }
        // A payload that cannot fit is rejected without touching the pool.
        char too_long[8000];
        memset(too_long, 'x', sizeof too_long);
        if (lv_qrcode_update(qr, too_long, sizeof too_long) == LV_RESULT_OK) {
            fprintf(stderr, "FAIL: a too-long QR payload was accepted\n");
            return 1;
        }
        if (lv_mem_test() != LV_RESULT_OK) {
            fprintf(stderr, "FAIL: LVGL pool corrupted by QR updates (round %d)\n", round);
            return 1;
        }
        lv_obj_delete(card);
    }
    lv_mem_monitor_t after;
    lv_mem_monitor(&after);
    if (lv_mem_test() != LV_RESULT_OK) {
        fprintf(stderr, "FAIL: LVGL memory pool integrity check after QR cycles\n");
        return 1;
    }
    if (after.free_size + 1024U < before.free_size) {
        fprintf(stderr, "FAIL: QR cycles leaked pool memory: free %zu -> %zu\n", (size_t)before.free_size, (size_t)after.free_size);
        return 1;
    }
    if (plugin_ui_pool_check() != 0) return 1;
    puts("PASS: production LVGL uses PSRAM and reuses its pool without corruption");
    return 0;
}
