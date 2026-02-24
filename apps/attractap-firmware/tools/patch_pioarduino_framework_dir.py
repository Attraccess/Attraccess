"""
Pre-build script: patch pioarduino platform for ESP32-P4 when FRAMEWORK_DIR is None.

For ESP32-P4, framework-arduinoespressif32 may not be installed; pioarduino-build.py
lives in framework-arduinoespressif32-libs/{chip_variant}/. This script patches the
platform's arduino.py to use that path when FRAMEWORK_DIR is None.
"""
Import("env")
import os

board = env.BoardConfig()
mcu = board.get("build.mcu", "esp32")
if mcu == "esp32p4":
    platform = env.PioPlatform()
    platform_dir = platform.get_dir()
    arduino_py = os.path.join(platform_dir, "builder", "frameworks", "arduino.py")
    if os.path.isfile(arduino_py):
        with open(arduino_py, "r") as f:
            content = f.read()
        if "elif FRAMEWORK_LIB_DIR and chip_variant:" not in content:
            old = '    build_script_path = str(Path(FRAMEWORK_DIR) / "tools" / "pioarduino-build.py")\n    SConscript(build_script_path)'
            new = '''    if FRAMEWORK_DIR:
        build_script_path = str(Path(FRAMEWORK_DIR) / "tools" / "pioarduino-build.py")
    elif FRAMEWORK_LIB_DIR and chip_variant:
        # P4 and other libs-only chips: pioarduino-build.py is in framework-arduinoespressif32-libs/{chip_variant}/
        build_script_path = str(Path(FRAMEWORK_LIB_DIR) / chip_variant / "pioarduino-build.py")
    else:
        raise SystemExit(
            "Error: Cannot find pioarduino-build.py. "
            "FRAMEWORK_DIR (framework-arduinoespressif32) and "
            "FRAMEWORK_LIB_DIR (framework-arduinoespressif32-libs) are both None or chip_variant is empty."
        )
    SConscript(build_script_path)'''
            if old in content:
                content = content.replace(old, new)
                with open(arduino_py, "w") as f:
                    f.write(content)
                print("[patch_pioarduino_framework_dir] Patched platform arduino.py for ESP32-P4 FRAMEWORK_DIR fallback")
