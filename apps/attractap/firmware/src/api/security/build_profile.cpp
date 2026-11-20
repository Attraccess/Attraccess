#include "build_profile.hpp"

#ifdef ESP_PLATFORM
#include "esp_app_desc.h"
#include "sdkconfig.h"
#endif

namespace BuildProfile
{
#ifdef ATTRACTAP_SECURE_BUILD
    // `used` keeps the string in the image; secure_packaging.py and SecureImageService look for it
    // in the unsigned app to tell a secure-profile app from a plain one.
    static const char SECURE_PROFILE_MARKER[] __attribute__((used)) = "attractap-secure-profile-v1";

    const char *secureProfileMarker()
    {
        return SECURE_PROFILE_MARKER;
    }

    int64_t secureVersion()
    {
#if defined(ESP_PLATFORM) && defined(CONFIG_BOOTLOADER_APP_SECURE_VERSION)
        return esp_app_get_description()->secure_version;
#else
        return -1;
#endif
    }
#else
    const char *secureProfileMarker()
    {
        return "";
    }

    int64_t secureVersion()
    {
        return -1;
    }
#endif
}
