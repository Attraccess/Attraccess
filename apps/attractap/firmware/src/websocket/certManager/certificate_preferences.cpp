#include "AdaptiveCertManager.hpp"

void AdaptiveCertManager::loadSuccessfulCertIndexFromPreferences()
{
    if (!initialized)
    {
        logger.error("Cannot load - not initialized");
        return;
    }

    logger.info("Loading certificate");

    successfulCertIndex = preferences.getInt(PREF_SUCCESSFUL_CERT, -1);
    successfulServerKey = preferences.getString(PREF_SUCCESSFUL_HOST);

    // Sanitize here, the only place a locked index enters: a firmware update may
    // have shrunk the CA list, and an out-of-range lock would otherwise be kept
    // forever (markFailure never unlocks). Drop it and sweep fresh instead.
    if (successfulCertIndex >= 0 && !isValidCertIndex(successfulCertIndex))
    {
        logger.errorf("Stored certificate index %d is out of range (max %d), clearing lock",
                      successfulCertIndex, CA_CERT_COUNT - 1);
        this->reset();
        return;
    }

    // A firmware update may also have reordered the list, leaving the index in
    // range but pointing at a different CA. The stored name catches that; a lock
    // from a firmware that did not record the name adopts the current one (same
    // rationale as the server-key adoption in ensureLockMatchesServer).
    if (successfulCertIndex >= 0)
    {
        std::string storedCertName = preferences.getString(PREF_SUCCESSFUL_CERT_NAME);
        const char *currentName = ca_certificates[successfulCertIndex].name;
        if (storedCertName.empty())
        {
            preferences.putString(PREF_SUCCESSFUL_CERT_NAME, currentName);
        }
        else if (storedCertName != currentName)
        {
            logger.errorf("Stored certificate index %d now maps to '%s' (was '%s'), clearing lock",
                          successfulCertIndex, currentName, storedCertName.c_str());
            this->reset();
            return;
        }
    }

    if (successfulCertIndex >= 0)
    {
        logger.infof("Found locked certificate: index %d", successfulCertIndex);
    }
    else
    {
        logger.info("No locked certificate found");
    }
}

void AdaptiveCertManager::saveSuccessfulCertIndexToPreferences(int certIndex)
{
    if (!initialized || !isValidCertIndex(certIndex))
    {
        logger.errorf("Cannot save - initialized:%d, validIndex:%d",
                      initialized, isValidCertIndex(certIndex));
        return;
    }

    logger.infof("Saving certificate, index %d", certIndex);

    size_t bytesWritten = preferences.putInt(PREF_SUCCESSFUL_CERT, certIndex);

    if (bytesWritten > 0)
    {
        logger.infof("Successfully saved certificate: index %d (%d bytes)",
                     certIndex, bytesWritten);
    }
    else
    {
        logger.errorf("ERROR - Failed to save certificate: index %d",
                      certIndex);
    }
}

bool AdaptiveCertManager::isValidCertIndex(int index) const
{
    logger.debugf("isValidCertIndex: %d", index);
    return index >= 0 && index < CA_CERT_COUNT;
}
