# chaos-ap — network fault-injection presets

Part B (network) of [ATT-471](https://linear.app/attraccess/issue/ATT-471). A
controllable "chaos" network between an Attractap reader and the Attraccess
server, checked into the repo for repeatability.

`chaos-ap.sh` runs **on the AP / gateway** that sits between the reader and the
server and uses `iptables`, `tc`/`netem`, and (on OpenWRT) `wifi` + `uci` to
deterministically reproduce one network failure class at a time. Each preset is
ground truth for validating the matching reader-side fix.

## Target environment

- Primary target: the bench **OpenWRT router** (BusyBox `ash`, `uci`, `wifi`,
  `dnsmasq`). The script is plain POSIX `sh`.
- Also runs on any Linux box for the `blackhole` and `netem` presets (they only
  need `iptables` and `tc`); `flap` falls back to `ifconfig`, and `dhcp-wedge`
  requires OpenWRT `uci`.
- Must run as **root**.

`tc netem` needs the scheduler module on the router:

```sh
opkg update && opkg install kmod-sched tc
```

## Presets

| Preset | Reproduces | Mechanism |
| --- | --- | --- |
| `blackhole` | **ATT-464** half-open sockets | `iptables -A FORWARD ... -j DROP` — silently drops packets with no RST, so the reader's TCP stays half-open |
| `netem` | **ATT-469** stalls / slow paths | `tc qdisc add dev <if> root netem delay 2000ms loss 30%` |
| `flap` | **ATT-465 / ATT-467** reconnect churn | kills the SSID (`wifi down <radio>`) and brings it back on a randomized 15–30s interval |
| `dhcp-wedge` | **ATT-468** DHCP wedge | `uci set dhcp.<section>.ignore=1` — SSID and DNS stay up, but no leases are handed out |

## Usage

```sh
# enable / disable one preset
./chaos-ap.sh <preset> on
./chaos-ap.sh <preset> off

# inspect what is currently active
./chaos-ap.sh status

# disable everything and restore a clean network
./chaos-ap.sh clear
```

### Examples

```sh
# ATT-464: black-hole one reader (no RST -> half-open socket)
READER_IP=192.168.8.123 ./chaos-ap.sh blackhole on

# ATT-469: 2s latency + 30% loss on the LAN bridge facing the readers
IFACE=br-lan DELAY=2000ms LOSS=30% ./chaos-ap.sh netem on

# ATT-465/467: flap the SSID, down 5s, up for a random 15-30s
RADIO=radio0 FLAP_DOWN=5 FLAP_MIN=15 FLAP_MAX=30 ./chaos-ap.sh flap on

# ATT-468: stop handing out DHCP leases, keep the SSID up
DHCP_SECTION=lan ./chaos-ap.sh dhcp-wedge on

# undo whatever is running
./chaos-ap.sh clear
```

## Config (environment variables)

| Var | Default | Used by | Meaning |
| --- | --- | --- | --- |
| `READER_IP` | _(empty)_ | `blackhole` | reader IP to drop; empty = drop **all** FORWARD traffic |
| `IFACE` | `br-lan` | `netem` | interface that carries reader↔server traffic |
| `DELAY` | `2000ms` | `netem` | netem added latency |
| `LOSS` | `30%` | `netem` | netem packet loss |
| `RADIO` | `radio0` | `flap` | OpenWRT radio (or interface) to toggle |
| `DHCP_SECTION` | `lan` | `dhcp-wedge` | uci `dhcp.<section>` to wedge |
| `FLAP_DOWN` | `5` | `flap` | seconds the SSID stays down each cycle |
| `FLAP_MIN` / `FLAP_MAX` | `15` / `30` | `flap` | random up-time window (seconds) |
| `FLAP_PIDFILE` | `/tmp/chaos-ap-flap.pid` | `flap` | where the background flap loop records its PID |

## Notes

- Presets are independent; you can stack `blackhole` + `netem`. `clear` (and a
  reboot) removes everything.
- `flap` runs a background loop tracked by `FLAP_PIDFILE`; `flap off` / `clear`
  stops it and brings the radio back up.
- `dhcp-wedge` keeps DNS working (dnsmasq is only restarted, not stopped) so the
  failure is isolated to lease acquisition.
- For per-SSID flapping instead of whole-radio, point `RADIO` at the specific
  wifi interface (e.g. `wlan0`) so the `ifconfig` fallback is used.
