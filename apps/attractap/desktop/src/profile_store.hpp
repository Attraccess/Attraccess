#pragma once

#include <cstdint>
#include <filesystem>
#include <map>
#include <string>

class ProfileStore
{
public:
    ProfileStore(std::string endpoint, uint32_t readerId, std::filesystem::path root = defaultRoot());

    static std::filesystem::path defaultRoot();

    std::string get(const std::string &key, const std::string &defaultValue = "") const;
    void put(const std::string &key, const std::string &value);
    bool remove(const std::string &key);
    void clear();
    const std::filesystem::path &path() const { return profilePath; }

private:
    static std::string normalizeEndpoint(const std::string &endpoint);
    static std::string profileName(const std::string &endpoint, uint32_t readerId);
    void load();
    void save() const;

    std::filesystem::path profilePath;
    std::map<std::string, std::string> values;
};
