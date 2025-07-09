#include "web_server.hpp"
#include <Arduino.h>
#include <WiFi.h>
#include "api.hpp"

// Forward declaration for the external API instance
extern API api;

// Global function to check if API is connected
bool isApiConnected()
{
    // First check if API is configured before checking connection
    if (!api.isConfigured())
    {
        return false;
    }
    return api.isConnected();
}

ConfigWebServer::ConfigWebServer(NetworkInterface *network) : server(80), network(network)
{
}

void ConfigWebServer::setup()
{
    Serial.println("[WebServer] Setting up web server...");

    // Initialize filesystem
    if (!LittleFS.begin(true))
    {
        Serial.println("[WebServer] Error mounting LittleFS filesystem");
        return;
    }

    Serial.println("[WebServer] Filesystem mounted successfully");

    // List files in the filesystem for debugging
    File root = LittleFS.open("/");
    File file = root.openNextFile();

    Serial.println("[WebServer] Files in filesystem:");
    while (file)
    {
        Serial.print("  ");
        Serial.print(file.name());
        Serial.print(" (");
        Serial.print(file.size());
        Serial.println(" bytes)");
        file = root.openNextFile();
    }

    // Add CORS preflight handler for OPTIONS requests
    server.on("/api/*", HTTP_OPTIONS, [this]()
              {
        this->setCorsHeaders();
        server.send(204); });
    Serial.println("[WebServer] Registered OPTIONS handler for /api/*");

    // Set up API endpoints
    server.on("/api/auth/check", HTTP_GET, [this]()
              { 
                this->setCorsHeaders();
                this->handleApiAuthCheck(); });
    Serial.println("[WebServer] Registered GET handler for /api/auth/check");

    server.on("/api/auth/login", HTTP_POST, [this]()
              { 
                this->setCorsHeaders();
                this->handleApiAuthLogin(); });
    Serial.println("[WebServer] Registered POST handler for /api/auth/login");

    server.on("/api/auth/logout", HTTP_GET, [this]()
              { 
                this->setCorsHeaders();
                this->handleApiAuthLogout(); });
    Serial.println("[WebServer] Registered GET handler for /api/auth/logout");

    server.on("/api/config", HTTP_GET, [this]()
              { 
                this->setCorsHeaders();
                this->handleApiConfig(); });
    Serial.println("[WebServer] Registered GET handler for /api/config");

    server.on("/api/config/save", HTTP_POST, [this]()
              { 
                this->setCorsHeaders();
                this->handleApiConfigSave(); });
    Serial.println("[WebServer] Registered POST handler for /api/config/save");

    server.on("/api/status", HTTP_GET, [this]()
              { 
                this->setCorsHeaders();
                this->handleApiStatus(); });
    Serial.println("[WebServer] Registered GET handler for /api/status");

    // Handle filesystem requests
    server.onNotFound([this]()
                      {
        String path = server.uri();
        Serial.print("[WebServer] Request for: ");
        Serial.println(path);
        
        // If it's an API request, return 404 as normal
        if (path.startsWith("/api/")) {
            Serial.println("[WebServer] API route not found, returning 404");
            this->setCorsHeaders();
            server.send(404, "application/json", "{\"error\":\"Not found\"}");
            return;
        }
        
        // For all other routes (client-side routes), serve the index.html
        if (!handleFileRead(path)) {
            Serial.println("[WebServer] Route not found, serving index.html for SPA routing");
            handleFileRead("/index.html");
        } });

    // Start server
    server.begin();
    Serial.println("[WebServer] HTTP server started");
}

void ConfigWebServer::setCorsHeaders()
{
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    server.sendHeader("Access-Control-Max-Age", "86400");
}

void ConfigWebServer::loop()
{
    server.handleClient();
}

bool ConfigWebServer::handleAuthentication()
{
    if (this->authenticated)
    {
        return true;
    }

    JsonDocument doc;
    doc["authenticated"] = false;
    doc["message"] = "Authentication required";

    String response;
    serializeJson(doc, response);

    server.send(401, "application/json", response);
    return false;
}

bool ConfigWebServer::handleFileRead(String path)
{
    Serial.println("[WebServer] handleFileRead: " + path);

    // If path ends with "/" or is blank, serve index.html
    if (path.endsWith("/"))
    {
        Serial.println("[WebServer] Serving index.html of directory");
        path += "index.html";
    }

    // Get content type based on file extension
    String contentType = getContentType(path);

    Serial.println("[WebServer] Content type: " + contentType);

    // Try to open the file
    if (LittleFS.exists(path))
    {
        Serial.println("[WebServer] File exists");
        File file = LittleFS.open(path, "r");

        if (file)
        {
            Serial.println("[WebServer] Streaming file");
            server.streamFile(file, contentType);
            file.close();
            return true;
        }
        else
        {
            Serial.println("[WebServer] File not found");
        }
    }

    Serial.println("[WebServer] Skipping request for file serving");
    return false;
}

void ConfigWebServer::handleApiAuthCheck()
{
    JsonDocument doc;
    doc["authenticated"] = authenticated;

    String response;
    serializeJson(doc, response);

    server.send(200, "application/json", response);
}

void ConfigWebServer::handleApiAuthLogin()
{
    JsonDocument doc;
    String body = server.arg("plain");

    JsonDocument requestDoc;
    DeserializationError error = deserializeJson(requestDoc, body);

    if (error)
    {
        doc["success"] = false;
        doc["message"] = "Invalid JSON";

        String response;
        serializeJson(doc, response);

        server.send(400, "application/json", response);
        return;
    }

    String password = requestDoc["password"].as<String>();

    if (password == Persistence::getAdminPassword())
    {
        authenticated = true;
        doc["success"] = true;
    }
    else
    {
        doc["success"] = false;
        doc["message"] = "Invalid password";
    }

    String response;
    serializeJson(doc, response);

    server.send(200, "application/json", response);
}

void ConfigWebServer::handleApiAuthLogout()
{
    authenticated = false;

    JsonDocument doc;
    doc["success"] = true;

    String response;
    serializeJson(doc, response);

    server.send(200, "application/json", response);
}

void ConfigWebServer::handleApiConfig()
{
    if (!handleAuthentication())
    {
        return;
    }

    PersistSettings<PersistenceData> settings = Persistence::getSettings();

    JsonDocument doc;
    doc["apiHostname"] = settings.Config.api.hostname;
    doc["apiPort"] = settings.Config.api.port;
    doc["readerId"] = settings.Config.api.readerId;

    String response;
    serializeJson(doc, response);

    server.send(200, "application/json", response);
}

void ConfigWebServer::handleApiConfigSave()
{
    if (!handleAuthentication())
    {
        return;
    }

    String body = server.arg("plain");

    JsonDocument requestDoc;
    DeserializationError error = deserializeJson(requestDoc, body);

    if (error)
    {
        JsonDocument errorDoc;
        errorDoc["success"] = false;
        errorDoc["message"] = "Invalid JSON";

        String response;
        serializeJson(errorDoc, response);

        server.send(400, "application/json", response);
        return;
    }

    PersistSettings<PersistenceData> settings = Persistence::getSettings();

    // Update API configuration
    if (requestDoc.containsKey("apiHostname"))
    {
        String apiHostname = requestDoc["apiHostname"].as<String>();
        Serial.print("[WebServer] Updating API hostname to: ");
        Serial.println(apiHostname);
        strncpy(settings.Config.api.hostname, apiHostname.c_str(), sizeof(settings.Config.api.hostname) - 1);
        settings.Config.api.hostname[sizeof(settings.Config.api.hostname) - 1] = '\0';
    }

    if (requestDoc.containsKey("apiPort"))
    {
        uint16_t apiPort = requestDoc["apiPort"].as<uint16_t>();
        Serial.print("[WebServer] Updating API port to: ");
        Serial.println(apiPort);
        settings.Config.api.port = apiPort;
    }

    if (requestDoc.containsKey("readerId"))
    {
        uint32_t readerId = requestDoc["readerId"].as<uint32_t>();
        Serial.print("[WebServer] Updating reader ID to: ");
        Serial.println(readerId);
        settings.Config.api.readerId = readerId;
    }

    if (requestDoc.containsKey("apiKey"))
    {
        String apiKey = requestDoc["apiKey"].as<String>();
        Serial.println("[WebServer] Updating API key");
        strncpy(settings.Config.api.apiKey, apiKey.c_str(), sizeof(settings.Config.api.apiKey) - 1);
        settings.Config.api.apiKey[sizeof(settings.Config.api.apiKey) - 1] = '\0';
    }

    // Update admin password if provided and not empty
    if (requestDoc.containsKey("configPagePassword") && !requestDoc["configPagePassword"].as<String>().isEmpty())
    {
        String newPassword = requestDoc["configPagePassword"].as<String>();
        Serial.println("[WebServer] Updating admin password");
        strncpy(settings.Config.web.admin_password, newPassword.c_str(), sizeof(settings.Config.web.admin_password) - 1);
        settings.Config.web.admin_password[sizeof(settings.Config.web.admin_password) - 1] = '\0';
    }

    // Save all settings
    Serial.println("[WebServer] Saving all settings...");
    Persistence::saveSettings(settings);
    Serial.println("[WebServer] Settings saved successfully");

    JsonDocument doc;
    doc["success"] = true;

    String response;
    serializeJson(doc, response);

    server.send(200, "application/json", response);

    // Restart the device after a short delay to apply settings
    delay(500);
    ESP.restart();
}

void ConfigWebServer::handleApiStatus()
{
    JsonDocument doc;
    doc["wifiConnected"] = (WiFi.status() == WL_CONNECTED);
    doc["ipAddress"] = network->getCurrentIp().toString();

    // Add API connection status
    // This assumes the existence of an isApiConnected method or similar
    // You may need to adjust this based on your actual API implementation
    doc["apiConnected"] = isApiConnected();

    // Add reader ID from persistence
    PersistSettings<PersistenceData> settings = Persistence::getSettings();
    doc["readerId"] = settings.Config.api.readerId;

    String response;
    serializeJson(doc, response);

    server.send(200, "application/json", response);
}

String ConfigWebServer::getContentType(String filename)
{
    if (filename.endsWith(".html"))
        return "text/html";
    else if (filename.endsWith(".css"))
        return "text/css";
    else if (filename.endsWith(".js"))
        return "application/javascript";
    else if (filename.endsWith(".ico"))
        return "image/x-icon";
    else if (filename.endsWith(".json"))
        return "application/json";
    return "text/plain";
}