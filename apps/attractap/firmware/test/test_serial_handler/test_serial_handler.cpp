#include <unity.h>
#include <Arduino.h>
#include <string>
#include <cstring>

#include "serial/serialCommandHandler.hpp"

// Forward declarations for test helpers defined in mock_*.cpp
void mock_settings_reset();
void mock_state_reset();
void mock_state_set_websocket(bool connected, const char* hostname, uint16_t port, bool useSSL);
void mock_state_set_api(bool authenticated, const char* deviceName);
void mock_wifi_reset();
void mock_wifi_set_scanning(bool v);
void mock_wifi_add_network(const char* ssid, int32_t rssi, wifi_auth_mode_t enc, bool isOpen, uint8_t ch);

// ---------- helpers ----------

static void reset_all() {
    mock_settings_reset();
    mock_state_reset();
    mock_wifi_reset();
    Serial.clear();
}

// Returns the first "RESP <topic> <json>" line found in Serial output (no trailing newline).
static std::string get_resp(const std::string& out) {
    auto pos = out.find("RESP ");
    if (pos == std::string::npos) return "";
    auto end = out.find('\n', pos);
    return end == std::string::npos ? out.substr(pos) : out.substr(pos, end - pos);
}

static std::string run(const char* line) {
    Serial.clear();
    SerialCommandHandler::processLine(String(line));
    return get_resp(Serial._out);
}

static void set_pin(const char* pin) {
    char buf[64];
    snprintf(buf, sizeof(buf), R"(CMND auth.code.set {"newCode":"%s"})", pin);
    run(buf);
}

static std::string run_with_auth(const char* topic, const char* json_payload, const char* pin) {
    char buf[256];
    if (json_payload && strlen(json_payload) > 0) {
        // Merge authCode into existing JSON object
        // Strip trailing } and append authCode field
        std::string base(json_payload);
        base.pop_back(); // remove '}'
        snprintf(buf, sizeof(buf), R"(CMND %s %s,"authCode":"%s"})", topic, base.c_str(), pin);
    } else {
        snprintf(buf, sizeof(buf), R"(CMND %s {"authCode":"%s"})", topic, pin);
    }
    return run(buf);
}

// ---------- setUp / tearDown ----------

void setUp() { reset_all(); }
void tearDown() {}

// ============================================================
// validateNewCode (tested via auth.code.set responses)
// ============================================================

void test_validate_code_valid_four_digits() {
    // "1234" is a valid new code — expect success response
    std::string resp = run(R"(CMND auth.code.set {"newCode":"1234"})");
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("success":true)") != std::string::npos, resp.c_str());
}

void test_validate_code_invalid_too_short() {
    std::string resp = run(R"(CMND auth.code.set {"newCode":"123"})");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("INVALID_NEW_CODE") != std::string::npos, resp.c_str());
}

void test_validate_code_invalid_too_long() {
    std::string resp = run(R"(CMND auth.code.set {"newCode":"12345"})");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("INVALID_NEW_CODE") != std::string::npos, resp.c_str());
}

void test_validate_code_invalid_non_digit() {
    std::string resp = run(R"(CMND auth.code.set {"newCode":"12a4"})");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("INVALID_NEW_CODE") != std::string::npos, resp.c_str());
}

void test_validate_code_invalid_empty() {
    std::string resp = run(R"(CMND auth.code.set {"newCode":""})");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("INVALID_NEW_CODE") != std::string::npos, resp.c_str());
}

// ============================================================
// processLine parsing
// ============================================================

void test_process_line_no_cmnd_prefix() {
    // Lines without "CMND" are silently dropped — no RESP emitted
    Serial.clear();
    SerialCommandHandler::processLine(String("HELLO auth.status.get {}"));
    TEST_ASSERT_EQUAL_STRING("", get_resp(Serial._out).c_str());
}

void test_process_line_garbage_before_cmnd() {
    // Non-hex garbage chars before CMND are stripped (split literal avoids \xNN hex-escape ambiguity)
    std::string resp = run("@@@\x01" "CMND auth.status.get {}");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("RESP auth.status.get") != std::string::npos, resp.c_str());
}

void test_process_line_cmnd_without_topic() {
    // "CMND" with no space (nothing after it) → no RESP (logged as error)
    Serial.clear();
    SerialCommandHandler::processLine(String("CMND"));
    TEST_ASSERT_EQUAL_STRING("", get_resp(Serial._out).c_str());
}

void test_process_line_cmnd_no_payload() {
    // Topic with no payload is allowed (treated as empty JSON object)
    std::string resp = run("CMND auth.status.get");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("RESP auth.status.get") != std::string::npos, resp.c_str());
}

// ============================================================
// auth.status.get
// ============================================================

void test_auth_status_no_pin() {
    std::string resp = run("CMND auth.status.get {}");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("auth.status.get") != std::string::npos, resp.c_str());
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("pinIsSet":false)") != std::string::npos, resp.c_str());
}

void test_auth_status_after_pin_set() {
    set_pin("5678");
    std::string resp = run("CMND auth.status.get {}");
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("pinIsSet":true)") != std::string::npos, resp.c_str());
}

// ============================================================
// auth.code.set — PIN lifecycle
// ============================================================

void test_auth_code_set_first_time_no_current_needed() {
    std::string resp = run(R"(CMND auth.code.set {"newCode":"4321"})");
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("success":true)") != std::string::npos, resp.c_str());
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("pinIsSet":true)") != std::string::npos, resp.c_str());
}

void test_auth_code_change_requires_current() {
    set_pin("1111");
    // Attempt change without currentCode
    std::string resp = run(R"(CMND auth.code.set {"newCode":"2222"})");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("MISSING_AUTH_CODE") != std::string::npos, resp.c_str());
}

void test_auth_code_change_wrong_current() {
    set_pin("1111");
    std::string resp = run(R"(CMND auth.code.set {"newCode":"2222","currentCode":"9999"})");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("INVALID_AUTH_CODE") != std::string::npos, resp.c_str());
}

void test_auth_code_change_valid_current() {
    set_pin("1111");
    std::string resp = run(R"(CMND auth.code.set {"newCode":"2222","currentCode":"1111"})");
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("success":true)") != std::string::npos, resp.c_str());
    // Verify new PIN is active
    std::string status = run_with_auth("auth.status.get", "", "2222");
    TEST_ASSERT_TRUE_MESSAGE(status.find("auth.status.get") != std::string::npos, status.c_str());
}

// ============================================================
// PIN gate — commands require pin to be set first
// ============================================================

void test_pin_gate_blocks_without_pin() {
    // network.status.get before any pin is set → PIN_NOT_SET
    std::string resp = run("CMND network.status.get {}");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("PIN_NOT_SET") != std::string::npos, resp.c_str());
}

void test_pin_gate_requires_auth_code() {
    set_pin("3333");
    // No authCode field → MISSING_AUTH_CODE
    std::string resp = run("CMND network.status.get {}");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("MISSING_AUTH_CODE") != std::string::npos, resp.c_str());
}

void test_pin_gate_wrong_auth_code() {
    set_pin("3333");
    std::string resp = run(R"(CMND network.status.get {"authCode":"0000"})");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("INVALID_AUTH_CODE") != std::string::npos, resp.c_str());
}

// ============================================================
// network.status.get
// ============================================================

void test_network_status_default() {
    set_pin("1234");
    std::string resp = run_with_auth("network.status.get", "", "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("network.status.get") != std::string::npos, resp.c_str());
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("wifi_connected":false)") != std::string::npos, resp.c_str());
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("ethernet_connected":false)") != std::string::npos, resp.c_str());
}

// ============================================================
// network.wifi.ssids.get
// ============================================================

void test_wifi_ssids_empty_scan() {
    set_pin("1234");
    std::string resp = run_with_auth("network.wifi.ssids.get", "", "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("network.wifi.ssids.get") != std::string::npos, resp.c_str());
    TEST_ASSERT_TRUE_MESSAGE(resp.find("[]") != std::string::npos, resp.c_str());
}

void test_wifi_ssids_with_networks() {
    mock_wifi_add_network("TestSSID", -60, WIFI_AUTH_WPA2_PSK, false, 6);
    set_pin("1234");
    std::string resp = run_with_auth("network.wifi.ssids.get", "", "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("TestSSID") != std::string::npos, resp.c_str());
    TEST_ASSERT_TRUE_MESSAGE(resp.find("WPA2_PSK") != std::string::npos, resp.c_str());
}

void test_wifi_ssids_open_network_encryption_label() {
    mock_wifi_add_network("OpenNet", -70, WIFI_AUTH_OPEN, true, 1);
    set_pin("1234");
    std::string resp = run_with_auth("network.wifi.ssids.get", "", "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("OPEN") != std::string::npos, resp.c_str());
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("isOpen":true)") != std::string::npos, resp.c_str());
}

// ============================================================
// network.wifi.credentials.set
// ============================================================

void test_wifi_credentials_set_valid() {
    set_pin("1234");
    std::string resp = run_with_auth("network.wifi.credentials.set",
                                     R"({"ssid":"MyWifi","password":"secret"})", "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("success":true)") != std::string::npos, resp.c_str());
}

void test_wifi_credentials_set_no_ssid() {
    set_pin("1234");
    std::string resp = run_with_auth("network.wifi.credentials.set",
                                     R"({"ssid":"","password":"secret"})", "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("INVALID_PAYLOAD") != std::string::npos, resp.c_str());
}

// ============================================================
// api.configuration.set
// ============================================================

void test_api_config_set_valid() {
    set_pin("1234");
    std::string resp = run_with_auth("api.configuration.set",
                                     R"({"hostname":"api.example.com","port":443,"useSSL":true})",
                                     "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("success":true)") != std::string::npos, resp.c_str());
}

void test_api_config_set_missing_hostname() {
    set_pin("1234");
    std::string resp = run_with_auth("api.configuration.set",
                                     R"({"hostname":"","port":443,"useSSL":false})", "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("INVALID_PAYLOAD") != std::string::npos, resp.c_str());
}

void test_api_config_set_missing_port() {
    set_pin("1234");
    std::string resp = run_with_auth("api.configuration.set",
                                     R"({"hostname":"api.example.com","useSSL":false})", "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("INVALID_PAYLOAD") != std::string::npos, resp.c_str());
}

// ============================================================
// api.status.get
// ============================================================

void test_api_status_disconnected_no_config() {
    set_pin("1234");
    std::string resp = run_with_auth("api.status.get", "", "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("status":"disconnected")") != std::string::npos, resp.c_str());
}

void test_api_status_connecting_websocket() {
    mock_state_set_websocket(false, "api.example.com", 443, true);
    set_pin("1234");
    std::string resp = run_with_auth("api.status.get", "", "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("status":"connecting_websocket")") != std::string::npos, resp.c_str());
    TEST_ASSERT_TRUE_MESSAGE(resp.find("api.example.com") != std::string::npos, resp.c_str());
}

void test_api_status_connected_not_authenticated() {
    mock_state_set_websocket(true, "api.example.com", 443, true);
    mock_state_set_api(false, "");
    set_pin("1234");
    std::string resp = run_with_auth("api.status.get", "", "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("status":"connected")") != std::string::npos, resp.c_str());
}

void test_api_status_authenticated() {
    mock_state_set_websocket(true, "api.example.com", 443, true);
    mock_state_set_api(true, "My Reader");
    set_pin("1234");
    std::string resp = run_with_auth("api.status.get", "", "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find(R"("status":"authenticated")") != std::string::npos, resp.c_str());
}

// ============================================================
// Unknown topic
// ============================================================

void test_unknown_topic() {
    set_pin("1234");
    std::string resp = run_with_auth("does.not.exist", "", "1234");
    TEST_ASSERT_TRUE_MESSAGE(resp.find("UNKNOWN_TOPIC") != std::string::npos, resp.c_str());
}

// ============================================================
// main
// ============================================================

int main(int, char**) {
    UNITY_BEGIN();

    // validateNewCode
    RUN_TEST(test_validate_code_valid_four_digits);
    RUN_TEST(test_validate_code_invalid_too_short);
    RUN_TEST(test_validate_code_invalid_too_long);
    RUN_TEST(test_validate_code_invalid_non_digit);
    RUN_TEST(test_validate_code_invalid_empty);

    // processLine parsing
    RUN_TEST(test_process_line_no_cmnd_prefix);
    RUN_TEST(test_process_line_garbage_before_cmnd);
    RUN_TEST(test_process_line_cmnd_without_topic);
    RUN_TEST(test_process_line_cmnd_no_payload);

    // auth.status.get
    RUN_TEST(test_auth_status_no_pin);
    RUN_TEST(test_auth_status_after_pin_set);

    // auth.code.set / PIN lifecycle
    RUN_TEST(test_auth_code_set_first_time_no_current_needed);
    RUN_TEST(test_auth_code_change_requires_current);
    RUN_TEST(test_auth_code_change_wrong_current);
    RUN_TEST(test_auth_code_change_valid_current);

    // PIN gate
    RUN_TEST(test_pin_gate_blocks_without_pin);
    RUN_TEST(test_pin_gate_requires_auth_code);
    RUN_TEST(test_pin_gate_wrong_auth_code);

    // network.status.get
    RUN_TEST(test_network_status_default);

    // network.wifi.ssids.get
    RUN_TEST(test_wifi_ssids_empty_scan);
    RUN_TEST(test_wifi_ssids_with_networks);
    RUN_TEST(test_wifi_ssids_open_network_encryption_label);

    // network.wifi.credentials.set
    RUN_TEST(test_wifi_credentials_set_valid);
    RUN_TEST(test_wifi_credentials_set_no_ssid);

    // api.configuration.set
    RUN_TEST(test_api_config_set_valid);
    RUN_TEST(test_api_config_set_missing_hostname);
    RUN_TEST(test_api_config_set_missing_port);

    // api.status.get
    RUN_TEST(test_api_status_disconnected_no_config);
    RUN_TEST(test_api_status_connecting_websocket);
    RUN_TEST(test_api_status_connected_not_authenticated);
    RUN_TEST(test_api_status_authenticated);

    // Unknown topic
    RUN_TEST(test_unknown_topic);

    return UNITY_END();
}
