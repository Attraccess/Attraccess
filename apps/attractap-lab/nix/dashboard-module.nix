{ config, lib, pkgs, ... }:
let
  cfg = config.services.attractap-lab;
  dashboard = cfg.dashboard;
  packages = pkgs.callPackage ./dashboard.nix { };
  state = "/var/lib/attractap-lab-dashboard";
  waitForApi = pkgs.writeShellScript "labgrid-wait-for-dashboard" ''
    until ${packages.python}/bin/python -c '
    import json, urllib.request
    assert json.load(urllib.request.urlopen("http://127.0.0.1:${toString dashboard.apiPort}/api/health", timeout=2))["coordinator_connected"]
    '; do
      sleep 1
    done
  '';
in {
  options.services.attractap-lab.dashboard = {
    enable = lib.mkEnableOption "the labgrid web dashboard";
    listenAddress = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Dashboard HTTP bind address. Expose only to a trusted network; no firewall ports are opened automatically.";
    };
    port = lib.mkOption { type = lib.types.port; default = 8081; description = "Dashboard HTTP port."; };
    apiPort = lib.mkOption { type = lib.types.port; default = 8001; description = "Internal API loopback port."; };
  };

  config = lib.mkIf (cfg.enable && dashboard.enable) {
    assertions = [ {
      assertion = cfg.coordinator.enable;
      message = "The Attractap dashboard requires the local coordinator.";
    } {
      assertion = dashboard.port != dashboard.apiPort;
      message = "Attractap dashboard HTTP and API ports must differ.";
    } ];
    # The upstream API caches one gRPC stream and does not reconnect by itself.
    # Stop it when the coordinator disappears and pull it back on recovery.
    systemd.services.attractap-lab-coordinator.wants = [ "attractap-lab-dashboard.service" ];
    systemd.services.attractap-lab-dashboard = {
      description = "Labgrid web dashboard API";
      wantedBy = [ "multi-user.target" ];
      bindsTo = [ "attractap-lab-coordinator.service" ];
      after = [ "attractap-lab-coordinator.service" ];
      partOf = [ "attractap-lab-coordinator.service" ];
      path = [ pkgs.python3Packages.labgrid pkgs.openssh ];
      environment = {
        LG_COORDINATOR_ADDRESS = cfg.coordinator.syncAddress;
        LG_API_NAME = "attractap-dashboard";
        LG_DATABASE_PATH = "${state}/dashboard.db";
        LG_BOARD_CATALOG_PATH = "${state}/board-catalog.yaml";
        LG_RECORDINGS_DIR = "${state}/recordings";
        PYTHONUNBUFFERED = "1";
      };
      preStart = ''
        if [ ! -e ${state}/board-catalog.yaml ]; then
          printf 'boards: {}\n' > ${state}/board-catalog.yaml
        fi
        ${packages.python}/bin/python ${./dashboard-bootstrap.py}
      '';
      postStart = ''
        exec ${pkgs.coreutils}/bin/timeout 60 ${waitForApi}
      '';
      serviceConfig = {
        ExecStart = "${packages.python}/bin/uvicorn app.main:app --host 127.0.0.1 --port ${toString dashboard.apiPort}";
        DynamicUser = true;
        StateDirectory = "attractap-lab-dashboard";
        StateDirectoryMode = "0700";
        WorkingDirectory = state;
        UMask = "0077";
        Restart = "on-failure";
        RestartSec = 5;
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectHome = true;
        ProtectSystem = "strict";
      };
    };
    services.nginx = {
      enable = true;
      virtualHosts.attractap-lab-dashboard = {
        listen = [ { addr = dashboard.listenAddress; port = dashboard.port; } ];
        root = packages.web;
        locations."/".tryFiles = "$uri $uri/ /index.html";
        locations."/api/" = {
          proxyPass = "http://127.0.0.1:${toString dashboard.apiPort}";
          proxyWebsockets = true;
          recommendedProxySettings = true;
          extraConfig = "proxy_read_timeout 86400s;";
        };
      };
    };
  };
}
