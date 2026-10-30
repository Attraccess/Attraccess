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
        lv_qrcode_set_size(qr, 190);
        lv_qrcode_set_dark_color(qr, lv_color_black());
        lv_qrcode_set_light_color(qr, lv_color_white());
        for (int update = 0; update < 50; update++) {
            const char *url = (update % 2) ? long_url : short_url;
            if (lv_qrcode_update(qr, url, strlen(url)) != LV_RESULT_OK) {
                fprintf(stderr, "FAIL: QR update %d of round %d failed\n", update, round);
                return 1;
            }
            lv_refr_now(NULL);
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
    puts("PASS: production LVGL uses PSRAM and reuses its pool without corruption");
    return 0;
}
