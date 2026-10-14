// Run the real embedded OTA state machine with controlled flash and time.
#include "api/ota/ota_updater.hpp"
#include "esp_app_format.h"
#include "freertos/task.h"
#include <array>
#include <iostream>
#include <stdexcept>
#include <vector>

static void require(bool condition, const char *message)
{
    if (!condition) throw std::runtime_error(message);
}

struct Device
{
    uint32_t now = 10000;
    bool nfcSuspended = false;
    bool failPreparation = false;
    bool hasPartition = true;
    unsigned preparations = 0;
    unsigned reboots = 0;
    unsigned completedImages = 0;
    unsigned bootSelections = 0;
    size_t written = 0;
} *device;

int64_t esp_timer_get_time() { return int64_t(device->now) * 1000; }
void vTaskDelay(TickType_t ms) { device->now += ms; }
void esp_restart() { ++device->reboots; }
const char *esp_err_to_name(esp_err_t error) { return error == ESP_OK ? "ESP_OK" : "ESP_FAIL"; }
const esp_partition_t *esp_ota_get_next_update_partition(const esp_partition_t *)
{
    static const esp_partition_t partition;
    return device->hasPartition ? &partition : nullptr;
}
esp_err_t esp_ota_begin(const esp_partition_t *, size_t, esp_ota_handle_t *handle)
{
    require(device->nfcSuspended, "flash preparation began while NFC was active");
    ++device->preparations;
    if (device->failPreparation) return ESP_FAIL;
    *handle = 1;
    return ESP_OK;
}
esp_err_t esp_ota_write(esp_ota_handle_t, const void *, size_t length)
{
    require(device->nfcSuspended, "NFC restarted before the image was written");
    device->written += length;
    return ESP_OK;
}
esp_err_t esp_ota_abort(esp_ota_handle_t) { return ESP_OK; }
esp_err_t esp_ota_end(esp_ota_handle_t) { ++device->completedImages; return ESP_OK; }
esp_err_t esp_ota_set_boot_partition(const esp_partition_t *) { ++device->bootSelections; return ESP_OK; }

Logger::Logger(const char *name) : name(name) {}
void Logger::error(const char *) {}
void Logger::errorf(const char *, ...) {}

struct Fixture
{
    Device state;
    Logger logger{"OTA test"};
    unsigned suspensions = 0;
    std::vector<uint32_t> requestedOffsets;
    std::vector<int> progress;
    std::string failure;
    std::function<void(int)> onProgress = [&](int value) { progress.push_back(value); };
    std::function<void(std::string)> onMeta = [&](std::string version) {
        require(version == "next", "wrong firmware version passed to the application");
        state.nfcSuspended = true;
        ++suspensions;
    };
    std::function<void(const char *, const char *)> onError = [&](const char *, const char *reason) { failure = reason; };
    OtaUpdater updater{logger, [&](const char *type, JsonObject payload) {
        require(std::string(type) == "FIRMWARE_REQUEST_CHUNK", "unexpected OTA event");
        require(state.nfcSuspended, "chunk requested while NFC was active");
        requestedOffsets.push_back(payload["offset"].as<uint32_t>());
        return true;
    }, [](const char *) {}, onProgress, onMeta, onError};
    JsonDocument metadata;

    Fixture()
    {
        device = &state;
        metadata["version"] = "next";
        metadata["totalSize"] = uint32_t(8192);
    }
    void begin() { updater.begin(metadata.as<JsonObject>()); }
    void chunk()
    {
        std::array<char, 4096> image{};
        image[0] = char(ESP_IMAGE_HEADER_MAGIC);
        updater.onChunk({image.data(), int(image.size()), int(image.size()), 0});
    }
};

static void beforeFlash()
{
    Fixture f;
    f.begin();
    require(f.suspensions == 1 && f.state.preparations == 1, "OTA did not suspend NFC and prepare flash");
    require(f.progress == std::vector<int>{0}, "initial update progress was not published");
    f.updater.tick();
    require(f.requestedOffsets == std::vector<uint32_t>{0}, "first chunk did not start at zero");
}

static void preparationFailure()
{
    Fixture f;
    f.state.failPreparation = true;
    f.begin();
    require(f.failure.find("esp_ota_begin failed") != std::string::npos, "flash failure did not reach the application");
    require(f.updater.inProgress() && f.state.nfcSuspended, "failed preparation left the OTA suspension lifecycle");
    f.updater.tick();
    require(f.state.reboots == 0, "failure rebooted before displaying the error");
    f.state.now += 3001;
    f.updater.tick();
    require(f.state.reboots == 1, "failed flash preparation stranded a suspended reader without rebooting");
    require(f.requestedOffsets.empty(), "failed flash preparation requested firmware data");
}

static void resume()
{
    Fixture f;
    f.begin();
    f.updater.tick();
    f.chunk();
    // Re-authentication after a socket loss re-offers the same image.
    f.begin();
    require(f.state.preparations == 1 && f.suspensions == 1, "resume restarted preparation instead of preserving the update");
    f.updater.tick();
    require(f.requestedOffsets == std::vector<uint32_t>({0, 4096}), "reconnected update did not resume at the written offset");
    f.chunk();
    require(f.state.written == 8192 && f.state.completedImages == 1, "resumed image was not completed");
    require(f.state.bootSelections == 1 && f.state.reboots == 1, "completed image was not selected and rebooted");
    require(f.progress.back() == 100 && f.failure.empty(), "resumed update failed to reach 100%");
}

static void invalidOffer()
{
    Fixture f;
    f.metadata["totalSize"] = uint32_t(0);
    f.begin();
    require(!f.updater.inProgress() && f.suspensions == 0, "invalid metadata suspended normal card operation");
    f.metadata["totalSize"] = uint32_t(8192);
    f.state.hasPartition = false;
    f.begin();
    require(!f.updater.inProgress() && f.suspensions == 0, "missing partition suspended normal card operation");
    require(f.state.preparations == 0 && f.requestedOffsets.empty(), "invalid offer started an update");
}

int main(int argc, char **argv)
{
    try
    {
        require(argc == 2, "expected a lifecycle scenario");
        const std::string scenario = argv[1];
        if (scenario == "nfc-before-flash") beforeFlash();
        else if (scenario == "preparation-failure") preparationFailure();
        else if (scenario == "resume") resume();
        else if (scenario == "invalid-offer") invalidOffer();
        else throw std::runtime_error("unknown lifecycle scenario");
        std::cout << scenario << " passed\n";
    }
    catch (const std::exception &error)
    {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
