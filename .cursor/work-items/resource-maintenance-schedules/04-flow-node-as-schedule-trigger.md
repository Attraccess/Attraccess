# Work Item 04: Flow Node as Schedule Trigger (deferred)

## Status: Deferred

This work item is **not in the current scope**. Triggering maintenance when a flow node runs was evaluated as more complex than initially assumed and is deferred for later re-evaluation.

The codebase and work items have been updated to use only three trigger types: **USAGE_HOURS**, **USAGE_COUNT**, and **TIME_INTERVAL**. No FLOW_NODE trigger type or flow-node config exists in the data model.

If this feature is revisited later, consider:
- How to link a schedule to a specific flow node (e.g. by node id).
- When the flow executor runs a node, how to signal “this schedule’s condition is met” without duplicating maintenance records.
- Permissions and UX for configuring “when this node runs, request maintenance”.

No implementation is planned until the approach is re-evaluated.
