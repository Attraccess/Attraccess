{ config, lib, pkgs, ... }:
let
  inherit (lib) mkOption mkEnableOption mkIf mkMerge types;
  cfg = config.services.attractap-lab;
  yaml = pkgs.formats.yaml { };
  exporterConfig = yaml.generate "attractap-exporter.yaml" cfg.exporter.settings;
  placesConfig = yaml.generate "attractap-places.yaml" { places = cfg.coordinator.places; };
  labgrid = pkgs.python3Packages.labgrid;
  tools = [ cfg.package labgrid pkgs.ser2net pkgs.esptool pkgs.ffmpeg pkgs.openssh pkgs.rsync pkgs.uhubctl pkgs.usbutils pkgs.v4l-utils ] ++ cfg.extraPackages;
  readerWifi = cfg.readerWifi;
  # Runs as root through sudo, so the credentials file can stay root-only.
  readerWifiRoot = pkgs.writeShellScript "attractap-lab-reader-wifi-root" ''
    exec ${cfg.package}/bin/attractap-lab-reader-wifi \
      --credentials ${lib.escapeShellArg readerWifi.credentialsFile} \
      --exporter-config ${exporterConfig} \
      --coordinator ${lib.escapeShellArg cfg.coordinator.syncAddress} \
      --labgrid-client ${labgrid}/bin/labgrid-client "$@"
  '';
  readerWifiCommand = pkgs.writeShellScriptBin "attractap-lab-reader-wifi" ''
    exec /run/wrappers/bin/sudo -n ${readerWifiRoot} "$@"
  '';
  waitForCoordinator = pkgs.writeShellScript "labgrid-wait-for-coordinator" ''
    until ${labgrid}/bin/labgrid-client -x ${lib.escapeShellArg cfg.coordinator.syncAddress} places >/dev/null; do
      ${pkgs.coreutils}/bin/sleep 1
    done
  '';
  syncPlaces = pkgs.writeShellScript "labgrid-sync-places" ''
    exec ${pkgs.python3.withPackages (ps: [ ps.labgrid ])}/bin/python \
      ${labgrid.src}/contrib/sync-places.py \
      --coordinator ${lib.escapeShellArg cfg.coordinator.syncAddress} sync ${placesConfig}
  '';
  janitor = cfg.janitor;
  janitorState = "/var/lib/attractap-lab-janitor";
  janitorEnvironment = yaml.generate "attractap-janitor-env.yaml" {
    imports = [ "attractap_lab.drivers" ];
    targets.main = {
      resources.RemotePlace.name = "set-per-place-by-the-janitor";
      # Explicit bindings: a place may also export an NFC emulator, which the
      # janitor must never erase.
      drivers = {
        ESPToolDriver.bindings.device = "USBFlashableDevice";
        SerialDriver.bindings.port = "USBSerialPort";
      };
    };
  };
  # The janitor reaches this host's exporter like any client: labgrid always
  # uses SSH for isolated resources. It gets a host-local key that never leaves
  # the machine, authorized only for the labgrid account (see authorizedKeysFiles).
  janitorSsh = pkgs.writeShellScript "attractap-lab-janitor-ssh" ''
    set -eu
    install -d -m 0700 "$HOME/.ssh" ${janitorState}/ssh
    if [ ! -e "$HOME/.ssh/id_janitor" ]; then
      ${pkgs.openssh}/bin/ssh-keygen -q -t ed25519 -N "" -C attractap-lab-janitor -f "$HOME/.ssh/id_janitor"
    fi
    install -m 0600 "$HOME/.ssh/id_janitor.pub" ${janitorState}/ssh/labgrid.authorized_keys
    names="localhost,127.0.0.1,::1,${cfg.exporter.hostname},${config.networking.hostName},$(${pkgs.python3}/bin/python3 -c 'import socket; print(socket.getfqdn())')"
    : > "$HOME/.ssh/known_hosts_janitor"
    for key in /etc/ssh/ssh_host_*_key.pub; do
      printf '%s %s\n' "$names" "$(cut -d' ' -f1,2 "$key")" >> "$HOME/.ssh/known_hosts_janitor"
    done
    cat > "$HOME/.ssh/config" <<'CONFIG'
    Host *
      IdentityFile ~/.ssh/id_janitor
      IdentitiesOnly yes
      UserKnownHostsFile ~/.ssh/known_hosts_janitor
      StrictHostKeyChecking yes
    CONFIG
  '';
in {
  imports = [ ./dashboard-module.nix ];
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
    readerApiRelay = {
      enable = mkEnableOption "letting lab users relay a test API to the readers' LAN with an SSH reverse tunnel (CI runners are not on that LAN)";
      port = mkOption {
        type = types.port;
        default = 20480;
        description = "The only port the labgrid account may forward. Open it to the readers' LAN in the host firewall; the module opens no ports.";
      };
    };
    readerWifi = {
      enable = mkEnableOption "sending the lab Wi-Fi credentials to claimed readers without revealing them to lab users";
      credentialsFile = mkOption {
        type = types.str;
        default = "/var/lib/attractap-lab/reader-wifi.json";
        description = ''Root-only JSON file {"ssid": "...", "password": "..."}. Provision it on the host, outside the Nix store.'';
      };
    };
    janitor = {
      enable = mkEnableOption "erasing and parking every reader as soon as it is released";
      images = mkOption {
        type = types.attrsOf types.path;
        default = { };
        example = lib.literalExpression ''{ "attractap-touch-v2" = ./attractap_touch_v2_park.bin; }'';
        description = "Parking images keyed by place `variant` tag, built with `pnpm nx run attractap-firmware:build-lab`. Places whose variant has no image are not managed.";
      };
      priority = mkOption {
        type = types.ints.positive;
        default = 1000;
        description = "Reservation priority; must exceed every client's (labgrid sessions use 0) so released readers are parked before anyone else gets them.";
      };
      maxParallel = mkOption { type = types.ints.positive; default = 2; description = "Readers parked at the same time."; };
      attempts = mkOption { type = types.ints.positive; default = 3; description = "Failed parking attempts before a reader is quarantined."; };
      markerSeconds = mkOption { type = types.ints.positive; default = 30; description = "Time for the parking image to report ATTRACTAP_PARKED after flashing."; };
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
      assertion = !janitor.enable || (cfg.coordinator.enable && cfg.exporter.enable && janitor.images != { });
      message = "The Attractap lab janitor needs the local coordinator and exporter, and at least one parking image.";
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
    services.openssh = mkIf (cfg.ssh.authorizedKeys != [ ] || janitor.enable) {
      enable = true;
      openFirewall = lib.mkDefault false;
      # %u: the janitor key authorizes only the labgrid account.
      authorizedKeysFiles = lib.optional janitor.enable "${janitorState}/ssh/%u.authorized_keys";
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
      # Type=simple starts ordering dependants before the gRPC server is ready.
      # ExecStartPost keeps their start transaction waiting for a successful RPC.
      postStart = ''
        exec ${pkgs.coreutils}/bin/timeout 60 ${waitForCoordinator}
      '';
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
  (mkIf cfg.readerApiRelay.enable {
    # Remote forwards on all addresses, but only on the relay port.
    services.openssh.extraConfig = ''
      Match User labgrid
        GatewayPorts clientspecified
        PermitListen 0.0.0.0:${toString cfg.readerApiRelay.port}
    '';
  })
  (mkIf readerWifi.enable {
    assertions = [ {
      assertion = cfg.exporter.enable;
      message = "services.attractap-lab.readerWifi needs the exporter on the same host.";
    } ];
    # Lab users run the command but cannot read the credentials it sends.
    environment.systemPackages = [ readerWifiCommand ];
    users.users.labgrid.packages = [ readerWifiCommand ];
    security.sudo.extraRules = [ {
      users = [ "labgrid" ];
      commands = [ { command = "${readerWifiRoot}"; options = [ "NOPASSWD" ]; } ];
    } ];
    systemd.tmpfiles.rules = [ "d ${dirOf readerWifi.credentialsFile} 0700 root root -" ];
  })
  (mkIf janitor.enable {
    systemd.services.attractap-lab-janitor = {
      description = "Erase and park released Attractap lab readers";
      wantedBy = [ "multi-user.target" ];
      requires = [ "attractap-lab-coordinator.service" ];
      after = [ "attractap-lab-coordinator.service" "attractap-lab-exporter.service" "attractap-lab-places.service" "sshd.service" ];
      # Coordinator restarts drop all claims; restart to park every reader again.
      partOf = [ "attractap-lab-coordinator.service" ];
      path = tools;
      environment = { PYTHONUNBUFFERED = "1"; HOME = "/var/lib/labgrid"; LG_COORDINATOR = cfg.coordinator.syncAddress; };
      startLimitIntervalSec = 0;
      serviceConfig = {
        User = "labgrid";
        Group = "labgrid";
        StateDirectory = "attractap-lab-janitor";
        StateDirectoryMode = "0750";
        WorkingDirectory = janitorState;
        ExecStartPre = janitorSsh;
        ExecStart = lib.escapeShellArgs ([
          "${cfg.package}/bin/attractap-lab-janitor" "--state-dir" janitorState "run"
          "--config" janitorEnvironment
          "--priority" (toString janitor.priority)
          "--max-parallel" (toString janitor.maxParallel)
          "--attempts" (toString janitor.attempts)
          "--marker-seconds" (toString janitor.markerSeconds)
          "--park-command" "${cfg.package}/bin/attractap-lab-janitor"
        ] ++ lib.concatMap (variant: [ "--image" "${variant}=${janitor.images.${variant}}" ]) (lib.attrNames janitor.images));
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
