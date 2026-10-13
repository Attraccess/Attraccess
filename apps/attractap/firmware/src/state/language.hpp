#pragma once

#include <string>

namespace Language
{
// Locale normalization belongs to the API. Reader wire values are canonical en/de.
inline std::string supported(const std::string &language, const std::string &fallback = "en")
{
    return language == "en" || language == "de" ? language : fallback;
}

inline std::string active(bool userAuthenticated, const std::string &userLanguage, const std::string &defaultLanguage)
{
    const auto fallback = supported(defaultLanguage);
    return userAuthenticated ? supported(userLanguage, fallback) : fallback;
}

inline const char *text(const char *english, const char *german, const std::string &locale)
{
    return supported(locale) == "de" && german && german[0] != '\0' ? german : english;
}

struct Session
{
    std::string defaultLanguage = "en";
    std::string userLanguage;
    bool userAuthenticated = false;

    void setDefault(const std::string &locale) { defaultLanguage = supported(locale); }
    void setUser(bool authenticated, const std::string &locale = "")
    {
        userAuthenticated = authenticated;
        userLanguage = locale;
    }
    void setApi(bool authenticated, const std::string &locale)
    {
        if (!locale.empty()) setDefault(locale);
        if (!authenticated) setUser(false);
    }
    std::string active() const { return Language::active(userAuthenticated, userLanguage, defaultLanguage); }
};
}
