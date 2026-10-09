#pragma once

#include <algorithm>
#include <string>
#include <string_view>
#include <vector>

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
    if (locale == "de") return "de"; // Normalized wire values need no subtag parsing.
    if (locale.compare(0, 3, "de-") != 0) return "en";
    // Validate the complete de/en locale structure (BCP 47), including script,
    // variants, extensions and private use, before selecting its primary language.
    // No extlang is registered for German or English.
    std::vector<std::string_view> parts;
    const std::string_view tag(locale);
    for (size_t position = 0; position <= tag.size();) {
        const auto separator = tag.find('-', position);
        const auto part = tag.substr(position, separator == tag.npos ? tag.npos : separator - position);
        if (part.empty() || part.size() > 8 || part.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789") != part.npos) return "en";
        parts.push_back(part);
        if (separator == tag.npos) break;
        position = separator + 1;
    }
    if (parts[0] != "de") return "en";
    const auto alpha = [](std::string_view value) { return value.find_first_not_of("abcdefghijklmnopqrstuvwxyz") == value.npos; };
    const auto numeric = [](std::string_view value) { return value.find_first_not_of("0123456789") == value.npos; };
    size_t index = 1;
    if (index < parts.size() && parts[index].size() == 4 && alpha(parts[index])) ++index;
    if (index < parts.size() && ((parts[index].size() == 2 && alpha(parts[index])) || (parts[index].size() == 3 && numeric(parts[index])))) ++index;
    std::vector<std::string_view> variants;
    while (index < parts.size() && (parts[index].size() >= 5 || (parts[index].size() == 4 && parts[index][0] >= '0' && parts[index][0] <= '9'))) {
        if (std::find(variants.begin(), variants.end(), parts[index]) != variants.end()) return "en";
        variants.push_back(parts[index++]);
    }
    std::string extensions;
    while (index < parts.size() && parts[index].size() == 1 && parts[index] != "x") {
        const auto singleton = parts[index++][0];
        if (extensions.find(singleton) != extensions.npos) return "en";
        extensions += singleton;
        const auto first = index;
        while (index < parts.size() && parts[index].size() >= 2) ++index;
        if (index == first) return "en";
    }
    if (index < parts.size() && parts[index] == "x") {
        if (++index == parts.size()) return "en";
        index = parts.size(); // Private-use subtags may contain one to eight characters.
    }
    return index == parts.size() ? "de" : "en";
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
