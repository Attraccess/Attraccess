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
- **GH-10:** re-added nojekyll file to prevent GH from ignoring files starting with _ ([#11](https://github.com/Attraccess/Attraccess/pull/11))

### ❤️ Thank You

- Jan Jaap @jappyjan