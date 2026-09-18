#pragma once

#include <cstdint>
#include <functional>
#include <mutex>
#include <queue>

class HostRuntime
{
public:
    using Task = std::function<void()>;

    uint32_t millis() const;
    void post(Task task);
    void dispatch();

private:
    std::mutex mutex;
    std::queue<Task> tasks;
};
