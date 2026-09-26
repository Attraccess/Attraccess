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
    return locale.substr(0, locale.find('-')) == "de" ? "de" : "en";
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
    void setUser(const std::string &locale)
    {
        userAuthenticated = !locale.empty();
        userLanguage = supported(locale);
    }
    void setApi(bool authenticated, const std::string &locale)
    {
        if (!locale.empty()) setDefault(locale);
        if (!authenticated) setUser("");
    }
    std::string active() const { return Language::active(userAuthenticated, userLanguage, defaultLanguage); }
};
}
