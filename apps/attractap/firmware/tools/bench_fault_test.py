import sys
import time
import glob
import serial


def find_port():
    for _ in range(40):
        ports = glob.glob("/dev/cu.usbmodem*")
        if ports:
            return ports[0]
        time.sleep(0.25)
    return None


def run(cmd, settle=2.0, capture=8.0):
    port = find_port()
    if not port:
        print("NO_PORT")
        return
    try:
        ser = serial.Serial(port, 115200, timeout=0.2)
    except Exception as e:
        print("OPEN_FAIL", e)
        return
    time.sleep(settle)
    ser.reset_input_buffer()
    line = ("CMND " + cmd + "\n").encode()
    ser.write(line)
    ser.flush()
    print("=== sent:", line.decode().strip())
    end = time.time() + capture
    buf = b""
    while time.time() < end:
        buf += ser.read(4096)
    ser.close()
    text = buf.decode("utf-8", "replace")
    print(text)
    print("=== end", cmd, "(", len(buf), "bytes )")


if __name__ == "__main__":
    run(sys.argv[1], capture=float(sys.argv[2]) if len(sys.argv) > 2 else 8.0)
