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
