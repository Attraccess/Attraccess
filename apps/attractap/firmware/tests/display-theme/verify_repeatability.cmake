cmake_minimum_required(VERSION 3.24)

foreach(run RANGE 1 2)
    execute_process(COMMAND "${HARNESS}" --output "${OUTPUT}/${run}"
        RESULT_VARIABLE result_${run} OUTPUT_VARIABLE report ERROR_VARIABLE errors TIMEOUT 25)
    # The separate display-theme-host test owns correctness. A stable regression
    # can still be repeatable; crashes, setup failures and differing outcomes cannot.
    if(NOT result_${run} STREQUAL "0" AND NOT result_${run} STREQUAL "1")
        message(FATAL_ERROR "Render run ${run} failed (${result_${run}}):\n${report}\n${errors}")
    endif()
    # Compare only the files this invocation reported, never stale output artifacts.
    string(REGEX MATCHALL "RENDER [a-z0-9-]+" frames_${run} "${report}")
endforeach()

if(NOT frames_1 OR NOT frames_1 STREQUAL frames_2 OR NOT result_1 STREQUAL result_2)
    message(FATAL_ERROR "Repeated runs did not render the same nonempty fixture set")
endif()
foreach(frame IN LISTS frames_1)
    string(REPLACE "RENDER " "" name "${frame}")
    file(SIZE "${OUTPUT}/1/${name}.rgba" size)
    if(NOT size EQUAL 921600)
        message(FATAL_ERROR "${name}: expected exactly 480 * 480 * 4 bytes")
    endif()
    file(SHA256 "${OUTPUT}/1/${name}.rgba" first)
    file(SHA256 "${OUTPUT}/2/${name}.rgba" second)
    if(NOT first STREQUAL second)
        message(FATAL_ERROR "${name}: nondeterministic renderer output")
    endif()
endforeach()
list(LENGTH frames_1 count)
message(STATUS "${count} RGBA frames have identical SHA-256 hashes across two fresh processes")
