"""
Pre-build script to patch PlatformIO environment for ESP32-P4.
ESP32-P4 uses RISC-V like ESP32-C3/C6, but the platform doesn't include it yet.
"""
Import("env")

board = env.BoardConfig()
mcu = board.get("build.mcu", "esp32")

if mcu == "esp32p4":
    # ESP32-P4 uses RISC-V toolchain like ESP32-C3/C6
    toolchain_arch = "riscv32-esp"
    platform = env.PioPlatform()
    
    env.Replace(
        AR="%s-elf-gcc-ar" % toolchain_arch,
        AS="%s-elf-as" % toolchain_arch,
        CC="%s-elf-gcc" % toolchain_arch,
        CXX="%s-elf-g++" % toolchain_arch,
        RANLIB="%s-elf-gcc-ranlib" % toolchain_arch,
        SIZETOOL="%s-elf-size" % toolchain_arch,
    )
    
    if env.get("PIOFRAMEWORK") == ["espidf"]:
        from os.path import join
        gdb_dir = platform.get_package_dir("tool-riscv32-esp-elf-gdb") or ""
        env.Replace(GDB=join(gdb_dir, "bin", "%s-elf-gdb" % toolchain_arch))
    
    print("Patched toolchain for ESP32-P4 (RISC-V)")
