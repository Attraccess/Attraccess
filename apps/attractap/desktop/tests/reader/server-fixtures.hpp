#pragma once
#include "application/application.hpp"
#include "profile_store.hpp"
#include "virtual_rfid.hpp"
#include <cassert>
#include <chrono>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <queue>
#include <thread>

// The production Application, API parser, screen router and NFC verifier run
// unchanged. Only the server transport and display hardware are substituted.
class Server : public IReaderTransport {
public:
    std::vector<std::string> sent;
    std::queue<std::string> incoming;
    std::function<void(const char *, size_t)> receive;
    void setup() override {}
    void loop() override {
        while (!incoming.empty()) {
            auto message = incoming.front(); incoming.pop();
            receive(message.c_str(), message.size());
        }
    }
    bool sendMessage(const char *data, size_t size) override { sent.emplace_back(data, size); return true; }
    bool sendHeartbeat(const char *, size_t) override { return true; }
    void setMessageCallbackRaw(std::function<void(const char *, size_t)> value) override { receive = std::move(value); }
    void enableConnectionAttempts() override {}
    void disableConnectionAttempts() override {}
    void forceReconnect(const char *) override {}
    void resetCertificateTrust() override {}
    void push(const char *type, const std::string &payload) {
        incoming.push(std::string("{\"event\":\"EVENT\",\"data\":{\"type\":\"") + type + "\",\"payload\":" + payload + "}}");
    }
    size_t count(const char *type) const {
        size_t result = 0;
        for (const auto &message : sent) {
            JsonDocument doc; assert(!deserializeJson(doc, message));
            if (doc["data"]["type"].as<std::string>() == type) ++result;
        }
        return result;
    }
    JsonDocument last(const char *type) const {
        for (auto it = sent.rbegin(); it != sent.rend(); ++it) {
            JsonDocument doc; assert(!deserializeJson(doc, *it));
            if (doc["data"]["type"].as<std::string>() == type) return doc;
        }
        throw std::runtime_error(std::string("Missing request ") + type);
    }
};

class Framebuffer : public IDisplayDriver {
public:
    std::vector<uint16_t> pixels = std::vector<uint16_t>(480 * 480);
    TouchPoint touch{};
    bool begin() override { return true; }
    uint32_t width() const override { return 480; }
    uint32_t height() const override { return 480; }
    bool readTouch(TouchPoint &point) override { point = touch; return touch.pressed; }
    void flush(const lv_area_t *area, uint8_t *data) override {
        auto *source = reinterpret_cast<uint16_t *>(data);
        for (int y = area->y1; y <= area->y2; ++y)
            for (int x = area->x1; x <= area->x2; ++x) pixels[y * 480 + x] = *source++;
    }
    void capture(const std::filesystem::path &directory, const char *name) {
        lv_obj_invalidate(lv_screen_active()); lv_refr_now(nullptr);
        if (directory.empty()) return;
        std::filesystem::create_directories(directory);
        std::ofstream file(directory / (std::string(name) + ".rgba"), std::ios::binary);
        for (uint16_t pixel : pixels) {
            const uint8_t r = (pixel >> 11) & 31, g = (pixel >> 5) & 63, b = pixel & 31;
            const uint8_t rgba[] = {uint8_t((r << 3) | (r >> 2)), uint8_t((g << 2) | (g >> 4)), uint8_t((b << 3) | (b >> 2)), 255};
            file.write(reinterpret_cast<const char *>(rgba), 4);
        }
        assert(file.good());
    }
};

inline lv_obj_t *label(lv_obj_t *root, const char *text) {
    if (!root) return nullptr;
    if (lv_obj_check_type(root, &lv_label_class) && std::strcmp(lv_label_get_text(root), text) == 0) return root;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (auto *found = label(lv_obj_get_child(root, i), text)) return found;
    return nullptr;
}
