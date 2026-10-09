#pragma once

#include <string>

namespace Language
{
inline std::string supported(std::string locale)
{
    for (char &character : locale)
    {
        if (character == '_') character = '-';
        else if (character >= 'A' && character <= 'Z') character = static_cast<char>(character - 'A' + 'a');
    }
    const auto start = locale.find_first_not_of(" \t\r\n");
    if (start == std::string::npos) return "en";
    locale = locale.substr(start, locale.find_last_not_of(" \t\r\n") - start + 1);
    const auto separator = locale.find('-');
    const auto base = locale.substr(0, separator);
    if (base != "de" && base != "en") return "en";
    if (separator != std::string::npos) {
        const auto region = locale.substr(separator + 1);
        const bool alpha = region.size() == 2 && region[0] >= 'a' && region[0] <= 'z' && region[1] >= 'a' && region[1] <= 'z';
        const bool numeric = region.size() == 3 && region.find_first_not_of("0123456789") == std::string::npos;
        if (!alpha && !numeric) return "en";
    }
    return base;
}

inline std::string active(bool userAuthenticated, const std::string &userLanguage, const std::string &defaultLanguage)
{
    return userAuthenticated ? supported(userLanguage) : supported(defaultLanguage);
}

inline const char *text(const char *english, const char *german, const std::string &locale)
{
    return supported(locale) == "de" && german && german[0] != '\0' ? german : english;
}

struct Session
{
    std::string defaultLanguage = "de";
    std::string userLanguage = "en";
    bool userAuthenticated = false;

    void setDefault(const std::string &locale) { defaultLanguage = supported(locale); }
    void setUser(bool authenticated, const std::string &locale = "")
    {
        userAuthenticated = authenticated;
        userLanguage = supported(locale);
    }
    void setApi(bool authenticated, const std::string &locale)
    {
        if (!locale.empty()) setDefault(locale);
        if (!authenticated) setUser(false);
    }
    std::string active() const { return Language::active(userAuthenticated, userLanguage, defaultLanguage); }
};
}
