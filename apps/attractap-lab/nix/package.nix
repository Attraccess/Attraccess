{ lib, python3Packages, makeWrapper, ffmpeg, esptool, openssh }:
python3Packages.buildPythonApplication {
  pname = "attraccess-attractap-lab";
  version = "0.1.0";
  pyproject = true;
  src = ../.;
  build-system = [ python3Packages.setuptools ];
  dependencies = with python3Packages; [ labgrid attrs pexpect ];
  nativeBuildInputs = [ makeWrapper ];
  # Both custom drivers use the executable supplied by the same Nix closure.
  makeWrapperArgs = [ "--prefix PATH : ${lib.makeBinPath [ ffmpeg esptool openssh ]}" ];
  nativeCheckInputs = [ python3Packages.pytestCheckHook python3Packages.labgrid ffmpeg openssh ];
  pythonImportsCheck = [ "attractap_lab" ];
  meta = {
    description = "Labgrid drivers and client tooling for the shared Attractap lab";
    platforms = lib.platforms.linux;
  };
}
