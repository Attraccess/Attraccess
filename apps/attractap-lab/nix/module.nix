{ config, lib, pkgs, ... }:
let
  inherit (lib) mkOption mkEnableOption mkIf mkMerge types;
  cfg = config.services.attractap-lab;
  yaml = pkgs.formats.yaml { };
  exporterConfig = yaml.generate "attractap-exporter.yaml" cfg.exporter.settings;
  placesConfig = yaml.generate "attractap-places.yaml" { places = cfg.coordinator.places; };
  labgrid = pkgs.python3Packages.labgrid;
  tools = [ cfg.package labgrid pkgs.ser2net pkgs.esptool pkgs.ffmpeg pkgs.openssh pkgs.uhubctl pkgs.usbutils pkgs.v4l-utils ] ++ cfg.extraPackages;
  syncPlaces = pkgs.writeShellScript "labgrid-sync-places" ''
    exec ${pkgs.python3.withPackages (ps: [ ps.labgrid ])}/bin/python \
      ${labgrid.src}/contrib/sync-places.py \
      --coordinator ${lib.escapeShellArg cfg.coordinator.syncAddress} sync ${placesConfig}
  '';
in {
  options.services.attractap-lab = {
    enable = mkEnableOption "the shared Attractap hardware lab";
    package = mkOption {
      type = types.package;
      default = pkgs.callPackage ./package.nix { };
      description = "Attractap lab client and driver package.";
    };
    extraPackages = mkOption {
      type = types.listOf types.package;
      default = [ ];
      description = "Additional hardware tools available to the exporter and SSH sessions.";
    };
    extraUdevRules = mkOption {
      type = types.lines;
      default = "";
      description = "Device-specific permissions, for example MODE=0660 and GROUP=labgrid for a USB power hub. Serial/video devices already use dialout/video.";
    };
    ssh.authorizedKeys = mkOption {
      type = types.listOf types.str;
      default = [ ];
      description = "SSH keys for labgrid's remote file cache and flashing. These keys grant hardware access; restrict SSH to the lab's trusted network.";
    };
    coordinator = {
      enable = mkEnableOption "the labgrid coordinator";
      listenAddress = mkOption { type = types.str; default = "127.0.0.1:20408"; description = "Coordinator listen HOST:PORT. No ports are opened automatically."; };
      syncAddress = mkOption { type = types.str; default = "127.0.0.1:20408"; description = "Local client HOST:PORT for synchronizing places."; };
      places = mkOption {
        type = types.nullOr yaml.type;
        default = null;
        description = "Declarative places using upstream sync-places schema (matches/tags). Null leaves places unmanaged; a value makes this configuration authoritative, removing other places. Deploy only while the lab is idle.";
      };
    };
    exporter = {
      enable = mkEnableOption "the labgrid exporter";
      name = mkOption { type = types.str; default = config.networking.hostName; description = "Public exporter name used by place matches."; };
      hostname = mkOption { type = types.str; default = config.networking.hostName; description = "Reachable hostname advertised for serial, SSH and other exported resources."; };
      coordinatorAddress = mkOption { type = types.str; default = "127.0.0.1:20408"; description = "Coordinator HOST:PORT (labgrid gRPC address)."; };
      settings = mkOption { type = yaml.type; default = { }; description = "Native labgrid exporter YAML: one resource group per reader. Use stable USB properties in match expressions."; };
    };
    cameras = mkOption {
      default = { };
      description = "uStreamer camera services; use stable /dev/v4l/by-id device paths.";
      type = types.attrsOf (types.submodule {
        options = {
          device = mkOption { type = types.str; description = "Video device path."; };
          listenAddress = mkOption { type = types.str; default = "127.0.0.1"; description = "HTTP listen address; configure trusted-network access in the host."; };
          port = mkOption { type = types.port; description = "Unique camera HTTP port."; };
          extraArgs = mkOption { type = types.listOf types.str; default = [ "--format=MJPEG" "--desired-fps=5" ]; description = "Additional uStreamer arguments, e.g. resolution supported by the webcam."; };
        };
      });
    };
  };

  config = mkIf cfg.enable (mkMerge [ {
    assertions = [ {
      assertion = cfg.coordinator.enable || cfg.exporter.enable || cfg.cameras != { };
      message = "Enable an Attractap lab coordinator, exporter or camera.";
    } {
      assertion = cfg.coordinator.places == null || cfg.coordinator.enable;
      message = "Declarative Attractap lab places require the local coordinator.";
    } {
      assertion = builtins.length (lib.unique (map (camera: "${camera.listenAddress}:${toString camera.port}") (lib.attrValues cfg.cameras))) == builtins.length (lib.attrNames cfg.cameras);
      message = "Attractap lab cameras must have distinct HTTP listen addresses/ports.";
    } ];
    users.groups.labgrid = { };
    users.users.labgrid = {
      isSystemUser = true;
      group = "labgrid";
      extraGroups = [ "dialout" "video" ];
      home = "/var/lib/labgrid";
      createHome = true;
      shell = pkgs.bashInteractive;
      openssh.authorizedKeys.keys = cfg.ssh.authorizedKeys;
      packages = tools;
    };
    # SSH sessions must find esptool without relying on interactive shell setup.
    environment.systemPackages = tools;
    services.openssh = mkIf (cfg.ssh.authorizedKeys != [ ]) {
      enable = true;
      openFirewall = lib.mkDefault false;
    };
    services.udev.extraRules = cfg.extraUdevRules;
    systemd.tmpfiles.rules = [
      "d /var/lib/labgrid 0750 labgrid labgrid -"
      "d /var/cache/labgrid 2770 labgrid labgrid 7d"
    ];
  }
  (mkIf cfg.coordinator.enable {
    systemd.services.attractap-lab-coordinator = {
      description = "Attractap labgrid coordinator";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      environment.PYTHONUNBUFFERED = "1";
      serviceConfig = {
        ExecStart = "${labgrid}/bin/labgrid-coordinator --listen ${lib.escapeShellArg cfg.coordinator.listenAddress}";
        DynamicUser = true;
        StateDirectory = "attractap-lab-coordinator";
        WorkingDirectory = "/var/lib/attractap-lab-coordinator";
        Restart = "on-failure";
        RestartSec = 5;
      };
    };
  })
  (mkIf (cfg.coordinator.enable && cfg.coordinator.places != null) {
    systemd.services.attractap-lab-places = {
      description = "Synchronize declarative labgrid places";
      wantedBy = [ "multi-user.target" ];
      requires = [ "attractap-lab-coordinator.service" ];
      after = [ "attractap-lab-coordinator.service" ];
      partOf = [ "attractap-lab-coordinator.service" ];
      serviceConfig = {
        Type = "oneshot";
        DynamicUser = true;
        ExecStart = syncPlaces;
        RemainAfterExit = true;
        Restart = "on-failure";
        RestartSec = 5;
      };
    };
  })
  (mkIf cfg.exporter.enable {
    systemd.services.attractap-lab-exporter = {
      description = "Attractap labgrid hardware exporter";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ] ++ lib.optional cfg.coordinator.enable "attractap-lab-coordinator.service";
      path = tools;
      environment = { PYTHONUNBUFFERED = "1"; HOME = "/var/lib/labgrid"; };
      startLimitIntervalSec = 0;
      serviceConfig = {
        User = "labgrid";
        Group = "labgrid";
        WorkingDirectory = "/var/lib/labgrid";
        ExecStart = lib.escapeShellArgs [ "${labgrid}/bin/labgrid-exporter" "--isolated" "--name" cfg.exporter.name "--hostname" cfg.exporter.hostname "--coordinator" cfg.exporter.coordinatorAddress exporterConfig ];
        Restart = "always";
        RestartSec = 5;
      };
    };
  })
  { systemd.services = lib.mapAttrs' (name: camera: lib.nameValuePair "attractap-lab-camera-${name}" {
    description = "Attractap lab camera ${name}";
    wantedBy = [ "multi-user.target" ];
    after = [ "network.target" ];
    startLimitIntervalSec = 0;
    serviceConfig = {
      User = "labgrid";
      Group = "labgrid";
      ExecStart = lib.escapeShellArgs ([ "${pkgs.ustreamer}/bin/ustreamer" "--device" camera.device "--host" camera.listenAddress "--port" (toString camera.port) ] ++ camera.extraArgs);
      Restart = "always";
      RestartSec = 5;
      NoNewPrivileges = true;
    };
  }) cfg.cameras; }
  ]);
}
