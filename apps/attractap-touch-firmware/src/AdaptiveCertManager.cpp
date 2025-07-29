#include "AdaptiveCertManager.h"

// Preference keys
const char *AdaptiveCertManager::PREF_NAMESPACE = "cert_mgr";
const char *AdaptiveCertManager::PREF_SUCCESSFUL_CERT = "success_cert";

// Global instance
AdaptiveCertManager adaptiveCertManager;

AdaptiveCertManager::AdaptiveCertManager()
    : currentCertIndex(0), successfulCertIndex(-1), initialized(false), rememberedCertFailureCount(0)
{
}

AdaptiveCertManager::~AdaptiveCertManager()
{
    if (initialized)
    {
        preferences.end();
    }
}

bool AdaptiveCertManager::begin()
{
    if (initialized)
    {
        return true;
    }

    bool success = preferences.begin(PREF_NAMESPACE, false);
    if (success)
    {
        initialized = true;
        Serial.printf("AdaptiveCertManager: Initialized with namespace '%s'\n", PREF_NAMESPACE);
        // Show debug info on startup
        debugShowSavedCertificates();

        loadSuccessfulCert();
    }
    else
    {
        Serial.printf("AdaptiveCertManager: Failed to initialize preferences with namespace '%s'\n", PREF_NAMESPACE);
    }

    return success;
}

bool AdaptiveCertManager::configureWebSocketSSL(esp_websocket_client_config_t *config)
{
    if (!initialized || !config)
    {
        Serial.println("AdaptiveCertManager: Invalid parameters");
        return false;
    }

    Serial.printf("AdaptiveCertManager: Available certificates: %d\n", CA_CERT_COUNT);

    // If we have a remembered successful certificate, start with that
    if (successfulCertIndex >= 0 && isValidCertIndex(successfulCertIndex))
    {
        // Only use remembered cert if we haven't failed too many times
        if (rememberedCertFailureCount < 5)
        {
            currentCertIndex = successfulCertIndex;
            Serial.printf("AdaptiveCertManager: Using remembered certificate (index %d, failure count: %d/5)\n",
                          currentCertIndex, rememberedCertFailureCount);
        }
        else
        {
            // Too many failures, start iterating from beginning
            currentCertIndex = 0;
            rememberedCertFailureCount = 0; // Reset counter for fresh iteration
            Serial.printf("AdaptiveCertManager: Remembered certificate failed too many times, starting fresh iteration\n");
        }
    }
    else
    {
        // No remembered certificate, start with first certificate
        Serial.printf("AdaptiveCertManager: No remembered certificate found, starting fresh search\n");
    }

    if (!isValidCertIndex(currentCertIndex))
    {
        Serial.printf("AdaptiveCertManager: No certificates available (index %d, max %d)\n",
                      currentCertIndex, CA_CERT_COUNT);
        return false;
    }

    // Configure WebSocket with current certificate
    const char *certData = (const char *)pgm_read_ptr(&ca_certificates[currentCertIndex].data);
    config->cert_pem = certData;

    const char *certName = (const char *)pgm_read_ptr(&ca_certificates[currentCertIndex].name);
    Serial.printf("AdaptiveCertManager: Configured with certificate: %s (index %d/%d)\n",
                  certName, currentCertIndex, CA_CERT_COUNT - 1);

    return true;
}

void AdaptiveCertManager::markSuccess()
{
    if (!initialized)
    {
        return;
    }

    const char *certName = getCurrentCertName();
    Serial.printf("AdaptiveCertManager: Certificate successful: %s (index %d)\n",
                  certName, currentCertIndex);

    successfulCertIndex = currentCertIndex;
    rememberedCertFailureCount = 0; // Reset failure counter on success

    saveSuccessfulCert(currentCertIndex);
}

bool AdaptiveCertManager::tryNextCertificate()
{
    if (!initialized)
    {
        Serial.println("AdaptiveCertManager: Not initialized, cannot try next certificate");
        return false;
    }

    const char *failedCertName = getCurrentCertName();

    // Check if the failed certificate is the remembered one
    if (successfulCertIndex >= 0 && currentCertIndex == successfulCertIndex)
    {
        rememberedCertFailureCount++;
        Serial.printf("AdaptiveCertManager: Remembered certificate failed: %s (index %d/%d, failure count: %d/5)\n",
                      failedCertName, currentCertIndex, CA_CERT_COUNT - 1, rememberedCertFailureCount);

        // If we haven't hit the failure limit, retry the same certificate
        if (rememberedCertFailureCount < 5)
        {
            Serial.printf("AdaptiveCertManager: Will retry remembered certificate (attempt %d/5)\n",
                          rememberedCertFailureCount + 1);
            return true; // Don't increment currentCertIndex, retry same cert
        }
        else
        {
            // Hit failure limit, start fresh iteration
            Serial.println("AdaptiveCertManager: Remembered certificate failed too many times, starting fresh iteration");
            successfulCertIndex = -1;                 // Clear remembered certificate
            preferences.remove(PREF_SUCCESSFUL_CERT); // Clear saved preference
            currentCertIndex = 0;
            rememberedCertFailureCount = 0;
            // Continue to regular iteration logic below
        }
    }
    else
    {
        // Regular iteration through certificates
        Serial.printf("AdaptiveCertManager: Certificate failed during iteration: %s (index %d/%d)\n",
                      failedCertName, currentCertIndex, CA_CERT_COUNT - 1);
    }

    // Move to next certificate in iteration
    currentCertIndex++;

    if (!isValidCertIndex(currentCertIndex))
    {
        Serial.printf("AdaptiveCertManager: No more certificates to try (reached index %d, max %d)\n",
                      currentCertIndex, CA_CERT_COUNT - 1);
        return false;
    }

    const char *nextCertName = getCurrentCertName();
    Serial.printf("AdaptiveCertManager: Trying next certificate: %s (index %d/%d)\n",
                  nextCertName, currentCertIndex, CA_CERT_COUNT - 1);

    return true;
}

void AdaptiveCertManager::reset()
{
    currentCertIndex = 0;
    successfulCertIndex = -1;
    rememberedCertFailureCount = 0;
    Serial.println("AdaptiveCertManager: Reset to first certificate");
}

void AdaptiveCertManager::resetForNewConnection()
{
    currentCertIndex = 0;
    successfulCertIndex = -1;
    rememberedCertFailureCount = 0;
    currentHostname = "";
    Serial.println("AdaptiveCertManager: Reset for new connection attempt");
}

const char *AdaptiveCertManager::getCurrentCertName() const
{
    if (!isValidCertIndex(currentCertIndex))
    {
        return "Invalid";
    }

    return (const char *)pgm_read_ptr(&ca_certificates[currentCertIndex].name);
}

int AdaptiveCertManager::getCurrentCertIndex() const
{
    return currentCertIndex;
}

void AdaptiveCertManager::loadSuccessfulCert()
{
    if (!initialized)
    {
        Serial.println("AdaptiveCertManager: Cannot load - not initialized");
        return;
    }

    Serial.printf("AdaptiveCertManager: Loading certificate\n");

    successfulCertIndex = preferences.getInt(PREF_SUCCESSFUL_CERT, -1);

    if (successfulCertIndex >= 0)
    {
        Serial.printf("AdaptiveCertManager: Found remembered certificate: index %d\n", successfulCertIndex);
    }
    else
    {
        Serial.printf("AdaptiveCertManager: No remembered certificate found\n");
    }
}

void AdaptiveCertManager::saveSuccessfulCert(int certIndex)
{
    if (!initialized || !isValidCertIndex(certIndex))
    {
        Serial.printf("AdaptiveCertManager: Cannot save - initialized:%d, validIndex:%d\n",
                      initialized, isValidCertIndex(certIndex));
        return;
    }

    Serial.printf("AdaptiveCertManager: Saving certificate, index %d\n", certIndex);

    size_t bytesWritten = preferences.putInt(PREF_SUCCESSFUL_CERT, certIndex);

    if (bytesWritten > 0)
    {
        Serial.printf("AdaptiveCertManager: Successfully saved certificate: index %d (%d bytes)\n",
                      certIndex, bytesWritten);
    }
    else
    {
        Serial.printf("AdaptiveCertManager: ERROR - Failed to save certificate: index %d\n",
                      certIndex);
    }
}

bool AdaptiveCertManager::isValidCertIndex(int index) const
{
    return index >= 0 && index < CA_CERT_COUNT;
}

void AdaptiveCertManager::debugShowSavedCertificates()
{
    if (!initialized)
    {
        Serial.println("AdaptiveCertManager: Cannot debug - not initialized");
        return;
    }

    Serial.println("AdaptiveCertManager: === Saved Certificates Debug ===");
    Serial.printf("AdaptiveCertManager: Preferences namespace: %s\n", PREF_NAMESPACE);

    // Try to show the key for the current hostname if available
    if (!currentHostname.isEmpty())
    {
        int savedIndex = preferences.getInt(PREF_SUCCESSFUL_CERT, -1);
        Serial.printf("AdaptiveCertManager: Current hostname '%s' -> index %d\n",
                      currentHostname.c_str(), savedIndex);
    }

    Serial.println("AdaptiveCertManager: === End Debug ===");
}