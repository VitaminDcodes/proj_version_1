import pandas as pd
import socket
import json
import time
import os

def run_fake_node(csv_path, rate_hz=20.0):
    # Initialize UDP Sockets to broadcast to local loopback
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    
    gps_address = ("127.0.0.1", 5001)
    imu_address = ("127.0.0.1", 5002)
    dvl_address = ("127.0.0.1", 5003)
    
    delay = 1.0 / rate_hz

    if not os.path.exists(csv_path):
        print(f"❌ Error: Log file '{csv_path}' not found in current directory.")
        return

    print(f"📖 Loading CORATIA Telemetry Log: {csv_path}")
    df = pd.read_csv(csv_path)
    total_rows = len(df)
    print(f"📊 Loaded {total_rows} frames. Commencing 20Hz hardware stream simulation...")

    while True:
        for idx, row in df.iterrows():
            start_time = time.time()
            
            # 1. GENERATE PACKET: GPS Node (Port 5001)
            # Fuses Geodetic coordinates and Bar30 absolute depth pass-through
            gps_packet = {
                "lat": float(row["Latitude"]),
                "lon": float(row["Longitude"]),
                "satellites": int(row["Satellites_Count"]),
                "hdop": 1.0,  # Optimal geometry simulation
                "raw_depth_m": float(row["Pressure_Depth_m"])
            }
            
            # 2. GENERATE PACKET: Navigator IMU Node (Port 5002)
            # Tracks true gyro orientation and mimics negligible accelerometer bias
            imu_packet = {
                "roll": 0.0,
                "pitch": 0.0,
                "yaw": float(row["Gyro_Heading_Yaw"]),
                "ax": 0.0,
                "ay": 0.0,
                "az": 1.0,
                "compass_valid": True
            }
            
            # 3. GENERATE PACKET: Water Linked A50 DVL Node (Port 5003)
            # Packs acoustic velocities and structural Figure of Merit metrics
            dvl_packet = {
                "vx": float(row["Linear_Vx_ms"]),
                "vy": float(row["Linear_Vy_ms"]),
                "vz": 0.0,
                "fom": float(row["DVL_FOM"]),
                "altitude": 1.4, # Mimic steady altitude above seafloor
                "valid": True
            }

            # Blast compiled bytes asynchronously down network lanes
            sock.sendto(json.dumps(gps_packet).encode('utf-8'), gps_address)
            sock.sendto(json.dumps(imu_packet).encode('utf-8'), imu_address)
            sock.sendto(json.dumps(dvl_packet).encode('utf-8'), dvl_address)

            # Print diagnostic heartbeat monitor console log
            if idx % 100 == 0:
                print(f"📡 [STREAMING] Frame {idx}/{total_rows} | Lat: {gps_packet['lat']:.5f} | Yaw: {imu_packet['yaw']:.1f}° | Vx: {dvl_packet['vx']:.3f}m/s")

            # Maintain deterministic loop execution speed (50ms cycles)
            elapsed = time.time() - start_time
            time.sleep(max(0.001, delay - elapsed))
            
        print("\n🔄 Reached end of log file. Looping data sequence from origin frame back to start...\n")

if __name__ == "__main__":
    LOG_FILE_NAME = "CORATIA_Tether_Log_2026-06-23 (5).csv"
    run_fake_node(LOG_FILE_NAME, rate_hz=20.0)
