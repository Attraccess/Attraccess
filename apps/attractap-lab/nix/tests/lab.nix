{ self }:
{ pkgs, ... }:
{
  name = "attractap-lab";
  nodes.machine = { ... }: {
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
    environment.systemPackages = [ pkgs.python3Packages.labgrid ];
  };
  testScript = ''
    machine.start()
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
    machine.wait_until_succeeds("labgrid-client places | grep reader-a")
    # Labgrid keeps places but deliberately releases acquisitions on restart.
    machine.succeed("env LG_USERNAME=fresh-client labgrid-client -p lock acquire")
    machine.succeed("env LG_USERNAME=fresh-client labgrid-client -p lock release")
    machine.succeed("test $(systemctl show attractap-lab-camera-overview --property=Restart --value) = always")
  '';
}
