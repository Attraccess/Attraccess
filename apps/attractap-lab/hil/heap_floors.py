"""Floors for the reader's internal heap under the HIL workloads (bytes).

Measured on the Touch V2 (plain: place attractap-touch-v2-1, secure-lab: place
attractap-touch-v2-secure-1) with the lab test image: DEBUG logging, test hooks and
16-row display bounce buffers (about 32 KB).
``min_free`` is the lowest free internal heap and ``min_largest`` the smallest
largest free block that the reader's 50 ms sampler saw during a workload
(``windowMinFree`` / ``windowMinLargest`` of system.heap.reset / .get). Both include
the 32 KB that ESP-IDF reserves for allocations that must be internal (Wi-Fi, task
stacks, key material on the secure profile); ordinary allocations cannot use it and
fall back to PSRAM, so a largest block of 31,744 is that reserve, untouched.

Each floor is 70 % of the lowest value seen over the measuring runs, rounded down
to 1000 bytes ("seen" below). A run that goes under a floor lost a third of the
headroom the workload had: a larger TLS or websocket buffer, a new always-on task,
a bigger bounce buffer, an allocation that moved back from PSRAM. The floors are a
regression alarm, not a proof the reader never runs out; ``busy-day``
(test_ram.test_busy_day) is the plausible worst case.
Raise a floor when a change gives the headroom back; lower one only with a
measured reason, in the same commit.

Seen (free / largest block), measured 2026-11-19 on firmware 2.5.1. The floors were
raised then: malloc() takes internal RAM only for blocks up to 1 KB, three task
stacks and the secure profile's TLS record buffers moved to PSRAM, the API sends a
reader only the 10 resources it shows, and the BLE stack is released when idle.
Before that the busy day left 37,591 (plain) and 30,763 (secure-lab), and with
plugin BLE 23,619 and 5,971:

    workload        plain               secure-lab
    card-reads      109,039 / 31,744    104,751 / 31,744
    reconnects      110,003 / 31,744    103,703 / 31,744
    resource-list   105,691 / 31,744    101,319 / 31,744
    ota             110,451 / 36,864    104,107 / 31,744
    busy-day        100,847 / 31,744     96,547 / 31,744
    busy-day-ble     74,727 / 31,744     72,439 / 30,720

``busy-day-ble`` is the busy day of a run with ``HIL_BLE=1``: each session also does
a plugin BLE exchange, and the BLE stack takes about 24 KB while it is up. Every
other window starts once the reader has released the stack, so its floor holds with
and without ``HIL_BLE``.

Over ``wss://`` (``HIL_WSS=1``, measured 2026-11-20) the plain reader stays within
about 1 KB of the table above (busy-day 100,103 / 31,744) and keeps its floors. On
secure-lab the outer TLS session takes another 10 to 15 KB, so it has its own floors
(``WSS_FLOORS``), from the lower of a TLS 1.3 and a TLS 1.2 run:

    workload        TLS 1.3             TLS 1.2
    card-reads       91,559 / 31,744     94,103 / 31,744
    reconnects       90,763 / 31,744     92,883 / 31,744
    resource-list    88,707 / 31,744     86,879 / 31,744
    ota              92,375 / 31,744     not measured
    busy-day         81,739 / 31,744     87,359 / 31,744
    busy-day-ble     57,295 / 24,576     60,739 / 26,624
"""
import os

FLOORS = {
    "plain": {
        "card-reads": {"min_free": 76_000, "min_largest": 22_000},
        "reconnects": {"min_free": 77_000, "min_largest": 22_000},
        "resource-list": {"min_free": 73_000, "min_largest": 22_000},
        "ota": {"min_free": 77_000, "min_largest": 25_000},
        "busy-day": {"min_free": 70_000, "min_largest": 22_000},
        "busy-day-ble": {"min_free": 52_000, "min_largest": 22_000},
    },
    "secure-lab": {
        "card-reads": {"min_free": 73_000, "min_largest": 22_000},
        "reconnects": {"min_free": 72_000, "min_largest": 22_000},
        "resource-list": {"min_free": 70_000, "min_largest": 22_000},
        "ota": {"min_free": 72_000, "min_largest": 22_000},
        "busy-day": {"min_free": 67_000, "min_largest": 22_000},
        "busy-day-ble": {"min_free": 50_000, "min_largest": 21_000},
    },
}
# With HIL_WSS=1 these replace the profile's floors above.
WSS_FLOORS = {
    "secure-lab": {
        "card-reads": {"min_free": 64_000, "min_largest": 22_000},
        "reconnects": {"min_free": 63_000, "min_largest": 22_000},
        "resource-list": {"min_free": 60_000, "min_largest": 22_000},
        "ota": {"min_free": 64_000, "min_largest": 22_000},
        "busy-day": {"min_free": 57_000, "min_largest": 22_000},
        "busy-day-ble": {"min_free": 40_000, "min_largest": 17_000},
    },
}
# A workload without a measured floor must at least leave this much.
DEFAULT = {"min_free": 20_000, "min_largest": 10_000}


def floors(profile, workload):
    table = FLOORS.get(profile, {})
    if os.environ.get("HIL_WSS") == "1":
        table = {**table, **WSS_FLOORS.get(profile, {})}
    return table.get(workload, DEFAULT)
