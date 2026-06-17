## 1.8.0 (2026-06-17)

### 🚀 Features

- **ATT-160:** support MIFARE DESFire EV2/EV3 cards on Attractap readers ([#1340](https://github.com/Attraccess/Attraccess/pull/1340))
- **ATT-490:** display Supervised by in active session, history & CSV export ([#1278](https://github.com/Attraccess/Attraccess/pull/1278))
- **ATT-493:** Attractap NFC two-card supervision flow with web approval fallback ([#1330](https://github.com/Attraccess/Attraccess/pull/1330))
- **ATT-496:** Shelly plugin scaffold + device registry ([#1292](https://github.com/Attraccess/Attraccess/pull/1292), [#1312](https://github.com/Attraccess/Attraccess/issues/1312))
- **ATT-519:** add generic plugin slots to MQTT frontend ([#1317](https://github.com/Attraccess/Attraccess/pull/1317))
- **ATT-520:** secure backend hook for plugins to read MQTT server config ([#1291](https://github.com/Attraccess/Attraccess/pull/1291))
- **ATT-521:** RabbitMQ detection + MQTT slot status UI in plugin ([#1327](https://github.com/Attraccess/Attraccess/pull/1327))
- **ATT-522:** RabbitMQ plugin — MQTT user management (CRUD + permissions) ([#1337](https://github.com/Attraccess/Attraccess/pull/1337))
- **ATT-526:** bootstrap RabbitMQ plugin nx app + build/zip/publish pipeline ([#1268](https://github.com/Attraccess/Attraccess/pull/1268))
- **ATT-529:** Add SSO login failure metric + alerting and instrument SSO failure paths (OIDC/SAML) ([#1348](https://github.com/Attraccess/Attraccess/pull/1348))
- **ATT-537:** surface maintenance state in resource lists and lock screen ([#1315](https://github.com/Attraccess/Attraccess/pull/1315))
- **ATT-559:** push notifications and in-app toasts for system notifications ([#1355](https://github.com/Attraccess/Attraccess/pull/1355), [#1380](https://github.com/Attraccess/Attraccess/issues/1380), [#1382](https://github.com/Attraccess/Attraccess/issues/1382), [#1381](https://github.com/Attraccess/Attraccess/issues/1381), [#1379](https://github.com/Attraccess/Attraccess/issues/1379), [#1377](https://github.com/Attraccess/Attraccess/issues/1377), [#1390](https://github.com/Attraccess/Attraccess/issues/1390))
- **api:** auto-promote to introduction after X supervised usages (ATT-488) ([#1320](https://github.com/Attraccess/Attraccess/pull/1320))
- **attractap:** loading spinner + input blocking on form navigation (ATT-543) ([#1303](https://github.com/Attraccess/Attraccess/pull/1303))
- **attractap:** redesign resource-usage form UI + prefetch field cache (ATT-541) ([#1301](https://github.com/Attraccess/Attraccess/pull/1301))
- **database-entities:** supervisionMode + supervisorUserId + auto-promotion settings (ATT-486) ([#1273](https://github.com/Attraccess/Attraccess/pull/1273))
- **frontend:** redesign maintenance UI + mark-done shortcut in banner (ATT-531) ([#1276](https://github.com/Attraccess/Attraccess/pull/1276))
- **frontend:** redesign current usage session as highlighted HeroUI card (ATT-538) ([#1309](https://github.com/Attraccess/Attraccess/pull/1309))
- **frontend:** replace OTP inputs with HeroUI InputOTP (ATT-550) ([#1326](https://github.com/Attraccess/Attraccess/pull/1326))
- **messaging:** web push notifications for in-app messages (ATT-532) ([#1332](https://github.com/Attraccess/Attraccess/pull/1332))
- **monitoring:** provision Grafana alerting (Pushover) from files [skip ci] ([bde406d5](https://github.com/Attraccess/Attraccess/commit/bde406d5))
- **monitoring:** redesign Grafana dashboards + device & system health alerts (ATT-517) ([#1252](https://github.com/Attraccess/Attraccess/pull/1252))
- **monitoring:** human-readable Grafana alert notifications (ATT-552) ([#1329](https://github.com/Attraccess/Attraccess/pull/1329))
- **plugins:** hook plugin DB migrations into host migration management (ATT-547) ([#1312](https://github.com/Attraccess/Attraccess/pull/1312))
- **resources:** hide groups from non-members (ATT-515) ([#1269](https://github.com/Attraccess/Attraccess/pull/1269))
- **resources:** supervision mode + auto-promotion settings (ATT-491) ([#1281](https://github.com/Attraccess/Attraccess/pull/1281))
- **resources:** supervised start flow + supervisor approval lifecycle (ATT-487) ([#1277](https://github.com/Attraccess/Attraccess/pull/1277))
- **resources:** supervised start UI — supervisor popup + approval popup (ATT-489) ([#1293](https://github.com/Attraccess/Attraccess/pull/1293))

### 🩹 Fixes

- improve monitoring memory alerts ([#1343](https://github.com/Attraccess/Attraccess/pull/1343))
- prevent attractap alert nodata noise ([#1345](https://github.com/Attraccess/Attraccess/pull/1345))
- suppress no-data for metric alerts ([#1351](https://github.com/Attraccess/Attraccess/pull/1351))
- retain attractap crashdump symbols ([#1356](https://github.com/Attraccess/Attraccess/pull/1356))
- **ATT-539:** make Grafana Pushover alerting opt-in so it starts without secrets ([#1306](https://github.com/Attraccess/Attraccess/pull/1306))
- **ATT-555:** extract coredump build id so symbolication matches the right ELF ([#1335](https://github.com/Attraccess/Attraccess/pull/1335))
- **attractap:** render session start time in server's timezone (ATT-516) ([#1247](https://github.com/Attraccess/Attraccess/pull/1247))
- **attractap:** translate NFC reader error keys (ATT-144) ([#1261](https://github.com/Attraccess/Attraccess/pull/1261))
- **attractap:** refresh reader resource list on health change (ATT-540) ([#1302](https://github.com/Attraccess/Attraccess/pull/1302))
- **attractap:** drop confusing boolean true/false label under form toggle (ATT-544) ([#1304](https://github.com/Attraccess/Attraccess/pull/1304))
- **attractap:** freeze logout timeout while forms/actions in progress (ATT-542) ([#1307](https://github.com/Attraccess/Attraccess/pull/1307))
- **attractap:** prevent loopTask watchdog crash from destroying active screen ([#1308](https://github.com/Attraccess/Attraccess/pull/1308))
- **attractap:** guard against retried form request reopening submitted form (ATT-545) ([#1311](https://github.com/Attraccess/Attraccess/pull/1311))
- **balena:** restore config-ui host networking to resolve port 53 conflict [skip ci] ([#580](https://github.com/Attraccess/Attraccess/issues/580), [#558](https://github.com/Attraccess/Attraccess/issues/558))
- **ci:** run PR workflow on merge_group for merge queue ([#1338](https://github.com/Attraccess/Attraccess/pull/1338))
- **config-ui:** restrict dnsmasq conf-dir to *.conf so custom-hosts loads [skip ci] ([#558](https://github.com/Attraccess/Attraccess/issues/558), [#580](https://github.com/Attraccess/Attraccess/issues/580))
- **frontend:** make all tables horizontally scrollable on mobile (ATT-518) ([#1251](https://github.com/Attraccess/Attraccess/pull/1251))
- **frontend:** widen documentation iframe modal (ATT-536) ([#1283](https://github.com/Attraccess/Attraccess/pull/1283))
- **monitoring:** count unknown-user failed logins and fix alert (ATT-527) ([#1264](https://github.com/Attraccess/Attraccess/pull/1264))
- **monitoring:** guard prepare-provisioning.sh call so init survives image skew (ATT-549) ([#1318](https://github.com/Attraccess/Attraccess/pull/1318))
- **tools:** harden chaos-ap presets for GL.iNet ([#1350](https://github.com/Attraccess/Attraccess/pull/1350))

### 🔥 Performance

- **attractap:** fix Attractap Touch UI lag — restore render/I2C throughput, isolate scheduling (ATT-554) ([#1333](https://github.com/Attraccess/Attraccess/pull/1333))

### ❤️ Thank You

- Claude Opus 4.8
- Cursor @cursoragent
- Giesela-Bot @Giesela-Bot
- Jan Jaap @jappyjan

## [Unreleased]

### 🚀 Features

- **ATT-559:** push notifications + in-app toasts for all system events (resource takeover, session ended, health changes, usage notes, access changes, project invitations, maintenance requests, messages, NFC cards) with per-user channel preferences (email/push/toast) ([ATT-559](https://linear.app/attraccess/issue/ATT-559), [#1355](https://github.com/Attraccess/Attraccess/pull/1355))
- **ATT-559:** iOS PWA permission modal — prompts for notification permission on gesture instead of auto-requesting on mount ([ATT-559](https://linear.app/attraccess/issue/ATT-559), [#1355](https://github.com/Attraccess/Attraccess/pull/1355))
- **ATT-559:** web-presence tracking — PATCH /notifications/web-presence syncs tab visibility so in-app toasts only fire when the user has the tab focused ([ATT-559](https://linear.app/attraccess/issue/ATT-559), [#1355](https://github.com/Attraccess/Attraccess/pull/1355))

### 🩹 Fixes

- **ATT-593:** fix balena not parsing `${VAR:-default}` compose env syntax — Grafana admin credentials now use hardcoded defaults; Pushover vars removed from compose env and must be set as device/fleet variables so `monitoring-init` and `grafana` both see them ([ATT-593](https://linear.app/attraccess/issue/ATT-593))
- **ATT-559:** all notification categories now default to email=true; backfill migration for existing users ([ATT-559](https://linear.app/attraccess/issue/ATT-559), [#1355](https://github.com/Attraccess/Attraccess/pull/1355))
- **ATT-559:** email rendering — compile Handlebars templates before MJML validation so dynamic color/value variables don't fail attribute type checks ([ATT-559](https://linear.app/attraccess/issue/ATT-559), [#1355](https://github.com/Attraccess/Attraccess/pull/1355))
- **ATT-559:** fix resource session-ended email template migration having a duplicate timestamp with the takeover template — renumbered to ensure both run on fresh installs ([ATT-559](https://linear.app/attraccess/issue/ATT-559), [#1355](https://github.com/Attraccess/Attraccess/pull/1355))
- **ATT-559:** fix usage-note email template using illegal `border-radius` on `mj-text` (MJML v5 rejects it); replaced with `container-background-color` ([ATT-559](https://linear.app/attraccess/issue/ATT-559), [#1355](https://github.com/Attraccess/Attraccess/pull/1355))
- **ATT-559:** fix resource flow node editor Enter key reloading the page — wrapped inputs in a `<Form>` with `onSubmit` calling `e.preventDefault()` ([ATT-559](https://linear.app/attraccess/issue/ATT-559), [#1355](https://github.com/Attraccess/Attraccess/pull/1355))
- **ATT-559:** fix project invitation button staying disabled after selecting a user — wired missing `onSelectionChange` handler ([ATT-559](https://linear.app/attraccess/issue/ATT-559), [#1355](https://github.com/Attraccess/Attraccess/pull/1355))
- **ATT-559:** remove stale supervision-request translation keys from notification settings ([ATT-559](https://linear.app/attraccess/issue/ATT-559), [#1355](https://github.com/Attraccess/Attraccess/pull/1355))
- **ATT-559:** remove dead `GET/PATCH /messaging/notification-preferences` endpoints and associated `shouldEmailMessageOnOffline`/`shouldPushMessageOnOffline` methods — message delivery now routes through `NotificationDispatchService` which correctly reads the unified `categoryChannels` preferences ([ATT-559](https://linear.app/attraccess/issue/ATT-559), [#1355](https://github.com/Attraccess/Attraccess/pull/1355))

## 1.7.0 (2026-06-05)

### 🚀 Features

- add resend verification email flow (ATT-266) ([#596](https://github.com/Attraccess/Attraccess/pull/596))
- **ATT-106:** user retraining requirement ([#1125](https://github.com/Attraccess/Attraccess/pull/1125))
- **ATT-174:** notify introducers/maintainers about usage notes ([#1201](https://github.com/Attraccess/Attraccess/pull/1201))
- **ATT-249:** differentiate introducers from maintainers ([#1123](https://github.com/Attraccess/Attraccess/pull/1123))
- **ATT-252:** show allowed users on maintenance and not-introduced views ([376d09a5](https://github.com/Attraccess/Attraccess/commit/376d09a5))
- **ATT-252:** surface maintenance state on Attractap readers ([#1121](https://github.com/Attraccess/Attraccess/pull/1121))
- **ATT-440:** add Conversation, ConversationParticipant, and Message entities with migration ([#1122](https://github.com/Attraccess/Attraccess/pull/1122))
- **ATT-441:** add messaging module with people-to-people conversations ([#1128](https://github.com/Attraccess/Attraccess/pull/1128))
- **ATT-442:** per-user SSE realtime delivery for new messages ([#1152](https://github.com/Attraccess/Attraccess/pull/1152))
- **ATT-443:** messaging inbox page, thread UI, and live SSE updates ([#1153](https://github.com/Attraccess/Attraccess/pull/1153))
- **ATT-444:** "Contact current user" entry point on the resource page ([#1161](https://github.com/Attraccess/Attraccess/pull/1161))
- **ATT-445:** messaging presence detection via SSE connection tracking ([#1177](https://github.com/Attraccess/Attraccess/pull/1177))
- **ATT-446:** per-user notification preferences entity + settings ([#1167](https://github.com/Attraccess/Attraccess/pull/1167))
- **ATT-447:** email fallback for offline recipients with unread messages ([#1182](https://github.com/Attraccess/Attraccess/pull/1182))
- **ATT-448:** per-user message send rate limiting ([#1188](https://github.com/Attraccess/Attraccess/pull/1188))
- **ATT-452:** AttraccessUser popover with Start direct message action ([#1158](https://github.com/Attraccess/Attraccess/pull/1158))
- **ATT-455:** backend PluginContext runtime host-access API ([#1165](https://github.com/Attraccess/Attraccess/pull/1165))
- **ATT-456:** typed plugin event system — emit/subscribe + wire RESOURCE_USAGE events ([#1170](https://github.com/Attraccess/Attraccess/pull/1170))
- **ATT-457:** mount frontend plugin routes via getRoutes() with crash isolation ([#1155](https://github.com/Attraccess/Attraccess/pull/1155))
- **ATT-458:** plugin permissions + sandbox enforcement ([#1156](https://github.com/Attraccess/Attraccess/pull/1156))
- **ATT-461:** plugin docs + working example plugin; drop WIP flag ([#1189](https://github.com/Attraccess/Attraccess/pull/1189))
- **ATT-473:** persist boot/crash record to NVS with periodic heap snapshot ([#1151](https://github.com/Attraccess/Attraccess/pull/1151))
- **ATT-475:** receive + display per-reader crash reports ([#1154](https://github.com/Attraccess/Attraccess/pull/1154))
- **ATT-480:** manual maintenance mode — instant trigger + user requests ([#1169](https://github.com/Attraccess/Attraccess/pull/1169))
- **ATT-482:** messaging unread counts and badges ([#1174](https://github.com/Attraccess/Attraccess/pull/1174))
- **ATT-484:** server-side coredump symbolication ([#1181](https://github.com/Attraccess/Attraccess/pull/1181))
- **ATT-494:** show connection/cert-detection progress on connecting screen ([#1212](https://github.com/Attraccess/Attraccess/pull/1212))
- **attractap:** enable ESP-IDF core dump to flash (ATT-472) ([#1150](https://github.com/Attraccess/Attraccess/pull/1150))
- **attractap:** upload persisted crash record + coredump on next connect (ATT-474) ([#1159](https://github.com/Attraccess/Attraccess/pull/1159))
- **attractap:** display resource health state on readers ([#1227](https://github.com/Attraccess/Attraccess/pull/1227))
- **attractap:** hidden pull-down drawer for settings and reboot (ATT-507) ([#1232](https://github.com/Attraccess/Attraccess/pull/1232))
- **dev:** add --tui flag to pnpm serve for nx interactive terminal UI ([559415f2](https://github.com/Attraccess/Attraccess/commit/559415f2))

### 🩹 Fixes

- **ATT-218:** use table for MQTT server list, remove custom styling ([#1094](https://github.com/Attraccess/Attraccess/pull/1094))
- **ATT-272:** include group-inherited introducers in resource introducer list ([#1200](https://github.com/Attraccess/Attraccess/pull/1200))
- **ATT-273:** add trainers/trainees in one click via search-to-add ([1bf5cd1f](https://github.com/Attraccess/Attraccess/commit/1bf5cd1f))
- **ATT-462:** land Attractap freeze fixes on main ([#1213](https://github.com/Attraccess/Attraccess/pull/1213))
- **ATT-479:** use danger variant for terminate other-user session button ([#1163](https://github.com/Attraccess/Attraccess/pull/1163))
- **ATT-485:** don't count sender's own message as unread ([#1184](https://github.com/Attraccess/Attraccess/pull/1184))
- **attractap:** enable Task Watchdog on loopTask + networkTask (ATT-463) ([#1144](https://github.com/Attraccess/Attraccess/pull/1144))
- **attractap:** harden websocket reconnect + watchdog core-0 tasks (ATT-483) ([#1179](https://github.com/Attraccess/Attraccess/pull/1179))
- **attractap:** overhaul web serial config UI and fix apply-server bug (ATT-495) ([#1223](https://github.com/Attraccess/Attraccess/pull/1223))
- **attractap:** recover from fragmented-heap websocket reconnect lockup (ATT-508) ([#1233](https://github.com/Attraccess/Attraccess/pull/1233))
- **attractap:** reliable NFC card enrollment + redesigned screen (ATT-503) ([#1228](https://github.com/Attraccess/Attraccess/pull/1228))
- **attractap:** authenticate on first tap instead of requiring double tap (ATT-509) ([#1235](https://github.com/Attraccess/Attraccess/pull/1235))
- **attractap:** implement NFC card reset/deletion + align screen with enrollment (ATT-506) ([#1236](https://github.com/Attraccess/Attraccess/pull/1236))
- **ci:** regenerate client libs before typecheck ([#1214](https://github.com/Attraccess/Attraccess/pull/1214))
- **ci:** short-form depends_on so balena push accepts compose ([#1237](https://github.com/Attraccess/Attraccess/pull/1237))
- **ci:** strip fail2ban from compose before balena push ([#1238](https://github.com/Attraccess/Attraccess/pull/1238))
- **dev:** spawn nx directly so --tui terminal UI works ([cebab02a](https://github.com/Attraccess/Attraccess/commit/cebab02a))
- **dev:** force NX_TUI=true so --tui renders the nx terminal UI ([081e7d5f](https://github.com/Attraccess/Attraccess/commit/081e7d5f))

### ❤️ Thank You

- Claude Opus 4.6
- Claude Opus 4.7 (1M context)
- Claude Opus 4.8
- Claude Opus 4.8 (1M context)
- Jan Jaap @jappyjan

## 1.6.0 (2026-05-30)

### 🚀 Features

- **ATT-191:** paginate attractap forms with server-held draft state ([#1079](https://github.com/Attraccess/Attraccess/pull/1079))
- **ATT-280:** migrate to HeroUI v3 ([#759](https://github.com/Attraccess/Attraccess/pull/759), [#804](https://github.com/Attraccess/Attraccess/issues/804), [#803](https://github.com/Attraccess/Attraccess/issues/803), [#806](https://github.com/Attraccess/Attraccess/issues/806), [#805](https://github.com/Attraccess/Attraccess/issues/805), [#818](https://github.com/Attraccess/Attraccess/issues/818), [#817](https://github.com/Attraccess/Attraccess/issues/817), [#809](https://github.com/Attraccess/Attraccess/issues/809), [#821](https://github.com/Attraccess/Attraccess/issues/821), [#822](https://github.com/Attraccess/Attraccess/issues/822), [#820](https://github.com/Attraccess/Attraccess/issues/820), [#819](https://github.com/Attraccess/Attraccess/issues/819), [#823](https://github.com/Attraccess/Attraccess/issues/823), [#808](https://github.com/Attraccess/Attraccess/issues/808), [#807](https://github.com/Attraccess/Attraccess/issues/807), [#825](https://github.com/Attraccess/Attraccess/issues/825), [#837](https://github.com/Attraccess/Attraccess/issues/837), [#835](https://github.com/Attraccess/Attraccess/issues/835), [#918](https://github.com/Attraccess/Attraccess/issues/918), [#934](https://github.com/Attraccess/Attraccess/issues/934), [#834](https://github.com/Attraccess/Attraccess/issues/834), [#846](https://github.com/Attraccess/Attraccess/issues/846), [#849](https://github.com/Attraccess/Attraccess/issues/849), [#847](https://github.com/Attraccess/Attraccess/issues/847), [#854](https://github.com/Attraccess/Attraccess/issues/854), [#852](https://github.com/Attraccess/Attraccess/issues/852), [#853](https://github.com/Attraccess/Attraccess/issues/853), [#872](https://github.com/Attraccess/Attraccess/issues/872), [#900](https://github.com/Attraccess/Attraccess/issues/900), [#896](https://github.com/Attraccess/Attraccess/issues/896), [#899](https://github.com/Attraccess/Attraccess/issues/899), [#914](https://github.com/Attraccess/Attraccess/issues/914), [#913](https://github.com/Attraccess/Attraccess/issues/913), [#903](https://github.com/Attraccess/Attraccess/issues/903), [#915](https://github.com/Attraccess/Attraccess/issues/915), [#910](https://github.com/Attraccess/Attraccess/issues/910), [#909](https://github.com/Attraccess/Attraccess/issues/909), [#897](https://github.com/Attraccess/Attraccess/issues/897), [#905](https://github.com/Attraccess/Attraccess/issues/905), [#901](https://github.com/Attraccess/Attraccess/issues/901), [#904](https://github.com/Attraccess/Attraccess/issues/904), [#893](https://github.com/Attraccess/Attraccess/issues/893), [#902](https://github.com/Attraccess/Attraccess/issues/902), [#894](https://github.com/Attraccess/Attraccess/issues/894), [#912](https://github.com/Attraccess/Attraccess/issues/912), [#908](https://github.com/Attraccess/Attraccess/issues/908), [#898](https://github.com/Attraccess/Attraccess/issues/898), [#917](https://github.com/Attraccess/Attraccess/issues/917), [#892](https://github.com/Attraccess/Attraccess/issues/892), [#907](https://github.com/Attraccess/Attraccess/issues/907), [#906](https://github.com/Attraccess/Attraccess/issues/906), [#911](https://github.com/Attraccess/Attraccess/issues/911), [#959](https://github.com/Attraccess/Attraccess/issues/959), [#961](https://github.com/Attraccess/Attraccess/issues/961), [#958](https://github.com/Attraccess/Attraccess/issues/958), [#960](https://github.com/Attraccess/Attraccess/issues/960), [#962](https://github.com/Attraccess/Attraccess/issues/962), [#963](https://github.com/Attraccess/Attraccess/issues/963), [#967](https://github.com/Attraccess/Attraccess/issues/967), [#964](https://github.com/Attraccess/Attraccess/issues/964), [#968](https://github.com/Attraccess/Attraccess/issues/968), [#969](https://github.com/Attraccess/Attraccess/issues/969), [#970](https://github.com/Attraccess/Attraccess/issues/970), [#971](https://github.com/Attraccess/Attraccess/issues/971), [#975](https://github.com/Attraccess/Attraccess/issues/975), [#976](https://github.com/Attraccess/Attraccess/issues/976), [#977](https://github.com/Attraccess/Attraccess/issues/977), [#979](https://github.com/Attraccess/Attraccess/issues/979), [#980](https://github.com/Attraccess/Attraccess/issues/980), [#981](https://github.com/Attraccess/Attraccess/issues/981), [#985](https://github.com/Attraccess/Attraccess/issues/985), [#986](https://github.com/Attraccess/Attraccess/issues/986))
- **ATT-281:** Coolify-ready production docker-compose ([#761](https://github.com/Attraccess/Attraccess/pull/761))
- **ATT-303:** password policy slice A — core policy + register flow ([#836](https://github.com/Attraccess/Attraccess/pull/836))
- **ATT-304:** password policy slice B — apply to remaining password endpoints ([#850](https://github.com/Attraccess/Attraccess/pull/850))
- **ATT-305:** password policy slice C — admin UI + per-role overrides ([#860](https://github.com/Attraccess/Attraccess/pull/860))
- **ATT-307:** fail2ban service for brute-force IP banning ([#848](https://github.com/Attraccess/Attraccess/pull/848))
- **ATT-346:** bootstrap nx hardware workspace + tscircuit toolchain + CI ([#935](https://github.com/Attraccess/Attraccess/pull/935))
- **ATT-347:** shared lib — connector spec freeze + JLC parts + mech envelope ([#938](https://github.com/Attraccess/Attraccess/pull/938))
- **ATT-348:** Beeper board — pipeline proof PWM buzzer end-to-end ([#939](https://github.com/Attraccess/Attraccess/pull/939))
- **ATT-350:** NFC board v0 — PN532 IC + 24× WS2812 ring ([#966](https://github.com/Attraccess/Attraccess/pull/966))
- **ATT-386:** redesign resource details page with tabbed layout ([#998](https://github.com/Attraccess/Attraccess/pull/998))
- **ATT-389:** redesign resource groups tab (Option E) ([#1007](https://github.com/Attraccess/Attraccess/pull/1007))
- **ATT-69:** enforce conventional commits ([#828](https://github.com/Attraccess/Attraccess/pull/828))
- **att-44:** show available template variables in email editor ([#827](https://github.com/Attraccess/Attraccess/pull/827))
- **auth:** rate limiting + brute-force lockout + fail2ban-friendly audit log (ATT-306) ([#838](https://github.com/Attraccess/Attraccess/pull/838))
- **dev:** parallel-safe dev servers via port-resolving launcher ([#845](https://github.com/Attraccess/Attraccess/pull/845))
- **flows:** persistent flow variables with SET/GET nodes + change trigger (ATT-278) ([#753](https://github.com/Attraccess/Attraccess/pull/753))
- **metrics:** timing metrics + Grafana dashboards (ATT-276) ([#737](https://github.com/Attraccess/Attraccess/pull/737))
- **resources:** email maintainers on health state transitions (ATT-277) ([#826](https://github.com/Attraccess/Attraccess/pull/826))

### 🩹 Fixes

- remove balena.yml from dockerignore and update cli ([#554](https://github.com/Attraccess/Attraccess/pull/554))
- dnsmasq wildcard DNS records not resolving subdomains ([#559](https://github.com/Attraccess/Attraccess/pull/559))
- expose RabbitMQ MQTT ports for IoT device debugging ([#560](https://github.com/Attraccess/Attraccess/pull/560))
- align .nvmrc with Dockerfile node 24.15.0 ([3f75431](https://github.com/Attraccess/Attraccess/commit/3f75431))
- align root Dockerfile NODE_VERSION with .nvmrc ([5442110](https://github.com/Attraccess/Attraccess/commit/5442110))
- allow correcting admin email during first-time setup (ATT-265) ([#581](https://github.com/Attraccess/Attraccess/pull/581))
- TypeScript 6.x compatibility ([784e2d5](https://github.com/Attraccess/Attraccess/commit/784e2d5))
- **ATT-261:** consistent thumbnail size in resource group cards ([#758](https://github.com/Attraccess/Attraccess/pull/758))
- **ATT-383:** add CogIcon to resource group settings button ([#994](https://github.com/Attraccess/Attraccess/pull/994))
- **ATT-384:** align sidebar collapsible triggers with flat items ([#995](https://github.com/Attraccess/Attraccess/pull/995))
- **ATT-385:** align sidebar footer trailing icons ([#997](https://github.com/Attraccess/Attraccess/pull/997))
- **ATT-387:** stack resource filter options vertically ([0618a06](https://github.com/Attraccess/Attraccess/commit/0618a06))
- **ATT-388:** pin cdxgen output to CycloneDX 1.6 for DT compatibility ([#1000](https://github.com/Attraccess/Attraccess/pull/1000))
- **ATT-389:** wrap resource groups table in HeroUI ScrollContainer ([#1008](https://github.com/Attraccess/Attraccess/pull/1008))
- **ATT-389:** replace groups switch with action button + optimistic update ([#1009](https://github.com/Attraccess/Attraccess/pull/1009))
- **ATT-390:** restore flow canvas height after tabbed-layout redesign ([#1006](https://github.com/Attraccess/Attraccess/pull/1006))
- **ATT-391:** disable pull-to-refresh on non-touch devices ([#1005](https://github.com/Attraccess/Attraccess/pull/1005))
- **ATT-392:** derive real client IP behind reverse proxy via TRUST_PROXY ([ea381f1](https://github.com/Attraccess/Attraccess/commit/ea381f1))
- **ATT-394:** wrap diff table in TableContent to stop save crash ([543b6e7](https://github.com/Attraccess/Attraccess/commit/543b6e7))
- **ATT-395:** add pan/select mode toggle for resource flow canvas ([#1020](https://github.com/Attraccess/Attraccess/pull/1020))
- **ATT-395:** move pan/select toggle into top-right toolbar ([#1057](https://github.com/Attraccess/Attraccess/pull/1057))
- **ATT-395:** disable pan in select mode on touch devices ([#1058](https://github.com/Attraccess/Attraccess/pull/1058))
- **ATT-396:** show clear state in usage history scope toggle ([#1018](https://github.com/Attraccess/Attraccess/pull/1018))
- **ATT-397:** always use mobile picker for resource tabs on <sm screens ([095b493](https://github.com/Attraccess/Attraccess/commit/095b493))
- **ATT-397:** tighten spacing between resource header and tab picker ([23f0499](https://github.com/Attraccess/Attraccess/commit/23f0499))
- **ATT-398:** anchor flow node handles to card edges ([#1022](https://github.com/Attraccess/Attraccess/pull/1022))
- **ATT-404:** use danger color for resource usage stop button ([#1039](https://github.com/Attraccess/Attraccess/pull/1039))
- **ATT-405:** show spinner inside usage start/stop button while pending ([bc3eb9e](https://github.com/Attraccess/Attraccess/commit/bc3eb9e))
- **ATT-405:** wrap HeroUI Button to auto-render spinner when pending ([f3f6fee](https://github.com/Attraccess/Attraccess/commit/f3f6fee))
- **ATT-405:** preserve Button size and content when isPending ([a6c3663](https://github.com/Attraccess/Attraccess/commit/a6c3663))
- **ATT-406:** show URL documentation in resource overview preview ([#1051](https://github.com/Attraccess/Attraccess/pull/1051))
- **ATT-407:** render markdown in resource docs preview card ([0ff783e](https://github.com/Attraccess/Attraccess/commit/0ff783e))
- **ATT-408:** use nested plural object for fieldCount EN translation ([18b3d72](https://github.com/Attraccess/Attraccess/commit/18b3d72))
- **ATT-409:** make form validation errors visible with bold red + warning glyph ([c4ca940](https://github.com/Attraccess/Attraccess/commit/c4ca940))
- **ATT-410:** two-column layout for docs + recent sessions on overview ([#1047](https://github.com/Attraccess/Attraccess/pull/1047))
- **ATT-411:** include full end day in CSV export date range ([4bcca55](https://github.com/Attraccess/Attraccess/commit/4bcca55))
- **ATT-412:** distinct SumUp Credentials/Configuration card titles ([#1048](https://github.com/Attraccess/Attraccess/pull/1048))
- **ATT-413:** persist hideEmptyResourceGroups filter to localStorage ([#1055](https://github.com/Attraccess/Attraccess/pull/1055))
- **ATT-416:** render visible Label inside flow-node NumberField ([a9ce5ed](https://github.com/Attraccess/Attraccess/commit/a9ce5ed))
- **ATT-417:** stack active usage sessions banner on small screens ([d8b5d2f](https://github.com/Attraccess/Attraccess/commit/d8b5d2f))
- **ATT-418:** enlarge flow log payload viewer ([#1068](https://github.com/Attraccess/Attraccess/pull/1068))
- **ATT-419:** label multiline property fields in flow node editor ([#1066](https://github.com/Attraccess/Attraccess/pull/1066))
- **ATT-420:** nest ModalContainer inside ModalBackdrop for end-all-sessions ([#1071](https://github.com/Attraccess/Attraccess/pull/1071))
- **ATT-421:** stack unhealthy resource banner contents on mobile ([#1073](https://github.com/Attraccess/Attraccess/pull/1073))
- **ATT-422:** wrap Attractap Table in TableScrollContainer ([#1076](https://github.com/Attraccess/Attraccess/pull/1076))
- **ATT-423:** tabbed editor drawer, scrollable resource list, selector fixes ([#1077](https://github.com/Attraccess/Attraccess/pull/1077))
- **api:** update api/package.json to use mjml@^5.0.1, remove nanoid and mjml-react ([f19ccb5](https://github.com/Attraccess/Attraccess/commit/f19ccb5))
- **api:** correct OIDC scope and force userinfo fetch ([#757](https://github.com/Attraccess/Attraccess/pull/757))
- **auth:** normalize IPv4-mapped IPv6 in resolveIp so rate-limit buckets converge ([#1052](https://github.com/Attraccess/Attraccess/pull/1052))
- **billing:** detect SumUp REFUNDED via simple_status ([adc3527](https://github.com/Attraccess/Attraccess/commit/adc3527))
- **billing:** detect SumUp REFUNDED via simple_status" ([0c51c35](https://github.com/Attraccess/Attraccess/commit/0c51c35))
- **ci:** exclude hardware projects from nightly + release run-many ([#1001](https://github.com/Attraccess/Attraccess/pull/1001))
- **deps:** update react monorepo ([#598](https://github.com/Attraccess/Attraccess/pull/598))
- **deps:** update nx monorepo to v22.6.5 ([#597](https://github.com/Attraccess/Attraccess/pull/597))
- **deps:** update nest monorepo ([#594](https://github.com/Attraccess/Attraccess/pull/594))
- **deps:** update dependency @golevelup/ts-jest to ^0.7.0 ([#661](https://github.com/Attraccess/Attraccess/pull/661))
- **deps:** update dependency @khmyznikov/pwa-install to ^0.6.0 ([#664](https://github.com/Attraccess/Attraccess/pull/664))
- **deps:** update dependency lucide-react to ^0.577.0 ([#669](https://github.com/Attraccess/Attraccess/pull/669))
- **deps:** update dependency express to v4.22.1 ([#668](https://github.com/Attraccess/Attraccess/pull/668))
- **deps:** update nx monorepo to v22.7.0 ([#670](https://github.com/Attraccess/Attraccess/pull/670))
- **deps:** update dependency class-validator to ^0.15.0 ([#666](https://github.com/Attraccess/Attraccess/pull/666))
- **deps:** update esptool-js to v0.6.0 and @sumup/sdk to v0.1.0 with breaking change fixes ([6edb963](https://github.com/Attraccess/Attraccess/commit/6edb963))
- **deps:** replace nanoid with crypto built-ins, upgrade mjml to v5, remove mjml-react ([c27b8bb](https://github.com/Attraccess/Attraccess/commit/c27b8bb))
- **deps:** update nx monorepo to v22.7.1 ([583863e](https://github.com/Attraccess/Attraccess/commit/583863e))
- **deps:** merge PR #685 - esptool-js v0.6.0 and @sumup/sdk v0.1.0 breaking changes ([#685](https://github.com/Attraccess/Attraccess/issues/685))
- **deps:** update dependency @types/uuid to v11 ([ad8a8d0](https://github.com/Attraccess/Attraccess/commit/ad8a8d0))
- **deps:** update dependency @golevelup/ts-jest to v3 ([77c82be](https://github.com/Attraccess/Attraccess/commit/77c82be))
- **deps:** update dependency @dagrejs/dagre to v3 ([71c4866](https://github.com/Attraccess/Attraccess/commit/71c4866))
- **deps:** update dependency balena-sdk to v23 ([bba9176](https://github.com/Attraccess/Attraccess/commit/bba9176))
- **deps:** update dependency @heroui/react to v3 ([08e6149](https://github.com/Attraccess/Attraccess/commit/08e6149))
- **deps:** update dependency @heroui/react to v3" ([#755](https://github.com/Attraccess/Attraccess/pull/755))
- **deps:** update typeorm to v0.3.29 with patch rename ([#765](https://github.com/Attraccess/Attraccess/issues/765))
- **forms:** fix zod v4.4 compat for optional numeric fields ([4a6880f](https://github.com/Attraccess/Attraccess/commit/4a6880f))
- **frontend:** add i18n key for delete-account-confirmation template ([#891](https://github.com/Attraccess/Attraccess/pull/891))
- **metrics:** avoid double-wrapping cached QueryRunner (ATT-282) ([#782](https://github.com/Attraccess/Attraccess/pull/782))
- **metrics:** apply WsMetricsInterceptor on Attractap gateway ([#788](https://github.com/Attraccess/Attraccess/pull/788))
- **react-query-client:** patch codegen to use numeric page params ([b8f5084](https://github.com/Attraccess/Attraccess/commit/b8f5084))
- **release:** move git config to top-level release.git for nx release ([657f460](https://github.com/Attraccess/Attraccess/commit/657f460))
- **security:** update path-to-regexp to 0.1.13 (CVE-2026-4867) + batch patch updates ([0896029](https://github.com/Attraccess/Attraccess/commit/0896029))
- **tests:** update dns-server spec to match network_mode: host docker-compose changes ([#558](https://github.com/Attraccess/Attraccess/issues/558), [#559](https://github.com/Attraccess/Attraccess/issues/559))
- **types:** upgrade @types/node to v24 and update tsconfig lib to es2022 ([62c5141](https://github.com/Attraccess/Attraccess/commit/62c5141))

### ❤️ Thank You

- Claude
- Claude Opus 4.6
- Claude Opus 4.6 (1M context)
- Claude Opus 4.7
- Claude Opus 4.7 (1M context)
- Claude Opus 4.8 (1M context)
- Jan Jaap @jappyjan

## 1.5.2 (2026-04-02)

### 🚀 Features

- upgrade notes in docs ([#439](https://github.com/Attraccess/Attraccess/pull/439))
- fixed id/guid for docker user in non-system range ([#458](https://github.com/Attraccess/Attraccess/pull/458))
- enhance SSO provider setup ([#457](https://github.com/Attraccess/Attraccess/pull/457))
- contextplus ([#474](https://github.com/Attraccess/Attraccess/pull/474))
- test SMTP email settings before saving (ATT-246) ([#483](https://github.com/Attraccess/Attraccess/pull/483))
- adapt attractap firmware to waveshare v4 hardware ([#478](https://github.com/Attraccess/Attraccess/pull/478), [#15](https://github.com/Attraccess/Attraccess/issues/15), [#16](https://github.com/Attraccess/Attraccess/issues/16), [#18](https://github.com/Attraccess/Attraccess/issues/18), [#19](https://github.com/Attraccess/Attraccess/issues/19), [#22](https://github.com/Attraccess/Attraccess/issues/22), [#24](https://github.com/Attraccess/Attraccess/issues/24), [#5](https://github.com/Attraccess/Attraccess/issues/5), [#13](https://github.com/Attraccess/Attraccess/issues/13), [#6](https://github.com/Attraccess/Attraccess/issues/6), [#17](https://github.com/Attraccess/Attraccess/issues/17), [#20](https://github.com/Attraccess/Attraccess/issues/20))
- add local DNS server with web admin UI to Balena compose (ATT-264) ([#547](https://github.com/Attraccess/Attraccess/pull/547))

### 🩹 Fixes

- resolve i18n routing bug causing 404 by doubled language prefix ([085bdaa](https://github.com/Attraccess/Attraccess/commit/085bdaa))
- use direct CSS rule for cover background image ([3848a9a](https://github.com/Attraccess/Attraccess/commit/3848a9a))
- match docs theme to app styling with proper dark/light mode contrast ([5f548bd](https://github.com/Attraccess/Attraccess/commit/5f548bd))
- make cover page fullscreen with background image and parallax ([546489f](https://github.com/Attraccess/Attraccess/commit/546489f))
- remove background-attachment fixed to prevent scroll stutter ([c5a0e35](https://github.com/Attraccess/Attraccess/commit/c5a0e35))
- move GitHub corner to top-left to avoid overlap with toggles ([91febd2](https://github.com/Attraccess/Attraccess/commit/91febd2))
- add pointer cursor to collapsible sidebar nav items ([03ecab2](https://github.com/Attraccess/Attraccess/commit/03ecab2))
- stop logging raw email verification token ([#480](https://github.com/Attraccess/Attraccess/pull/480))
- close mobile sidebar on route navigation ([#479](https://github.com/Attraccess/Attraccess/pull/479))
- use cdxgen for SBOM generation in DependencyTrack workflow ([#532](https://github.com/Attraccess/Attraccess/pull/532))
- DependencyTrack SBOM upload and pin cdxgen dependency ([#533](https://github.com/Attraccess/Attraccess/pull/533))
- use PUT with base64-encoded JSON for DependencyTrack upload ([#534](https://github.com/Attraccess/Attraccess/pull/534))
- write SBOM payload to file to avoid argument list too long ([#535](https://github.com/Attraccess/Attraccess/pull/535))
- avoid shell arg expansion for large base64 SBOM payload ([#536](https://github.com/Attraccess/Attraccess/pull/536))
- replace broken SBOM generation with CycloneDX + official DependencyTrack upload action ([#539](https://github.com/Attraccess/Attraccess/pull/539))
- use native pnpm sbom for SBOM generation ([#540](https://github.com/Attraccess/Attraccess/pull/540))
- use cdxgen for SBOM generation ([#544](https://github.com/Attraccess/Attraccess/pull/544))
- **deps:** update dependency nodemailer to v8 [security] ([#517](https://github.com/Attraccess/Attraccess/pull/517))
- **release:** remove manifestRootsToUpdate override and sync lib versions ([#551](https://github.com/Attraccess/Attraccess/pull/551))
- **release:** use setup-node registry-url + NODE_AUTH_TOKEN for npm auth ([#552](https://github.com/Attraccess/Attraccess/pull/552))

### ❤️ Thank You

- Claude
- Claude Opus 4.6
- Claude Opus 4.6 (1M context)
- Claude Sonnet 4.6
- Cursor @cursoragent
- Jan Jaap @jappyjan

## 1.5.1 (2026-03-25)

### 🩹 Fixes

- allow SSO re-linking when provider issuer URL changes (ATT-259) ([f0250c2](https://github.com/Attraccess/Attraccess/commit/f0250c2))

### ❤️ Thank You

- Jan Jaap

## 1.5.0 (2026-03-09)

### 🚀 Features

- **ATT-254:** propagate flow errors to Attractap on door actions ([#484](https://github.com/Attraccess/Attraccess/pull/484))
- **ATT-246:** test SMTP email settings before saving ([#483](https://github.com/Attraccess/Attraccess/pull/483))
- **ATT-250:** OIDC/SSO use state parameter instead of redirect ([#469](https://github.com/Attraccess/Attraccess/pull/469))
- ContextPlus integration ([#474](https://github.com/Attraccess/Attraccess/pull/474))
- enhance SSO provider setup ([#457](https://github.com/Attraccess/Attraccess/pull/457))
- **ATT-48:** resource maintenance schedules ([#464](https://github.com/Attraccess/Attraccess/pull/464))
- sensitive data encryption ([#448](https://github.com/Attraccess/Attraccess/pull/448))
- flows import/export ([#442](https://github.com/Attraccess/Attraccess/pull/442))
- fixed id/guid for docker user in non-system range ([#458](https://github.com/Attraccess/Attraccess/pull/458))
- mapped SSO permissions disable ([#444](https://github.com/Attraccess/Attraccess/pull/444))
- settings database migration ([#445](https://github.com/Attraccess/Attraccess/pull/445))
- React compiler migration ([#446](https://github.com/Attraccess/Attraccess/pull/446))
- upgrade notes in docs ([#439](https://github.com/Attraccess/Attraccess/pull/439))

### 🩹 Fixes

- close mobile sidebar on route navigation ([#479](https://github.com/Attraccess/Attraccess/pull/479))
- stop logging raw email verification token ([#480](https://github.com/Attraccess/Attraccess/pull/480))
- add pointer cursor to collapsible sidebar nav items ([03ecab2](https://github.com/Attraccess/Attraccess/commit/03ecab2))
- move GitHub corner to top-left to avoid overlap with toggles ([91febd2](https://github.com/Attraccess/Attraccess/commit/91febd2))
- remove background-attachment fixed to prevent scroll stutter ([c5a0e35](https://github.com/Attraccess/Attraccess/commit/c5a0e35))
- match docs theme to app styling with proper dark/light mode contrast ([5f548bd](https://github.com/Attraccess/Attraccess/commit/5f548bd))
- resolve i18n routing bug causing 404 by doubled language prefix ([085bdaa](https://github.com/Attraccess/Attraccess/commit/085bdaa))
- user invite popup state ([#440](https://github.com/Attraccess/Attraccess/pull/440))

### 📖 Documentation

- add v2 documentation with docsify ([#476](https://github.com/Attraccess/Attraccess/pull/476))
- add mobile responsive design for documentation site ([#477](https://github.com/Attraccess/Attraccess/pull/477))

### 🔧 Maintenance

- split and parallelize GitHub Actions pipelines ([#482](https://github.com/Attraccess/Attraccess/pull/482))
- run pnpm precommit and enforce clean tree ([#450](https://github.com/Attraccess/Attraccess/pull/450))
- update API client, OpenAPI config, README, and add dev setup scripts ([#468](https://github.com/Attraccess/Attraccess/pull/468))

### ❤️ Thank You

- Jan Jaap @jappyjan

## 1.4.0 (2026-01-31)

### 🚀 Features

- **ATT-184:** SSO SAML support v2 ([#354](https://github.com/Attraccess/Attraccess/pull/354))
- SSO integration enrichment ([#422](https://github.com/Attraccess/Attraccess/pull/422))
- SSO username conversion ([#425](https://github.com/Attraccess/Attraccess/pull/425))
- **ATT-241:** upgrade SSO users from v1.2 requires linking via password ([#438](https://github.com/Attraccess/Attraccess/pull/438))
- 2FA requirement and setup ([#420](https://github.com/Attraccess/Attraccess/pull/420))
- account 2FA security ([#408](https://github.com/Attraccess/Attraccess/pull/408))
- **ATT-169:** project tracking — change project of a usage session after it finished ([#411](https://github.com/Attraccess/Attraccess/pull/411))
- **ATT-202:** Attractap Lite ([#394](https://github.com/Attraccess/Attraccess/pull/394))
- **ATT-138:** NFC reader ethernet support ([#392](https://github.com/Attraccess/Attraccess/pull/392))
- NFC reader wifi dropdown ([#413](https://github.com/Attraccess/Attraccess/pull/413))
- user email change ([#414](https://github.com/Attraccess/Attraccess/pull/414))
- metadata per resource ([#409](https://github.com/Attraccess/Attraccess/pull/409))
- **ATT-32:** delete user ([#404](https://github.com/Attraccess/Attraccess/pull/404))

### 🩹 Fixes

- Dockerfile user security ([#416](https://github.com/Attraccess/Attraccess/pull/416))

### 🔧 Maintenance

- **ATT-205:** restructured and flattened the main navigation system ([#391](https://github.com/Attraccess/Attraccess/pull/391))
- optimised the beeping patterns of Attractap to be more intuitive ([#398](https://github.com/Attraccess/Attraccess/pull/398))
- higher contrast UI improvements ([#397](https://github.com/Attraccess/Attraccess/pull/397))
- pin GitHub Actions to commit SHAs ([#417](https://github.com/Attraccess/Attraccess/pull/417))
- migration rollback test ([#410](https://github.com/Attraccess/Attraccess/pull/410))

### ❤️ Thank You

- Jan Jaap @jappyjan

## 1.3.0 (2025-12-21)

### 🚀 Features

- balena device controls ([465500c](https://github.com/Attraccess/Attraccess/commit/465500c))
- **ATT-127:** include form submissions and project in flow payloads ([#346](https://github.com/Attraccess/Attraccess/pull/346))
- **ATT-163:** admins can invite users ([#299](https://github.com/Attraccess/Attraccess/pull/299))
- **ATT-164:** prevent sso users from changing/setting their password ([#357](https://github.com/Attraccess/Attraccess/pull/357))
- **ATT-170:** project monitoring and details page/dashboard ([#320](https://github.com/Attraccess/Attraccess/pull/320))
- **ATT-171:** share/invite other users into your projects ([#322](https://github.com/Attraccess/Attraccess/pull/322))
- **ATT-192:** QoS as select and allow mqtt server creation from mqtt send node ([#365](https://github.com/Attraccess/Attraccess/pull/365))
- **ATT-198:** set email verified to true for sso users ([#347](https://github.com/Attraccess/Attraccess/pull/347))
- **ATT-203:** resource inactivity tracking and automation ([#366](https://github.com/Attraccess/Attraccess/pull/366))
- **ATT-215:** add success and error messages for permissions update in user management ([#383](https://github.com/Attraccess/Attraccess/pull/383))
- **ATT-216:** enhance registration and invite user forms with username validation and guidance ([#382](https://github.com/Attraccess/Attraccess/pull/382))
- **ATT-25:** show user permissions in user list ([#364](https://github.com/Attraccess/Attraccess/pull/364))
- **ATT-40:** invite users via csv upload ([#355](https://github.com/Attraccess/Attraccess/pull/355))
- **ATT-40:** disable password login and username change for sso user… ([#356](https://github.com/Attraccess/Attraccess/pull/356))

### 🩹 Fixes

- rename BALENA_API_TOKEN to MY_BALENA_API_TOKEN because balena forbids setting envs with BALENA prefix ([1368131](https://github.com/Attraccess/Attraccess/commit/1368131))
- attractap failing to start resource ([#345](https://github.com/Attraccess/Attraccess/pull/345))
- usage session and flows no longer create a race condition ([#359](https://github.com/Attraccess/Attraccess/pull/359))
- end all resource sessions component was broken ([#375](https://github.com/Attraccess/Attraccess/pull/375))
- **ATT-173:** case insensitive usernames ([#352](https://github.com/Attraccess/Attraccess/pull/352))
- **ATT-187:** remove unused column references expiresAt ([#330](https://github.com/Attraccess/Attraccess/pull/330))
- **ATT-188:** allow introducers of a resource to stop other users ses… ([#351](https://github.com/Attraccess/Attraccess/pull/351))
- **ATT-189:** forms boolean fields render as one switch in frontend ([#332](https://github.com/Attraccess/Attraccess/pull/332))
- **ATT-190:** attractap not updating and ssl with forms/projects OOM ([#334](https://github.com/Attraccess/Attraccess/pull/334))
- **ATT-197:** ensure user permissions are updated from admin ui ([#350](https://github.com/Attraccess/Attraccess/pull/350))
- **ATT-207:** ensure topup dialog popsup when user reaches INSUFFICIENT_BALANCE error ([#374](https://github.com/Attraccess/Attraccess/pull/374))
- **ATT-214:** add translations for UserEmailNotVerifiedException and implement corresponding unit test ([#381](https://github.com/Attraccess/Attraccess/pull/381))
- **Attractap:** increase version number ([#343](https://github.com/Attraccess/Attraccess/pull/343))

### ❤️ Thank You

- Jan Jaap @jappyjan

## 1.2.0 (2025-11-12)

### 🚀 Features

- nfc readers, finally a working version ([#231](https://github.com/Attraccess/Attraccess/pull/231), [#232](https://github.com/Attraccess/Attraccess/issues/232))
- **ATT-131:** flow node to wait for mqtt message ([#273](https://github.com/Attraccess/Attraccess/pull/273))
- **ATT-134:** auto downscale resource images before upload ([#269](https://github.com/Attraccess/Attraccess/pull/269))
- **ATT-148:** show resource usage status in resource list and locksc… ([#250](https://github.com/Attraccess/Attraccess/pull/250))
- **ATT-149:** add Balena manual release workflow and update .env.docker-compose for Hetzner DNS Updater ([#254](https://github.com/Attraccess/Attraccess/pull/254))
- **ATT-151:** resource flow node to end usage session ([#275](https://github.com/Attraccess/Attraccess/pull/275))
- **ATT-152:** open node editor on double click ([#267](https://github.com/Attraccess/Attraccess/pull/267))
- **ATT-154:** trigger sumup topup from nfc reader ([#266](https://github.com/Attraccess/Attraccess/pull/266))
- **ATT-158:** custom error flow node ([#286](https://github.com/Attraccess/Attraccess/pull/286))
- **ATT-161:** mqtt qos and retain settings per resource flow node ([#282](https://github.com/Attraccess/Attraccess/pull/282))
- **ATT-96:** make scopes and claim paths configurable for OIDC ([#279](https://github.com/Attraccess/Attraccess/pull/279))

### 🩹 Fixes

- use correct permissions on nfc reader for resource introductions ([#245](https://github.com/Attraccess/Attraccess/pull/245))
- allow ssl connection without synced time ([#264](https://github.com/Attraccess/Attraccess/pull/264))
- **AT-147:** trim username on create, update and login ([#262](https://github.com/Attraccess/Attraccess/pull/262))
- **ATT-146:** do not send resource usage receipt email when usage costs nothing ([#251](https://github.com/Attraccess/Attraccess/pull/251))
- **ATT-157:** ensure topic scubscriptions on mqtt server re-connect ([#274](https://github.com/Attraccess/Attraccess/pull/274))
- **ATT-165:** better api error handling and user api error toasts ([#297](https://github.com/Attraccess/Attraccess/pull/297))
- **ATT-166:** correctly pass flow button id to api from nfc readers ([#298](https://github.com/Attraccess/Attraccess/pull/298))
- **ATT-97:** takeover billing and flow handling correctified ([#270](https://github.com/Attraccess/Attraccess/pull/270))

### ❤️ Thank You

- Jan Jaap @jappyjan

## 1.1.0 (2025-10-09)

### 🚀 Features

- restructure sidebar to include feedback group with report bug a… ([#173](https://github.com/Attraccess/Attraccess/pull/173))
- enhance billing information updates and user context in layout and resource billing components ([#174](https://github.com/Attraccess/Attraccess/pull/174))
- **ATT-108:** payment transactions csv export ([#185](https://github.com/Attraccess/Attraccess/pull/185))
- **ATT-110:** refactor billing items logic so we can use it before e… ([#189](https://github.com/Attraccess/Attraccess/pull/189))
- **ATT-113:** added billing factor, restructured billing navigation ([#221](https://github.com/Attraccess/Attraccess/pull/221))
- **ATT-119:** added duplicati to balena compose ([#213](https://github.com/Attraccess/Attraccess/pull/213))
- **ATT-120:** add zigbee2mqtt to compose ([#206](https://github.com/Attraccess/Attraccess/pull/206))
- **ATT-122:** implement reliable server availability hook and update server not available component ([#215](https://github.com/Attraccess/Attraccess/pull/215))
- **ATT-129:** refund billing transactions ([#225](https://github.com/Attraccess/Attraccess/pull/225))
- **ATT-68:** flow nodes are 100% defined in backend, frontend builds… ([#147](https://github.com/Attraccess/Attraccess/pull/147))
- **ATT-76:** allow introducers and managers to stop usage sessions of other users ([#144](https://github.com/Attraccess/Attraccess/pull/144))
- **ATT-87:** resource usage billing transaction summary email ([#224](https://github.com/Attraccess/Attraccess/pull/224))
- **ATT-93:** support sumup payment terminals for credit topups ([#165](https://github.com/Attraccess/Attraccess/pull/165))

### 🩹 Fixes

- ci release wrong links ([#114](https://github.com/Attraccess/Attraccess/pull/114))
- replaced i18next with custom translation hooks and components ([#156](https://github.com/Attraccess/Attraccess/pull/156))
- mqtt flow node editor broke because of undefined default server key ([#172](https://github.com/Attraccess/Attraccess/pull/172))
- balena versioning using semver compliant versions ([#212](https://github.com/Attraccess/Attraccess/pull/212))
- **ATT-101:** ensure translations do not cause unnecessary rerender ([#183](https://github.com/Attraccess/Attraccess/pull/183))
- **ATT-71:** mqtt edit page works again, removed no longer existing r… ([#133](https://github.com/Attraccess/Attraccess/pull/133))
- **ATT-72:** use select component correctly and use correct translation keys ([#143](https://github.com/Attraccess/Attraccess/pull/143))
- **ATT-74:** introducers of a group can introduce to single resources of that group ([#127](https://github.com/Attraccess/Attraccess/pull/127))
- **ATT-98:** use soft-delete for resources ([#217](https://github.com/Attraccess/Attraccess/pull/217))

### ❤️ Thank You

- Jan Jaap @jappyjan

# 1.0.0 (2025-08-17)

### 🚀 Features

- optmized group creation and resource group table ux ([#101](https://github.com/Attraccess/Attraccess/pull/101))
- **ATT-21:** if flow node, refactored node structure ([#99](https://github.com/Attraccess/Attraccess/pull/99))
- **ATT-24:** when creating a group open it immedaitely, also give visual clu… ([#83](https://github.com/Attraccess/Attraccess/pull/83))
- **ATT-49:** limit active nfc cards to 1 and allow user to deactivate/activate cards ([#97](https://github.com/Attraccess/Attraccess/pull/97))
- **ATT-56:** send email notification on password changed ([#90](https://github.com/Attraccess/Attraccess/pull/90))
- **ATT-57:** banner showing all active usage sessions ([#91](https://github.com/Attraccess/Attraccess/pull/91))
- **ATT-66:** show a button to clear search and filter if current set… ([#95](https://github.com/Attraccess/Attraccess/pull/95))
- **ATT-8:** allow deletion of attractap readers ([#98](https://github.com/Attraccess/Attraccess/pull/98))

### 🩹 Fixes

- service worker now auto install, auto activates and auto reloads correctly ([#96](https://github.com/Attraccess/Attraccess/pull/96))
- ci build failed for attractap firmware ([#102](https://github.com/Attraccess/Attraccess/pull/102))
- ci release failing ([#105](https://github.com/Attraccess/Attraccess/pull/105))
- ci release failing ([#106](https://github.com/Attraccess/Attraccess/pull/106))
- ci release failing ([#108](https://github.com/Attraccess/Attraccess/pull/108))
- ci release failing ([#109](https://github.com/Attraccess/Attraccess/pull/109))
- ci release failing ([#110](https://github.com/Attraccess/Attraccess/pull/110))
- ci release failing ([#111](https://github.com/Attraccess/Attraccess/pull/111))
- ci release failing ([#113](https://github.com/Attraccess/Attraccess/pull/113))
- **ATT-11:** prevent resource image deletion on resource data update ([#88](https://github.com/Attraccess/Attraccess/pull/88))
- **ATT-17:** missing translations in mail templates ([#86](https://github.com/Attraccess/Attraccess/pull/86))
- **ATT-20:** add missing translating for signingIn (login button in progress label) ([#84](https://github.com/Attraccess/Attraccess/pull/84))

### ❤️ Thank You

- Jan Jaap @jappyjan

## 1.0.0-beta-1 (2025-08-16)

### 🚀 Features

- add admin ability to directly set user passwords ([#63](https://github.com/Attraccess/Attraccess/pull/63))
- changelog automations and page ([f96dc14](https://github.com/Attraccess/Attraccess/commit/f96dc14))
- **ATT-31:** change username ([#77](https://github.com/Attraccess/Attraccess/pull/77))
- **ATT-61:** licensing ([#76](https://github.com/Attraccess/Attraccess/pull/76))
- **att-45:** api and frontend implementation of basic manual mainten… ([#68](https://github.com/Attraccess/Attraccess/pull/68))
- **att-55:** fixed base attractap firmware ([#71](https://github.com/Attraccess/Attraccess/pull/71))
- **attractap:** touch reader, web flasher, serial terminal and serial configurator ([#7](https://github.com/Attraccess/Attraccess/pull/7))
- **cookie-auth:** use config service and env configurations ([#5](https://github.com/Attraccess/Attraccess/pull/5))
- **nx-cloud:** setup nx cloud workspace ([#60](https://github.com/Attraccess/Attraccess/pull/60))

### 🩹 Fixes

- fallback for legacy env vars did not work ([#6](https://github.com/Attraccess/Attraccess/pull/6))
- maintenance is now editable ([#79](https://github.com/Attraccess/Attraccess/pull/79))
- **GH-10:** re-added nojekyll file to prevent GH from ignoring files starting with \_ ([#11](https://github.com/Attraccess/Attraccess/pull/11))

### ❤️ Thank You

- Jan Jaap @jappyjan
