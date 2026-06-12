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

If `tc` or the `netem` scheduler is missing, the `netem` preset now falls back
to iptables random loss (`-m statistic --mode random --probability ...`). The
fallback reproduces packet loss only; it cannot add latency.

## Presets

| Preset | Reproduces | Mechanism |
| --- | --- | --- |
| `blackhole` | **ATT-464** half-open sockets | creates `CHAOS_AP_BLACKHOLE` and inserts a `FORWARD` jump at rule 1, then silently drops packets with no RST |
| `netem` | **ATT-469** stalls / slow paths | `tc qdisc add dev <if> root netem delay 2000ms loss 30%`; falls back to `CHAOS_AP_LOSS` + iptables statistic loss when netem is unavailable |
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

# Bridged reader/server on the same LAN: enable bridge-nf automatically when possible
READER_IP=192.168.8.123 SERVER_IP=192.168.8.50 ./chaos-ap.sh blackhole on

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
| `READER_IP` | _(empty)_ | `blackhole`, `netem` fallback, bridge-nf | reader IP to drop; empty = affect **all** FORWARD traffic |
| `SERVER_IP` | _(empty)_ | bridge-nf | server IP; when set with `READER_IP`, same-subnet traffic enables `/proc/sys/net/bridge/bridge-nf-call-iptables` if writable |
| `IFACE` | `br-lan` | `netem`, bridge-nf | interface that carries reader↔server traffic |
| `DELAY` | `2000ms` | `netem` | netem added latency; ignored by statistic-loss fallback |
| `LOSS` | `30%` | `netem` | netem packet loss or statistic fallback probability (`30%` or `0.3`) |
| `CHAOS_AP_DISABLE_FLOW_OFFLOAD` | `0` | `blackhole`, `netem` fallback | set to `1` to temporarily disable OpenWRT flow offload before installing iptables rules |
| `CHAOS_AP_FIREWALL_RESTART` | `reload` | flow offload | firewall action after temporary flow-offload disable: `reload`, `restart`, `start`, or `none` |
| `RADIO` | `radio0` | `flap` | OpenWRT radio (or interface) to toggle |
| `DHCP_SECTION` | `lan` | `dhcp-wedge` | uci `dhcp.<section>` to wedge |
| `FLAP_DOWN` | `5` | `flap` | seconds the SSID stays down each cycle |
| `FLAP_MIN` / `FLAP_MAX` | `15` / `30` | `flap` | random up-time window (seconds) |
| `FLAP_PIDFILE` | `/tmp/chaos-ap-flap.pid` | `flap` | where the background flap loop records its PID |

## GL.iNet / OpenWRT quirks

The GL-SFT1200 bench router (OpenWRT 18.06 / Linux 4.14) needs a few extra
safeguards for these presets to bite:

- **FORWARD rule ordering matters.** OpenWRT/GL.iNet installs zone and
  established-flow `ACCEPT` rules in `FORWARD`. `chaos-ap.sh` therefore inserts
  dedicated `CHAOS_AP_*` jumps at `FORWARD` rule 1 instead of appending raw DROP
  rules at the bottom.
- **Flow offload can bypass iptables.** If
  `firewall.@defaults[0].flow_offloading` or `flow_offloading_hw` is enabled,
  established flows may skip netfilter entirely. By default the script warns but
  does not change router config. For a temporary experiment you can run:

  ```sh
  CHAOS_AP_DISABLE_FLOW_OFFLOAD=1 READER_IP=192.168.8.123 ./chaos-ap.sh blackhole on
  ```

  The script uses uncommitted `uci set` changes, restarts the firewall according
  to `CHAOS_AP_FIREWALL_RESTART`, and flushes conntrack if `conntrack` exists.
- **GL.iNet firewall reload gotcha.** On the GL-SFT1200, toggling flow offload
  and running a bare `/etc/init.d/firewall reload` can desync GL custom chains
  and leave NAT/forwarding partially broken until a full firewall start or
  reboot. Prefer leaving flow offload alone and rebooting the router/client to
  tear down the experiment. If you do disable offload, treat a router reboot as
  the safest teardown and avoid committing the uci changes.
- **Bridged reader↔server traffic can skip FORWARD.** If both endpoints are on
  `br-lan`, Linux may bridge them at L2. Set both `READER_IP` and `SERVER_IP`;
  when they share the interface subnet and
  `/proc/sys/net/bridge/bridge-nf-call-iptables` is writable, the script writes
  `1` there so bridged IPv4 traffic reaches iptables.
- **No netem module on some GL feeds.** If `sch_netem` / `kmod-sched-netem` is
  unavailable, the `netem` preset falls back to iptables statistic loss. This is
  useful for loss-only testing, but it does not simulate added latency.

## Notes

- Presets are independent; you can stack `blackhole` + `netem`. `clear` removes
  the script's iptables chains/qdisc/flap loop, and a reboot removes all
  non-persistent kernel state.
- `flap` runs a background loop tracked by `FLAP_PIDFILE`; `flap off` / `clear`
  stops it and brings the radio back up.
- `dhcp-wedge` keeps DNS working (dnsmasq is only restarted, not stopped) so the
  failure is isolated to lease acquisition.
- For per-SSID flapping instead of whole-radio, point `RADIO` at the specific
  wifi interface (e.g. `wlan0`) so the `ifconfig` fallback is used.
