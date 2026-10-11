#include <lvgl.h>
#include "esp_heap_caps.h"
#include <stdio.h>
#include <stdlib.h>

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
    puts("PASS: production LVGL uses PSRAM and reuses its pool without corruption");
    return 0;
}
