#include "form_request_gate.hpp"

#include <cstdio>

static int failures = 0;

#define CHECK(cond)                                                              \
    do                                                                           \
    {                                                                            \
        if (!(cond))                                                             \
        {                                                                        \
            std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); \
            failures++;                                                          \
        }                                                                        \
    } while (0)

int main()
{
    using FormRequestGate::accepts;
    using FormRequestGate::State;

    const State fresh{true, true, true, false, false, 7, 0};
    CHECK(accepts(fresh));

    // Requests for another action, resource or a stale id never open the flow.
    State stale = fresh;
    stale.isCurrentAction = false;
    CHECK(!accepts(stale));
    State idle = fresh;
    idle.actionPending = false;
    CHECK(!accepts(idle));
    State other = fresh;
    other.matchesAction = false;
    CHECK(!accepts(other));

    // A duplicate while the form is open does not reset it.
    State open = fresh;
    open.formInProgress = true;
    CHECK(!accepts(open));

    // After a submitted batch, a retry of the finished request does not reopen it...
    State retried{true, true, true, false, true, 7, 7};
    CHECK(!accepts(retried));
    // ...nor does a request from a server without request ids...
    State noIds{true, true, true, false, true, 0, 0};
    CHECK(!accepts(noIds));
    // ...but the request for the re-sent action is the next batch of forms.
    State nextBatch{true, true, true, false, true, 8, 7};
    CHECK(accepts(nextBatch));

    if (failures)
    {
        std::fprintf(stderr, "%d failure(s)\n", failures);
        return 1;
    }
    std::puts("form request gate: ok");
    return 0;
}
