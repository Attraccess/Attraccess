#pragma once

#include <cstdint>

// Whether a RESOURCE_USAGE_FORM_REQUEST may open the form flow (ATT-545, ATT-796).
//
// The server retries un-acked messages, so a duplicate request must not reset a form in progress, nor reopen one that
// was already submitted while the START/STOP result is in flight. But the server shows at most four forms per request:
// after a submitted batch the reader sends the action again under a new request id, and a form request for that new id
// is the next batch. A retry of the finished request carries the old id; a server without request ids sends 0.
namespace FormRequestGate
{
    struct State
    {
        bool isCurrentAction;     // request id is 0 or the id of the action in flight
        bool actionPending;       // a start/stop action is waiting for its result
        bool matchesAction;       // same resource and form action as the pending action
        bool formInProgress;      // a form request is open on the screen
        bool flowSubmitted;       // the last batch was submitted and the action re-sent
        uint32_t requestId;       // id of the incoming request
        uint32_t submittedRequestId; // id of the request whose batch was submitted
    };

    inline bool accepts(const State &s)
    {
        if (!s.isCurrentAction || !s.actionPending || !s.matchesAction || s.formInProgress)
        {
            return false;
        }
        if (!s.flowSubmitted)
        {
            return true;
        }
        return s.requestId != 0 && s.requestId != s.submittedRequestId;
    }
}
