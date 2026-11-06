# Hardware-lab parking image for device-lab secure Touch V2 readers (ATT-1166):
# the Touch V2 parking image with the lab secure profile (Secure Boot v2 with the
# public lab keys, development-mode flash encryption). build_firmwares.py --lab
# signs it with the lab key and writes Intel HEX for `esptool write-flash
# --encrypt`; the lab janitor parks secure readers with it. Lab-only, never part
# of a release.
include("${CMAKE_CURRENT_LIST_DIR}/attractap-touch-v2-park.cmake")

set(ATTRACTAP_FIRMWARE_NAME "attractap_touch_v2_secure_lab_park")
set(ATTRACTAP_FIRMWARE_FRIENDLY_NAME "Attractap Touch V2 (V4) secure lab parking image")

set(ATTRACTAP_RELEASE OFF)
set(ATTRACTAP_SECURE_PROFILE "true")
set(ATTRACTAP_SECURE_LAB "true")
