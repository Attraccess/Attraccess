{ lib, fetchFromGitHub, buildNpmPackage, python3Packages }:
let
  src = fetchFromGitHub {
    owner = "tfcollins";
    repo = "labgrid-plugins";
    rev = "12982052854edd54ec82fa59d8b7a3460fe0ecaf";
    hash = "sha256-M/X8nPvw38kCW3dhwjCpdTaDGOvc/mz+BRzJxVKtimA=";
  };
in rec {
  api = python3Packages.buildPythonPackage {
    pname = "labgrid-coordinator-api";
    version = "0.1.0-unstable-2026-10-25";
    inherit src;
    sourceRoot = "source/coordinator/api";
    pyproject = true;
    patches = [ ./dashboard.patch ];
    patchFlags = [ "-p3" ];
    build-system = [ python3Packages.setuptools ];
    dependencies = with python3Packages; [
      fastapi uvicorn grpcio pydantic pydantic-settings aiosqlite
      passlib bcrypt authlib httpx itsdangerous labgrid
    ] ++ uvicorn.optional-dependencies.standard;
    # The VM test covers this API against our coordinator and nginx together.
    doCheck = false;
    pythonImportsCheck = [ "app.main" ];
    meta = {
      description = "Labgrid dashboard REST and WebSocket API";
      homepage = "https://github.com/tfcollins/labgrid-plugins";
      license = lib.licenses.asl20;
      platforms = lib.platforms.linux;
    };
  };
  python = python3Packages.python.withPackages (_: [ api ]);
  web = buildNpmPackage {
    pname = "labgrid-coordinator-dashboard";
    version = api.version;
    inherit src;
    sourceRoot = "source/coordinator/web";
    patches = [ ./dashboard-web.patch ];
    patchFlags = [ "-p3" ];
    npmDepsHash = "sha256-2Vq3dQ1q0I993VFnu0D6k7864GVaOhMqyRp+YSsBFuM=";
    installPhase = ''
      runHook preInstall
      mkdir -p "$out"
      cp -r dist/. "$out/"
      runHook postInstall
    '';
    meta = api.meta;
  };
}
