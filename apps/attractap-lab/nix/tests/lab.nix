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
          reader-b.USBSerialPort.match = { SUBSYSTEM = "tty"; ID_SERIAL_SHORT = "NOT-CONNECTED-B"; };
        };
      };
      cameras.overview = { device = "/dev/video-not-connected"; port = 8080; };
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
    };
    environment.systemPackages = [ pkgs.python3Packages.labgrid ];
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
    machine.succeed("labgrid-client -p lock acquire")
    machine.succeed("systemctl restart attractap-lab-coordinator")
    machine.wait_for_unit("attractap-lab-places.service")
    machine.succeed("test $(systemctl show attractap-lab-places --property=NRestarts --value) = 0")
    machine.wait_until_succeeds("labgrid-client places | grep reader-a")
    # Labgrid keeps places but deliberately releases acquisitions on restart.
    machine.succeed("env LG_USERNAME=fresh-client labgrid-client -p lock acquire")
    machine.succeed("env LG_USERNAME=fresh-client labgrid-client -p lock release")
    machine.succeed("test $(systemctl show attractap-lab-camera-overview --property=Restart --value) = always")
  '';
}
