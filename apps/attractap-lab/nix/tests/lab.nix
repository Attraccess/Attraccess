{ self }:
{ pkgs, ... }:
{
  name = "attractap-lab";
  nodes.machine = { lib, ... }: {
    imports = [ self.nixosModules.attractap-lab ];
    services.attractap-lab = {
      enable = true;
      coordinator = {
        enable = true;
        places = {
          lock.matches = [ ];
          reader-a = { matches = [ "smoke/reader-a/*" ]; tags.board = "attractap"; };
          reader-b.matches = [ "smoke/reader-b/*" ];
        };
      };
      exporter = {
        enable = true;
        name = "smoke";
        hostname = "machine";
        # Missing USB devices should remain unavailable without crashing exporter.
        settings = {
          reader-a.USBSerialPort.match = { SUBSYSTEM = "tty"; ID_SERIAL_SHORT = "NOT-CONNECTED-A"; };
          reader-a.HTTPVideoStream.url = "http://127.0.0.1:8080/snapshot";
          reader-b.USBSerialPort.match = { SUBSYSTEM = "tty"; ID_SERIAL_SHORT = "NOT-CONNECTED-B"; };
        };
      };
      cameras.overview = { device = "/dev/video-not-connected"; port = 8080; };
      dashboard.enable = true;
    };
    # Start the lab explicitly so a failed initial activation cannot hide behind
    # systemd's automatic retries. Delay the process itself, after Type=simple
    # considers ExecStart launched, to reproduce slow coordinator initialization.
    systemd.services = {
      attractap-lab-coordinator = {
        wantedBy = lib.mkForce [ ];
        serviceConfig.ExecStart = lib.mkForce (pkgs.writeShellScript "delayed-labgrid-coordinator" ''
          ${pkgs.coreutils}/bin/sleep 3
          exec ${pkgs.python3Packages.labgrid}/bin/labgrid-coordinator --listen 127.0.0.1:20408
        '');
      };
      attractap-lab-places.wantedBy = lib.mkForce [ ];
      attractap-lab-exporter.wantedBy = lib.mkForce [ ];
      attractap-lab-dashboard.wantedBy = lib.mkForce [ ];
    };
    environment.etc."dashboard-test.py".source = ./dashboard.py;
    environment.systemPackages = [
      pkgs.python3Packages.labgrid
      (pkgs.python3.withPackages (ps: [ ps.httpx ps.websockets ]))
    ];
  };
  testScript = ''
    machine.start()
    machine.wait_for_unit("multi-user.target")
    machine.succeed("systemctl start attractap-lab-places.service attractap-lab-exporter.service")
    machine.succeed("test $(systemctl show attractap-lab-places --property=NRestarts --value) = 0")
    machine.wait_for_unit("attractap-lab-coordinator.service")
    machine.wait_for_unit("attractap-lab-exporter.service")
    machine.wait_for_unit("attractap-lab-places.service")
    machine.succeed("labgrid-client places | grep reader-a")
    machine.succeed("labgrid-client places | grep reader-b")
    machine.wait_until_succeeds("labgrid-client -vv resources | grep smoke/reader-a/NetworkSerialPort")
    machine.wait_until_succeeds("labgrid-client -vv resources | grep smoke/reader-b/NetworkSerialPort")
    machine.succeed("labgrid-client -p lock acquire")
    machine.fail("env LG_USERNAME=competing-client labgrid-client -p lock acquire")
    machine.succeed("labgrid-client -p lock release")
    machine.succeed("su -s /bin/sh labgrid -c 'command -v esptool; command -v ffmpeg; test -w /var/lib/labgrid'")
    machine.succeed("systemctl start attractap-lab-dashboard.service")
    machine.wait_for_unit("nginx.service")
    machine.succeed("python /etc/dashboard-test.py")
    machine.succeed("labgrid-client -p lock acquire")
    machine.succeed("systemctl restart attractap-lab-coordinator")
    machine.wait_for_unit("attractap-lab-places.service")
    machine.succeed("test $(systemctl show attractap-lab-places --property=NRestarts --value) = 0")
    machine.wait_until_succeeds("labgrid-client places | grep reader-a")
    machine.wait_for_unit("attractap-lab-dashboard.service")
    machine.wait_until_succeeds("python /etc/dashboard-test.py health")
    # Labgrid keeps places but deliberately releases acquisitions on restart.
    machine.succeed("env LG_USERNAME=fresh-client labgrid-client -p lock acquire")
    machine.succeed("env LG_USERNAME=fresh-client labgrid-client -p lock release")
    machine.succeed("test $(systemctl show attractap-lab-camera-overview --property=Restart --value) = always")
    # Unlike the native claim above, dashboard claims also persist in SQLite.
    machine.succeed("python /etc/dashboard-test.py claim")
    # A stop/start uses BindsTo + Wants, independently of PartOf's restart path.
    machine.succeed("systemctl stop attractap-lab-coordinator")
    machine.succeed("test $(systemctl show attractap-lab-dashboard --property=ActiveState --value) = inactive")
    machine.succeed("systemctl start attractap-lab-coordinator")
    machine.wait_for_unit("attractap-lab-dashboard.service")
    machine.succeed("python /etc/dashboard-test.py recovered")
  '';
}
