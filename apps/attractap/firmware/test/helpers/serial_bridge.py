"""Line bridge using ESP-IDF's pyserial. Reopens USB after firmware reboots."""
import queue
import sys
import threading
import time
import serial

commands = queue.Queue()


def read_commands():
    for line in sys.stdin:
        commands.put(line.encode())
    commands.put(None)


threading.Thread(target=read_commands, daemon=True).start()
pending = b""
while True:
    try:
        with serial.Serial(sys.argv[1], 115200, timeout=0.1,
                           write_timeout=5, dsrdtr=False, rtscts=False) as port:
            print("BRIDGE_READY", flush=True)
            while True:
                while not commands.empty():
                    command = commands.get_nowait()
                    if command is None:
                        sys.exit(0)
                    port.write(command)
                    port.flush()
                pending += port.read(max(1, port.in_waiting))
                while b"\n" in pending:
                    line, pending = pending.split(b"\n", 1)
                    print(line.decode(errors="replace").rstrip("\r"), flush=True)
                # Bound partial log lines after USB interruption.
                if len(pending) > 65536:
                    pending = b""
    except (serial.SerialException, OSError) as error:
        print(f"Serial reconnect: {error}", file=sys.stderr, flush=True)
        pending = b""
        time.sleep(0.5)
