# Share generated font inputs across ESP-IDF, desktop and the host renderer.
# All outputs stay in the build tree; generated C is never source-controlled.
function(attractap_latin1_fonts output_variable)
    find_program(ATTRACTAP_BASH bash REQUIRED)
    find_program(ATTRACTAP_NPX npx REQUIRED)
    find_program(ATTRACTAP_CURL curl REQUIRED)
    set(sizes 10 14 16 18 20 24 26 28 32 36)
    set(output_dir "${CMAKE_CURRENT_BINARY_DIR}/latin1-fonts")
    set(sources)
    foreach(size IN LISTS sizes)
        list(APPEND sources "${output_dir}/attractap_font_montserrat_latin1_${size}.c")
    endforeach()
    set(generator "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/generate_latin1_fonts.sh")
    add_custom_command(
        OUTPUT ${sources}
        COMMAND "${ATTRACTAP_BASH}" "${generator}" "${output_dir}" ${sizes}
        DEPENDS "${generator}" "${CMAKE_CURRENT_FUNCTION_LIST_FILE}"
        COMMENT "Generating ASCII and Latin-1 Montserrat fonts at original UI sizes"
        VERBATIM)
    set(${output_variable} ${sources} PARENT_SCOPE)
endfunction()
