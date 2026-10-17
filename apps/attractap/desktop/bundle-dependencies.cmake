if(NOT DEFINED APP_BUNDLE OR NOT IS_DIRECTORY "${APP_BUNDLE}")
    message(FATAL_ERROR "APP_BUNDLE must name the built Attractap .app")
endif()

include(BundleUtilities)
set(BU_CHMOD_BUNDLE_ITEMS ON)
fixup_bundle("${APP_BUNDLE}" "" "")
verify_app("${APP_BUNDLE}")
