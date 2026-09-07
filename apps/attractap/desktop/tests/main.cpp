#include "host_runtime.hpp"
#include "profile_store.hpp"

#include <cassert>
#include <chrono>
#include <filesystem>
#include <sys/stat.h>
#include <thread>

int main()
{
    const auto root = std::filesystem::temp_directory_path() / "attractap-desktop-profile-tests";
    std::filesystem::remove_all(root);

    ProfileStore first(" HTTPS://Example.test/ ", 42, root);
    first.put("api.key", "secret");
    assert(first.get("api.key") == "secret");
    const auto firstPath = first.path();
    struct stat fileStatus {};
    assert(stat(firstPath.c_str(), &fileStatus) == 0);
    assert((fileStatus.st_mode & 077) == 0);

    ProfileStore sameProfile("https://example.test", 42, root);
    assert(sameProfile.path() == firstPath);
    assert(sameProfile.get("api.key") == "secret");
    ProfileStore otherReader("https://example.test", 43, root);
    assert(otherReader.get("api.key").empty());
    ProfileStore caseDistinctPath("https://example.test/TenantA", 42, root);
    ProfileStore differentCasePath("https://example.test/tenanta", 42, root);
    assert(caseDistinctPath.path() != differentCasePath.path());
    assert(sameProfile.remove("api.key"));
    assert(!sameProfile.remove("api.key"));

    HostRuntime runtime;
    int value = 0;
    runtime.post([&] { value = 1; runtime.post([&] { value = 2; }); });
    runtime.dispatch();
    assert(value == 1);
    runtime.dispatch();
    assert(value == 2);
    const auto before = runtime.millis();
    std::this_thread::sleep_for(std::chrono::milliseconds(2));
    assert(runtime.millis() >= before);

    std::filesystem::remove_all(root);
}
