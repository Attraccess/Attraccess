"""Floors for the reader's internal heap under the HIL workloads (bytes).

Measured on the Touch V2 (plain: place attractap-touch-v2-1, secure-lab: place
attractap-touch-v2-secure-1) with the lab test image: DEBUG logging, test hooks, and
on the secure profile 16-row display bounce buffers and MbedTLS in internal RAM.
``min_free`` is the lowest free internal heap and ``min_largest`` the smallest
largest free block that the reader's 50 ms sampler saw during a workload
(``windowMinFree`` / ``windowMinLargest`` of system.heap.reset / .get).

Each floor is 70 % of the lowest value seen over the measuring runs, rounded down
to 1000 bytes ("seen" column below). A run that goes under a floor lost a third
of the headroom the workload had: a larger TLS or websocket buffer, a new
always-on task, a bigger bounce buffer. The floors are a regression alarm, not a
proof the reader never runs out; ``resource-list`` is the workload closest to
exhaustion (secure-lab: 30 KB free and a 15 KB block left of ~64 KB idle; 19.7 KB free since boot).
Raise a floor when a change gives the headroom back; lower one only with a
measured reason, in the same commit.

Seen (free / largest block), measured 2026-11-06 on firmware 1.11.1:

    workload        plain              secure-lab
    card-reads      106,727 / 31,744   62,359 / 31,744
    reconnects      108,939 / 31,744   61,055 / 29,696
    resource-list   79,215 / 31,744   30,195 / 15,360
    ota             98,527 / 31,744    55,079 / 27,648
"""

FLOORS = {
    "plain": {
        "card-reads": {"min_free": 74_000, "min_largest": 22_000},
        "reconnects": {"min_free": 76_000, "min_largest": 22_000},
        "resource-list": {"min_free": 55_000, "min_largest": 22_000},
        "ota": {"min_free": 69_000, "min_largest": 22_000},
    },
    "secure-lab": {
        "card-reads": {"min_free": 43_000, "min_largest": 22_000},
        "reconnects": {"min_free": 42_000, "min_largest": 20_000},
        "resource-list": {"min_free": 21_000, "min_largest": 10_000},
        "ota": {"min_free": 38_000, "min_largest": 19_000},
    },
}
# A workload without a measured floor must at least leave this much.
DEFAULT = {"min_free": 20_000, "min_largest": 10_000}


def floors(profile, workload):
    return FLOORS.get(profile, {}).get(workload, DEFAULT)
