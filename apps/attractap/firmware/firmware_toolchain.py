"""ESP-IDF and esptool discovery and execution for firmware builds."""
import glob
import os
import re
import shlex
import shutil
import subprocess
import sys

FIRMWARE_DIR = os.path.dirname(os.path.abspath(__file__))

def resolve_python_command():
    """Pick a Python executable with fallback."""
    if sys.executable and os.path.exists(sys.executable):
        return sys.executable
    for cmd in ("python3", "python"):
        if shutil.which(cmd):
            return cmd
    return "python3"


def resolve_esptool_command():
    """Find a working esptool invocation without assuming pip-installed
    packages in the system Python (which e.g. NixOS does not even ship pip
    for). Preference order:
      1. esptool on PATH (pip --user install, nixpkgs esptool, sourced IDF env)
      2. ESP-IDF's own Python virtualenv — the IDF installer always bundles
         esptool there ($IDF_PYTHON_ENV_PATH, or ~/.espressif/python_env/*)
      3. the current interpreter (works when esptool is importable here)
    """
    for cmd in ("esptool.py", "esptool"):
        if shutil.which(cmd):
            return [cmd]

    idf_pythons = []
    env_path = os.environ.get("IDF_PYTHON_ENV_PATH")
    if env_path:
        idf_pythons.append(os.path.join(env_path, "bin", "python"))
    tools_path = os.environ.get("IDF_TOOLS_PATH", os.path.expanduser("~/.espressif"))
    idf_pythons.extend(sorted(
        glob.glob(os.path.join(tools_path, "python_env", "*", "bin", "python")),
        reverse=True,  # prefer the newest IDF env
    ))
    for python in idf_pythons:
        if os.path.exists(python):
            return [python, "-m", "esptool"]

    return [resolve_python_command(), "-m", "esptool"]


def generate_certificates(python_cmd):
    """Generate the adaptive-TLS CA certificate headers (src/certs/) before the
    build — the successor of the old PlatformIO `extra_scripts pre:` hook."""
    print("Generating CA certificates...")
    script = os.path.join(FIRMWARE_DIR, "tools", "build_individual_ca_certs.py")
    result = subprocess.run([python_cmd, script], cwd=FIRMWARE_DIR)
    if result.returncode != 0:
        print("Error: CA certificate generation failed")
        sys.exit(1)


def find_idf_export():
    """Locate ESP-IDF's export.sh so the script can bootstrap the IDF
    environment itself (nx invokes this script in a plain shell)."""
    candidates = [
        os.path.join(FIRMWARE_DIR, "..", "..", "..", ".tools", "esp-idf"),
        os.environ.get("IDF_PATH"),
        os.path.expanduser("~/esp/esp-idf"),
        os.path.expanduser("~/esp-idf"),
        "/opt/esp/idf",
    ]
    for candidate in candidates:
        if candidate and os.path.exists(os.path.join(candidate, "export.sh")):
            return os.path.join(candidate, "export.sh")
    return None


def run_idf(args):
    """Run idf.py from ESP-IDF's export.sh when it is available.

    idf.py refuses to run without cmake and ninja, but ESP-IDF's Linux
    installer marks both "on_request" (tools.json) and never installs them,
    assuming the system provides them — which e.g. NixOS does not. So when
    they are missing after export.sh, fetch them into the IDF tool set
    (~/.espressif) once and re-source.
    """
    export_script = find_idf_export()
    if not export_script:
        if shutil.which("idf.py") and shutil.which("cmake") and shutil.which("ninja"):
            return subprocess.run(["idf.py", *args]).returncode
        print("Error: idf.py needs cmake and ninja on PATH, and no ESP-IDF "
               "export.sh was found to install them from")
        return 1
    source_export = "source " + shlex.quote(export_script) + " >/dev/null"
    ensure_tools = (
        "if ! command -v cmake >/dev/null 2>&1 || ! command -v ninja >/dev/null 2>&1; then "
        'echo "cmake/ninja not found — installing them into the ESP-IDF tool set..."; '
        'python "$IDF_PATH/tools/idf_tools.py" install cmake ninja && ' + source_export + "; "
        "fi"
    )
    command = source_export + " && " + ensure_tools + " && idf.py " + " ".join(shlex.quote(a) for a in args)
    return subprocess.run(["bash", "-c", command]).returncode
