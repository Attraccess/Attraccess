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
          parking = { matches = [ "smoke/parking/*" ]; tags.variant = "parking-test"; };
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
          parking.USBSerialPort.match = { SUBSYSTEM = "tty"; ID_SERIAL_SHORT = "NOT-CONNECTED-P"; };
          parking.USBFlashableDevice.match = { SUBSYSTEM = "tty"; ID_SERIAL_SHORT = "NOT-CONNECTED-P"; };
        };
      };
      cameras.overview = { device = "/dev/video-not-connected"; port = 8080; };
      dashboard.enable = true;
      # The absent reader cannot be parked, so the janitor must quarantine it.
      janitor = {
        enable = true;
        images.parking-test = pkgs.writeText "parking-test.bin" "not firmware";
        attempts = 1;
      };
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
      attractap-lab-janitor.wantedBy = lib.mkForce [ ];
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
    machine.succeed("su -s /bin/sh labgrid -c 'command -v esptool; command -v espefuse; command -v ffmpeg; command -v rsync; test -w /var/lib/labgrid'")
    # Parking copies the image to the exporter with rsync from the janitor service.
    machine.succeed("systemctl show -p Environment attractap-lab-janitor.service | grep -q -- '-rsync-'")
    machine.succeed("systemctl start attractap-lab-janitor.service")
    machine.wait_for_unit("attractap-lab-janitor.service")
    # The janitor key reaches this host's own exporter account over SSH.
    machine.wait_until_succeeds("su -s /bin/sh labgrid -c 'ssh -o BatchMode=yes machine true'")
    machine.fail("su -s /bin/sh labgrid -c 'ssh -o BatchMode=yes root@machine true'")
    machine.wait_until_succeeds("test -e /var/lib/attractap-lab-janitor/quarantine/parking.json", timeout=180)
    machine.succeed("labgrid-client -p parking show | grep 'acquired: attractap-lab-janitor/janitor'")
    machine.fail("labgrid-client -p parking acquire")
    machine.succeed("attractap-lab-janitor status | grep parking")
    # Places without a parking image are left alone.
    machine.succeed("labgrid-client -p reader-a acquire")
    machine.succeed("labgrid-client -p reader-a release")
    machine.fail("labgrid-client -p reader-a show | grep 'acquired: attractap-lab-janitor'")
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
