#include "host_runtime.hpp"

#include <chrono>
#include <utility>

uint32_t HostRuntime::millis() const
{
    using namespace std::chrono;
    static const auto startedAt = steady_clock::now();
    return static_cast<uint32_t>(duration_cast<milliseconds>(steady_clock::now() - startedAt).count());
}

void HostRuntime::post(Task task)
{
    std::lock_guard lock(mutex);
    tasks.push(std::move(task));
}

void HostRuntime::dispatch()
{
    std::queue<Task> pending;
    {
        std::lock_guard lock(mutex);
        pending.swap(tasks);
    }

    while (!pending.empty())
    {
        pending.front()();
        pending.pop();
    }
}
