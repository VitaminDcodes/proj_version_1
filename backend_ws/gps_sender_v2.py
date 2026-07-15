import socket
import requests
import time
import json

BLUEOS_IP = "192.168.2.2"
GLOBAL_POS_URL = f"http://{BLUEOS_IP}:6040/v1/mavlink/vehicles/1/components/1/messages/GLOBAL_POSITION_INT"
GPS2_RAW_URL   = f"http://{BLUEOS_IP}:6040/v1/mavlink/vehicles/1/components/1/messages/GPS2_RAW"

# Setup local UDP output pipe to pump packets to the brain on port 5001
sock_out = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

def extract_val(field, default=0):
    """BlueOS Safety Guard: Extracts raw numeric values if wrapped in metadata blocks"""
    if isinstance(field, dict):
        return field.get("value", default)
    return field if field is not None else default

print("🛰️ CORATIA Persistent Session Driver Online [HTTP Keep-Alive Engaged]...")

# 🚨 THE FIX: Create a single persistent connection pool session
session = requests.Session()

while True:
    sat_count = 0
    raw_hdop = 100  # Default fallback (HDOP 1.0)
    
    # ─── EXTRACTION BLOCK A: POLL TRUE SAT COUNTS FROM GPS2_RAW ───
    try:
        # Reusing the open connection session with standard hardware-safe timeouts
        gps2_response = session.get(GPS2_RAW_URL, timeout=(2.0, 0.2))
        if gps2_response.status_code == 200:
            gps2_msg = gps2_response.json().get("message", {})
            sat_count = extract_val(gps2_msg.get("satellites_visible"), 0)
            raw_hdop = extract_val(gps2_msg.get("eph"), 100)
    except Exception as e:
        print(f"⚠️ GPS2_RAW Endpoint Pending/Timeout: {e}")

    # ─── EXTRACTION BLOCK B: POLL POSITION AND DEPTH FROM GLOBAL_POSITION_INT ───
    try:
        pos_response = session.get(GLOBAL_POS_URL, timeout=(2.0, 0.2))
        
        if pos_response.status_code == 200:
            payload = pos_response.json()
            msg = payload.get("message", {})
            
            raw_lat = extract_val(msg.get("lat"), 0)
            raw_lon = extract_val(msg.get("lon"), 0)
            raw_relative_alt = extract_val(msg.get("relative_alt"), 0)
            
            # Convert millimeters to standard metric depths
            computed_depth_m = abs(raw_relative_alt / 1000.0)
            
            gps_data = {
                "lat": raw_lat / 1e7,
                "lon": raw_lon / 1e7,
                "altitude": float(raw_relative_alt / 1000.0),
                "satellites": sat_count,             
                "hdop": float(raw_hdop / 100.0),     
                "raw_depth_m": float(computed_depth_m)
            }
            
            # Transmit unified packet out to the central filter engine
            sock_out.sendto(json.dumps(gps_data).encode(), ("127.0.0.1", 5001))
            
            print(f"📋 Depth: {computed_depth_m:.2f}m | GPS2 Sats: {sat_count} | Lat: {gps_data['lat']:.5f} | HDOP: {gps_data['hdop']:.1f}")
        else:
            print(f"⚠️ BlueOS GLOBAL_POS HTTP Warning: Status Code {pos_response.status_code}")

    except Exception as e:
        print(f"❌ Core Position Extraction Error: {e}")
        
    # Maintain a steady 5 Hz loop frequency
    time.sleep(0.2)
