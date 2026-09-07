#include "profile_store.hpp"

#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <sys/stat.h>
#include <unistd.h>
#include <vector>

namespace
{
uint64_t fnv1a(const std::string &value)
{
    uint64_t hash = 14695981039346656037ULL;
    for (unsigned char character : value)
    {
        hash ^= character;
        hash *= 1099511628211ULL;
    }
    return hash;
}
}

ProfileStore::ProfileStore(std::string endpoint, uint32_t readerId, std::filesystem::path root)
    : profilePath(std::move(root) / (profileName(normalizeEndpoint(endpoint), readerId) + ".profile"))
{
    load();
}

std::filesystem::path ProfileStore::defaultRoot()
{
    if (const char *overridePath = std::getenv("ATTRACTAP_PROFILE_DIR"))
        return overridePath;
    if (const char *home = std::getenv("HOME"))
        return std::filesystem::path(home) / "Library/Application Support/Attraccess/Attractap/profiles";
    return ".attractap/profiles";
}

std::string ProfileStore::get(const std::string &key, const std::string &defaultValue) const
{
    const auto value = values.find(key);
    return value == values.end() ? defaultValue : value->second;
}

void ProfileStore::put(const std::string &key, const std::string &value)
{
    values[key] = value;
    save();
}

bool ProfileStore::remove(const std::string &key)
{
    if (values.erase(key) == 0)
        return false;
    save();
    return true;
}

void ProfileStore::clear()
{
    values.clear();
    std::error_code error;
    std::filesystem::remove(profilePath, error);
    if (error)
        throw std::runtime_error("Could not remove desktop profile: " + error.message());
}

std::string ProfileStore::normalizeEndpoint(const std::string &endpoint)
{
    const auto first = endpoint.find_first_not_of(" \t\r\n");
    if (first == std::string::npos)
        return "";
    const auto last = endpoint.find_last_not_of(" \t\r\n");
    std::string normalized = endpoint.substr(first, last - first + 1);
    while (!normalized.empty() && normalized.back() == '/')
        normalized.pop_back();

    const auto schemeEnd = normalized.find("://");
    if (schemeEnd == std::string::npos)
        return normalized;

    const auto lowerCase = [](std::string &value, size_t begin, size_t end)
    {
        for (size_t index = begin; index < end; ++index)
        {
            if (value[index] >= 'A' && value[index] <= 'Z')
                value[index] = static_cast<char>(value[index] - 'A' + 'a');
        }
    };
    const auto authorityStart = schemeEnd + 3;
    const auto authorityEnd = normalized.find_first_of("/?#", authorityStart);
    const auto authority = normalized.substr(authorityStart, authorityEnd - authorityStart);
    if (authority.empty())
    {
        lowerCase(normalized, 0, schemeEnd);
        return normalized;
    }
    const auto hostStart = authority.find_last_of('@') + 1;
    size_t hostEnd = authority.size();
    if (authority[hostStart] == '[')
    {
        const auto closingBracket = authority.find(']', hostStart);
        if (closingBracket != std::string::npos)
            hostEnd = closingBracket + 1;
    }
    else if (const auto portSeparator = authority.find(':', hostStart); portSeparator != std::string::npos)
    {
        hostEnd = portSeparator;
    }
    lowerCase(normalized, 0, schemeEnd);
    lowerCase(normalized, authorityStart + hostStart, authorityStart + hostEnd);
    return normalized;
}

std::string ProfileStore::profileName(const std::string &endpoint, uint32_t readerId)
{
    std::ostringstream name;
    name << std::hex << std::setw(16) << std::setfill('0') << fnv1a(endpoint) << "-" << std::dec << readerId;
    return name.str();
}

void ProfileStore::load()
{
    std::ifstream input(profilePath, std::ios::binary);
    if (!input)
        return;

    std::string key;
    std::string value;
    while (std::getline(input, key, '\0') && std::getline(input, value, '\0'))
        values.emplace(std::move(key), std::move(value));
}

void ProfileStore::save() const
{
    std::error_code error;
    std::filesystem::create_directories(profilePath.parent_path(), error);
    if (error || chmod(profilePath.parent_path().c_str(), S_IRWXU) != 0)
        throw std::runtime_error("Could not secure desktop profile directory");

    const auto profilePathString = profilePath.string();
    std::vector<char> temporaryPath(profilePathString.begin(), profilePathString.end());
    temporaryPath.insert(temporaryPath.end(), {'.', 'X', 'X', 'X', 'X', 'X', 'X', '\0'});
    const int descriptor = mkstemp(temporaryPath.data());
    if (descriptor < 0 || fchmod(descriptor, S_IRUSR | S_IWUSR) != 0)
    {
        if (descriptor >= 0) close(descriptor);
        throw std::runtime_error("Could not create secure desktop profile");
    }

    {
        close(descriptor);
        std::ofstream output(temporaryPath.data(), std::ios::binary | std::ios::trunc);
        if (!output)
            throw std::runtime_error("Could not write desktop profile");
        for (const auto &[key, value] : values)
            output << key << '\0' << value << '\0';
        if (!output)
            throw std::runtime_error("Could not write desktop profile");
    }
    std::filesystem::rename(temporaryPath.data(), profilePath, error);
    if (error)
    {
        std::filesystem::remove(temporaryPath.data());
        throw std::runtime_error("Could not save desktop profile: " + error.message());
    }
}
