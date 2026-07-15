import socket
import requests
import time
import math
import json

BLUEOS_IP = "192.168.2.2"
# Bulk endpoint to fetch all messages at once and avoid endpoint spamming
BULK_MAVLINK_URL = f"http://{BLUEOS_IP}:6040/mavlink/vehicles/1/components/1/messages"

# Setup local UDP output pipe to pump payload maps to the brain on port 5002
sock_out = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

print("🧭 CORATIA IMU & Compass Driver Node Online...")
print(f"📡 Connecting to BlueOS at {BLUEOS_IP}...")

while True:
    try:
        # Request bulk cache map
        response = requests.get(BULK_MAVLINK_URL, timeout=0.04)
        if response.status_code == 200:
            payload = response.json()
            
            # 1. Pull Orientation Array from ATTITUDE message packet
            att_packet = payload.get("ATTITUDE", {}).get("message", {})
            roll_deg = math.degrees(att_packet.get("roll", 0.0))
            pitch_deg = math.degrees(att_packet.get("pitch", 0.0))
            yaw_deg = math.degrees(att_packet.get("yaw", 0.0))
            
            # 🚨 ADDED: Print the Yaw (and Roll/Pitch) to the terminal for live checking
            print(f"Current Yaw Heading: {yaw_deg:7.2f}°  |  Roll: {roll_deg:7.2f}°  |  Pitch: {pitch_deg:7.2f}°")
            
            # 2. Pull Accelerometer Array from SCALED_IMU message packet
            # Mavlink SCALED_IMU values are typically transmitted in milli-g (divide by 1000 to get standard g force units)
            imu_packet = payload.get("SCALED_IMU", {}).get("message", {})
            accel_x = imu_packet.get("xacc", 0.0) / 1000.0
            accel_y = imu_packet.get("yacc", 0.0) / 1000.0
            accel_z = imu_packet.get("zacc", 0.0) / 1000.0
            
            # 3. Compass Health State Extraction
            # Validate magnetometer by checking if SYS_STATUS flags or raw telemetry values are zeroed out
            compass_valid = True if yaw_deg != 0.0 else False
            
            # --- COMPLIANT CORATIA SENSOR PAYLOAD ---
            imu_data = {
                "roll": roll_deg,
                "pitch": pitch_deg,
                "yaw": yaw_deg,
                "ax": accel_x,
                "ay": accel_y,
                "az": accel_z,
                "compass_valid": compass_valid
            }
            
            # Flatten payload string and transmit immediately via Localhost port 5002
            sock_out.sendto(json.dumps(imu_data).encode(), ("127.0.0.1", 5002))
            
    except Exception as e:
        # Silently pass over network request drops to protect high-frequency loops
        # print(f"Network Drop: {e}") # Uncomment to debug
        pass
        
    # Maintain strict 20Hz update execution cycle pace (50ms interval)
    time.sleep(0.05)
