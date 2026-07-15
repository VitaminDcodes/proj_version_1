import asyncio
import websockets
import json
import threading
import socket
import math
import time
import numpy as np

# --- CORATIA ARCHITECTURE TELEMETRY DATA SCHEMA ---
rov_telemetry = {
    "x": 0.0, "y": 0.0, "z": 0.0,
    "vx": 0.0, "vy": 0.0, "vz": 0.0,
    "yaw": 0.0, "pitch": 0.0, "roll": 0.0,
    "sensor_state": 6,  
    "satellites": 0,
    "fom": 99.9,
    "altitude": 0.0,
    "status": "NAV MODE: COMPILING DUAL-OBSERVATION ANCHOR STATE...",
    "lat": 0.0, "lon": 0.0, "hdop": 99.9,
    "ax": 0.0, "ay": 0.0, "az": 1.0,
    "gps_drift": 0.0,       
    "gps_drift_pct": 0.0,
    "depth_sensor_m": 0.0,
    "gps_alive": False, "dvl_alive": False, "imu_alive": False, "compass_alive": False
}

class CoratiaEKFFusionEngine:
    def __init__(self):
        self.last_time = time.time()
        self.home_lat = None
        self.home_lon = None
        
        self.last_gps_time = 0.0
        self.last_imu_time = 0.0
        self.last_dvl_time = 0.0
        self.last_compass_time = 0.0
        
        self.last_gps_lat = None
        self.last_gps_lon = None

        self.is_submerged_state = False  
        self.was_submerged_historical = False  
        self.loop_counter = 0
        
        self.total_distance_traveled = 0.0
        self.last_x_for_odom = 0.0
        self.last_y_for_odom = 0.0

        self.world_ax = 0.0
        self.world_ay = 0.0
        self.dvl_world_vx = 0.0
        self.dvl_world_vy = 0.0

        # =====================================================================
        # 📊 ESTIMATION STATE MATRICES SETUP
        # =====================================================================
        self.x = np.zeros((4, 1)) # State Vector: [X, Y, Vx, Vy]
        self.P = np.diag([0.1, 0.1, 0.01, 0.01])
        self.Q = np.diag([0.002, 0.002, 0.010, 0.010])
        
        # 🚨 THE COVARIANCE ANCHORS (TUNED FOR TRUSTING POSITION)
        self.R_pos_anchor = np.diag([0.02, 0.02])     # High-trust, low-noise covariance floor for local XY position limits
        self.BASE_R_DVL   = np.diag([0.05, 0.05])     # Trust velocities for relative inter-frame transitions
        self.R_gps_normal = np.diag([4.0, 4.0])       
        self.R_gps_recovery = np.diag([0.2, 0.2])     

        # FILTER PARAMETERS
        self.DVL_DEADBAND = 0.08                      
        self.MAX_SPEED = 1.2                          
        self.SUBMERGED_LIMIT_M = 0.25                 
        self.SURFACE_LIMIT_M = 0.12                   
        self.CHI_SQUARED_THRESHOLD = 9.21             
        self.MAX_ABSOLUTE_GATE_M = 15.0               

    def rotate_body_to_world(self, x_val, y_val, z_val, roll, pitch, yaw):
        r, p, y_rad = math.radians(roll), math.radians(pitch), math.radians(yaw)
        cy, sy = math.cos(y_rad), math.sin(y_rad)
        cp, sp = math.cos(p), math.sin(p)
        cr, sr = math.cos(r), math.sin(r)
        world_y_north = x_val*(cy*cp) + y_val*(cy*sp*sr - sy*cr) + z_val*(cy*sp*cr + sy*sr)
        world_x_east  = x_val*(sy*cp) + y_val*(sy*sp*sr + cy*cr) + z_val*(sy*sp*cr - cy*sr)
        return world_x_east, world_y_north

    def listen_udp(self):
        global rov_telemetry
        
        gps_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); gps_sock.bind(("127.0.0.1", 5001)); gps_sock.setblocking(False)
        imu_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); imu_sock.bind(("127.0.0.1", 5002)); imu_sock.setblocking(False)
        dvl_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); dvl_sock.bind(("127.0.0.1", 5003)); dvl_sock.setblocking(False)

        print("🧠 Tightly Coupled Dual-Observation EKF Online: Anchored Bounds Engaged.")
        
        while True:
            now = time.time()
            dt = now - self.last_time
            self.last_time = now
            if dt <= 0 or dt > 0.2: dt = 0.05
            self.loop_counter += 1

            # =================================================================
            # 🔄 STEP 1: POSITION STATE PROPAGATION (VELOCITY DRIVEN)
            # =================================================================
            F = np.array([
                [1.0, 0.0,  dt, 0.0],
                [0.0, 1.0, 0.0,  dt],
                [0.0, 0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0, 1.0]
            ])
            self.x = np.dot(F, self.x)
            self.P = np.dot(np.dot(F, self.P), F.T) + self.Q

            # =================================================================
            # 📥 STEP 2: NETWORK PACKET PARSING & BUFFER INGESTION
            # =================================================================
            gps_updated = False
            gps_is_fresh = False
            raw_lat, raw_lon = 0.0, 0.0
            while True:
                try:
                    data, _ = gps_sock.recvfrom(2048)
                    msg = json.loads(data.decode())
                    new_lat = msg.get("lat", 0.0)
                    new_lon = msg.get("lon", 0.0)

                    if new_lat != self.last_gps_lat or new_lon != self.last_gps_lon:
                        gps_is_fresh = True
                        self.last_gps_lat = new_lat
                        self.last_gps_lon = new_lon

                    rov_telemetry["satellites"] = msg.get("satellites", 0)
                    rov_telemetry["hdop"] = msg.get("hdop", 99.9)
                    
                    extracted_depth = msg.get("raw_depth_m", 0.0)
                    rov_telemetry["depth_sensor_m"] = extracted_depth
                    rov_telemetry["z"] = -abs(extracted_depth)
                    
                    raw_lat, raw_lon = new_lat, new_lon
                    self.last_gps_time = now
                    gps_updated = True
                except BlockingIOError: break

            while True:
                try:
                    data, _ = imu_sock.recvfrom(2048)
                    msg = json.loads(data.decode())
                    rov_telemetry["roll"] = msg.get("roll", 0.0)
                    rov_telemetry["pitch"] = msg.get("pitch", 0.0)
                    rov_telemetry["yaw"] = msg.get("yaw", 0.0)
                    self.last_imu_time = now
                    if msg.get("compass_valid", True): self.last_compass_time = now
                except BlockingIOError: break

            dvl_updated = False
            dvl_valid_bit = False
            msg_local_x, msg_local_y = None, None
            while True:
                try:
                    data, _ = dvl_sock.recvfrom(2048)
                    msg = json.loads(data.decode())
                    rov_telemetry["fom"] = msg.get("fom", 99.9)
                    rov_telemetry["altitude"] = msg.get("altitude", 0.0)
                    dvl_valid_bit = msg.get("valid", False)
                    
                    # Intercept clean, filtered positional data from telemetry packet strings
                    if "local_x" in msg and "local_y" in msg:
                        msg_local_x = msg.get("local_x")
                        msg_local_y = msg.get("local_y")
                    
                    if dvl_valid_bit:
                        r_vx = msg.get("vx", 0.0)
                        r_vy = msg.get("vy", 0.0)
                        
                        vx_db = r_vx if abs(r_vx) > self.DVL_DEADBAND else 0.0
                        vy_db = r_vy if abs(r_vy) > self.DVL_DEADBAND else 0.0
                        
                        vx_clamp = max(-self.MAX_SPEED, min(self.MAX_SPEED, vx_db))
                        vy_clamp = max(-self.MAX_SPEED, min(self.MAX_SPEED, vy_db))
                        
                        w_vx, w_vy = self.rotate_body_to_world(
                            vx_clamp, vy_clamp, msg.get("vz", 0.0),
                            rov_telemetry["roll"], rov_telemetry["pitch"], rov_telemetry["yaw"]
                        )
                        self.dvl_world_vx = w_vx
                        self.dvl_world_vy = w_vy
                        self.last_dvl_time = now
                        dvl_updated = True
                except BlockingIOError: break

            rov_telemetry["gps_alive"] = (now - self.last_gps_time) < 1.0
            rov_telemetry["imu_alive"] = (now - self.last_imu_time) < 1.0
            rov_telemetry["dvl_alive"] = (now - self.last_dvl_time) < 1.0
            rov_telemetry["compass_alive"] = (now - self.last_compass_time) < 1.0

            if not self.is_submerged_state and rov_telemetry["depth_sensor_m"] > self.SUBMERGED_LIMIT_M:
                self.is_submerged_state = True
            elif self.is_submerged_state and rov_telemetry["depth_sensor_m"] < self.SURFACE_LIMIT_M:
                self.is_submerged_state = False

            # =================================================================
            # ⚡ STEP 3: DUAL-OBSERVATION KALMAN UPDATE LOOP
            # =================================================================
            if self.home_lat is None:
                if gps_updated and rov_telemetry["satellites"] >= 6 and rov_telemetry["hdop"] < 1.5 and raw_lat != 0.0:
                    self.home_lat = raw_lat
                    self.home_lon = raw_lon
                    self.x[0, 0] = 0.0
                    self.x[1, 0] = 0.0
                    self.last_x_for_odom, self.last_y_for_odom = 0.0, 0.0
                else:
                    rov_telemetry["sensor_state"] = 6
                    rov_telemetry["status"] = "NAV MODE: SURFACE STANDBY | CALIBRATING COMPONENT ORIGIN OVERLAYS..."

            if self.home_lat is not None:
                dx_step = self.x[0, 0] - self.last_x_for_odom
                dy_step = self.x[1, 0] - self.last_y_for_odom
                self.total_distance_traveled += math.sqrt(dx_step**2 + dy_step**2)
                self.last_x_for_odom, self.last_y_for_odom = self.x[0, 0], self.x[1, 0]

                # ─── OBSERVATION A: DVL SPEEDS (Drives Smooth Inter-Frame Fluidity) ───
                if dvl_updated and dvl_valid_bit:
                    z_dvl = np.array([[self.dvl_world_vx], [self.dvl_world_vy]])
                    H_dvl = np.array([[0.0, 0.0, 1.0, 0.0],[0.0, 0.0, 0.0, 1.0]])
                    y_err_dvl = z_dvl - np.dot(H_dvl, self.x)
                    
                    confidence = (1.0 - min(0.4, rov_telemetry["fom"]) / 0.4)
                    active_R_dvl = self.BASE_R_DVL / max(0.01, confidence ** 2)
                        
                    S_dvl = np.dot(np.dot(H_dvl, self.P), H_dvl.T) + active_R_dvl
                    K_dvl = np.dot(np.dot(self.P, H_dvl.T), np.linalg.inv(S_dvl))
                    self.x = self.x + np.dot(K_dvl, y_err_dvl)
                    self.P = np.dot((np.eye(4) - np.dot(K_dvl, H_dvl)), self.P)

                # ─── OBSERVATION B: TRUSTED POSITION FIX ANCHOR (Eliminates Accumulating Drift) ───
                if msg_local_x is not None and msg_local_y is not None:
                    z_pos = np.array([[msg_local_x], [msg_local_y]])
                    H_pos = np.array([[1.0, 0.0, 0.0, 0.0],[0.0, 1.0, 0.0, 0.0]])
                    y_err_pos = z_pos - np.dot(H_pos, self.x)
                    
                    # Direct Kalman correction using the high-trust position matrix anchor
                    S_pos = np.dot(np.dot(H_pos, self.P), H_pos.T) + self.R_pos_anchor
                    K_pos = np.dot(np.dot(self.P, H_pos.T), np.linalg.inv(S_pos))
                    self.x = self.x + np.dot(K_pos, y_err_pos)
                    self.P = np.dot((np.eye(4) - np.dot(K_pos, H_pos)), self.P)

                # --- MISSION ENVIRONMENTAL DIRECTIONAL ROUTER ---
                if self.is_submerged_state:
                    rov_telemetry["sensor_state"] = 1 # Deep Blue High-Confidence Theme
                    rov_telemetry["status"] = "NAV MODE: SUBMERGED | DUAL-OBSERVATION VELOCITY + POSITION COUPLING ACTIVE"
                    self.was_submerged_historical = True
                    
                    # Geodetic projection from clean, drift-clamped EKF space
                    rov_telemetry["lat"] = self.home_lat + (self.x[1, 0] / 111320.0)
                    rov_telemetry["lon"] = self.home_lon + (self.x[0, 0] / (111320.0 * math.cos(math.radians(self.home_lat))))
                    rov_telemetry["gps_drift"] = 0.0
                else:
                    rov_telemetry["sensor_state"] = 0 if rov_telemetry["satellites"] >= 6 else 4

                    if gps_updated and gps_is_fresh and rov_telemetry["satellites"] >= 6 and rov_telemetry["hdop"] < 1.5:
                        measured_x = (raw_lon - self.home_lon) * 111320.0 * math.cos(math.radians(self.home_lat))
                        measured_y = (raw_lat - self.home_lat) * 111320.0
                        
                        z_gps = np.array([[measured_x], [measured_y]])
                        H_gps = np.array([[1.0, 0.0, 0.0, 0.0],[0.0, 1.0, 0.0, 0.0]])
                        y_err_gps = z_gps - np.dot(H_gps, self.x)
                        
                        active_R_gps = self.R_gps_recovery if self.was_submerged_historical else self.R_gps_normal
                        S_gps = np.dot(np.dot(H_gps, self.P), H_gps.T) + active_R_gps
                        try:
                            S_inv = np.linalg.inv(S_gps)
                            d2 = float(np.dot(np.dot(y_err_gps.T, S_inv), y_err_gps))
                        except np.linalg.LinAlgError:
                            S_inv = np.zeros_like(S_gps)
                            d2 = 999.0
                            
                        euclidean_distance = np.linalg.norm(y_err_gps)

                        if self.was_submerged_historical:
                            if d2 < self.CHI_SQUARED_THRESHOLD or euclidean_distance < self.MAX_ABSOLUTE_GATE_M:
                                K_gps = np.dot(np.dot(self.P, H_gps.T), S_inv)
                                self.x = self.x + np.dot(K_gps, y_err_gps)
                                self.P = np.dot((np.eye(4) - np.dot(K_gps, H_gps)), self.P)
                                self.was_submerged_historical = False
                                rov_telemetry["status"] = "SURFACE TRANSIT: LOCK MATRIX REESTABLISHED"
                                rov_telemetry["lat"] = raw_lat
                                rov_telemetry["lon"] = raw_lon
                            else:
                                rov_telemetry["status"] = f"RESURFACING CAPTURE: MUTING OUTLIER SATELLITE SPIKE | d2: {d2:.1f}"
                                rov_telemetry["lat"] = self.home_lat + (self.x[1, 0] / 111320.0)
                                rov_telemetry["lon"] = self.home_lon + (self.x[0, 0] / (111320.0 * math.cos(math.radians(self.home_lat))))
                        else:
                            if d2 < self.CHI_SQUARED_THRESHOLD or euclidean_distance < self.MAX_ABSOLUTE_GATE_M:
                                K_gps = np.dot(np.dot(self.P, H_gps.T), S_inv)
                                self.x = self.x + np.dot(K_gps, y_err_gps)
                                self.P = np.dot((np.eye(4) - np.dot(K_gps, H_gps)), self.P)
                                rov_telemetry["lat"] = raw_lat
                                rov_telemetry["lon"] = raw_lon
                                rov_telemetry["status"] = "SURFACE NAVIGATION: NOMINAL MULTI-CHANNEL DATA FUSION"
                            else:
                                rov_telemetry["status"] = f"WARN: GNSS MULTIPATH FLUCTUATION BYPASSED | d2: {d2:.1f}"

                        rov_telemetry["gps_drift"] = float(euclidean_distance)
                        if self.total_distance_traveled > 0.1:
                            rov_telemetry["gps_drift_pct"] = (rov_telemetry["gps_drift"] / self.total_distance_traveled) * 100.0
                    else:
                        if "WARN" not in rov_telemetry["status"] and "ALERT" not in rov_telemetry["status"]:
                            rov_telemetry["status"] = "NAV MODE: SURFACE STANDBY | DEGRADED SATELLITE CONSTELLATION"

            # Emergency Fail-Safe Stop
            if not rov_telemetry["gps_alive"] and not rov_telemetry["dvl_alive"]:
                self.x[2, 0] = 0.0
                self.x[3, 0] = 0.0
                rov_telemetry["sensor_state"] = 3
                rov_telemetry["status"] = "CRITICAL DISCONNECTION: STATE INTERVENTION LOCK ACTIVE"

            # Export clean state array values back to schema properties
            rov_telemetry["x"] = float(self.x[0, 0])
            rov_telemetry["y"] = float(self.x[1, 0])
            rov_telemetry["vx"] = float(self.x[2, 0])
            rov_telemetry["vy"] = float(self.x[3, 0])

            time.sleep(0.05)

async def ws_handler(websocket, path=None):
    try:
        while True:
            await websocket.send(json.dumps(rov_telemetry))
            await asyncio.sleep(0.05)
    except websockets.exceptions.ConnectionClosed: pass

async def main():
    engine = CoratiaEKFFusionEngine()
    threading.Thread(target=engine.listen_udp, daemon=True).start()
    async with websockets.serve(ws_handler, "0.0.0.0", 8080):
        await asyncio.Future()

if __name__ == '__main__':
    asyncio.run(main())
