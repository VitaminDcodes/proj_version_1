import socket
import json
import time

DVL_IP = "192.168.2.3"
DVL_PORT = 16171

# Setup independent outbound UDP socket pipe to pump frames to the brain
sock_out = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

print("🌊 CORATIA DVL Driver Node Online...")

while True:
    dvl_sock = None
    try:
        print(f"🔌 Attempting connection to raw DVL TCP Stream on {DVL_IP}:{DVL_PORT}...")
        dvl_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        dvl_sock.settimeout(2.0) # Prevent indefinite freezing if wire is loose
        dvl_sock.connect((DVL_IP, DVL_PORT))
        print("✅ Connected directly to DVL core array stream.")
        
        buffer = ""
        while True:
            raw = dvl_sock.recv(4096).decode('utf-8')
            if not raw:
                print("⚠️ DVL connection cut off by remote hardware device.")
                break
                
            buffer += raw
            # Parse streaming frames chunk-by-chunk by lookahead delimiter splitting
            while '\n' in buffer:
                line, buffer = buffer.split('\n', 1)
                if line.strip():
                    data = json.loads(line)
                    
                    # Package compliant payload definitions
                    dvl_data = {
                        "fom": data.get("fom", 0.0),
                        "altitude": data.get("altitude", 0.0),
                        "valid": data.get("velocity_valid", False),
                        "vx": data.get("vx", 0.0), 
                        "vy": data.get("vy", 0.0), 
                        "vz": data.get("vz", 0.0)
                    }
                    
                    # Blast packet immediately to local network bridge on port 5003
                    sock_out.sendto(json.dumps(dvl_data).encode(), ("127.0.0.1", 5003))
                    
    except Exception as e:
        print(f"❌ DVL Pipeline Exception Error: {e} | Retrying line state handover in 1s...")
        time.sleep(1.0) # Strict sequence timeout protect buffer line
        
    finally:
        # Guarantee no sockets stay half-open freezing GCS network profiles
        if dvl_sock:
            try:
                dvl_sock.close()
            except Exception:
                pass
