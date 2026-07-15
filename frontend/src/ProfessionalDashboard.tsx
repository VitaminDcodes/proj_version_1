import React, { useEffect, useState, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
// Notice: 'Cloud' has been removed from the imports to prevent the CDN crash
import { OrbitControls, Line, Box, Cylinder, Sphere, Text, Cone, Grid, Sky } from '@react-three/drei';
import * as THREE from 'three';
import './ProfessionalDashboard.css';

interface Telemetry {
  time: string; x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number; pitch: number; roll: number;
  status: string; sensor_state: number; satellites: number; fom: number; altitude: number;
  lat: number; lon: number; hdop: number;
  ax: number; ay: number; az: number;
  gps_drift: number; gps_drift_pct: number; depth_sensor_m: number;
  gps_alive: boolean; dvl_alive: boolean; imu_alive: boolean; compass_alive: boolean;
}

const STATE_COLOR: Record<number, string> = { 
  0: '#22c55e', 1: '#1e3a8a', 4: '#06b6d4', 2: '#f97316', 3: '#ef4444', 6: '#64748b'
};

const STATE_LABEL: Record<number, string> = { 
  0: 'GNSS SURFACE FIX', 1: 'DVL BOTTOM LOCK', 4: 'DEGRADED DVL LOCK', 
  2: 'DEAD RECKONING', 3: 'NAVIGATION FAILURE', 6: 'SYSTEM INITIALIZING'
};

const getStateColor = (s: number) => STATE_COLOR[s] ?? '#94a3b8';

// ==========================================
// UPGRADED HIGH-FIDELITY PUBG HUD OVERLAY
// ==========================================
const PubgHUD: React.FC<{ telemetry: Telemetry }> = ({ telemetry }) => {
  const speed = Math.sqrt(
    Math.pow(telemetry.vx ?? 0, 2) + 
    Math.pow(telemetry.vy ?? 0, 2) + 
    Math.pow(telemetry.vz ?? 0, 2)
  );
  
  const depth = Math.abs(telemetry.z ?? 0);
  
  let heading = (telemetry.yaw ?? 0) % 360;
  if (heading < 0) heading += 360;

  const pxPerDeg = 3.5; 

  const compassTicks = useMemo(() => {
    const marks = [];
    for (let deg = -180; deg <= 540; deg += 5) {
      const normalizedDeg = (deg + 360) % 360;
      let label = '';
      let isMajor = false;

      if (normalizedDeg === 0) { label = 'N'; isMajor = true; }
      else if (normalizedDeg === 45) { label = 'NE'; isMajor = true; }
      else if (normalizedDeg === 90) { label = 'E'; isMajor = true; }
      else if (normalizedDeg === 135) { label = 'SE'; isMajor = true; }
      else if (normalizedDeg === 180) { label = 'S'; isMajor = true; }
      else if (normalizedDeg === 225) { label = 'SW'; isMajor = true; }
      else if (normalizedDeg === 270) { label = 'W'; isMajor = true; }
      else if (normalizedDeg === 315) { label = 'NW'; isMajor = true; }
      else if (normalizedDeg % 15 === 0) {
        label = normalizedDeg.toString();
        isMajor = true;
      }

      marks.push({ deg, label, isMajor });
    }
    return marks;
  }, []);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10, fontFamily: '"Arial Narrow", "Impact", sans-serif', letterSpacing: '0.5px' }}>
      
      {/* 1. HORIZONTAL TACTICAL COMPASS TAPE */}
      <div style={{ 
        position: 'absolute', top: '25px', left: '50%', transform: 'translateX(-50%)', 
        width: '560px', height: '65px', 
        overflow: 'hidden',
        WebkitMaskImage: 'linear-gradient(to right, transparent, white 25%, white 75%, transparent)',
        maskImage: 'linear-gradient(to right, transparent, white 25%, white 75%, transparent)'
      }}>
        <div style={{ 
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', 
          width: 0, height: 0, 
          borderLeft: '6px solid transparent', borderRight: '6px solid transparent', 
          borderTop: '9px solid #ffffff', zIndex: 5 
        }} />
        
        <div style={{ 
          position: 'absolute', bottom: '6px', left: '280px', 
          display: 'flex', transform: `translateX(${-heading * pxPerDeg}px)`,
          height: '45px', transition: 'transform 0.05s linear'
        }}>
          {compassTicks.map((tick, idx) => {
            const isCurrentCenter = Math.abs(tick.deg - heading) < 2.5;
            return (
              <div key={idx} style={{ 
                position: 'absolute', left: `${tick.deg * pxPerDeg}px`, 
                display: 'flex', flexDirection: 'column', alignItems: 'center', width: '40px', transform: 'translateX(-50%)' 
              }}>
                <div style={{ 
                  height: tick.isMajor ? '12px' : '6px', 
                  width: '2px', 
                  background: '#ffffff', 
                  opacity: tick.isMajor ? 0.95 : 0.5 
                }} />
                
                {tick.label && (
                  <span style={{ 
                    color: '#ffffff', 
                    fontSize: isCurrentCenter ? '19px' : '14px', 
                    fontWeight: '700', 
                    marginTop: '5px',
                    textShadow: '0px 2px 4px rgba(0,0,0,0.9)',
                    opacity: isCurrentCenter ? 1.0 : 0.7
                  }}>
                    {tick.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. VERTICAL ALTITUDE / DEPTH GAUGE */}
      <div style={{ position: 'absolute', left: '45px', top: '50%', transform: 'translateY(-50%)', width: '130px', height: '280px', display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginRight: '14px', width: '75px', justifyContent: 'flex-end' }}>
          <span style={{ color: '#ffffff', fontSize: '28px', fontWeight: '700', textShadow: '0 2px 4px rgba(0,0,0,0.95)' }}>
            {depth.toFixed(0)}
          </span>
          <span style={{ color: '#ffffff', fontSize: '17px', fontWeight: '700', marginLeft: '2px', textShadow: '0 2px 4px rgba(0,0,0,0.95)' }}>
            M
          </span>
        </div>

        <div style={{ position: 'relative', width: '15px', height: '100%' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '2px', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.6)' }} />
          <div style={{ position: 'absolute', left: 0, top: 0, width: '10px', height: '2px', background: '#ffffff' }} />
          <div style={{ position: 'absolute', left: 0, bottom: 0, width: '10px', height: '2px', background: '#ffffff' }} />
          
          <div style={{ 
            position: 'absolute', left: 0, 
            top: `${Math.min(Math.max((depth % 40) * 6.5, 8), 272)}px`, 
            width: '8px', height: '2px', background: '#ffffff',
            transition: 'top 0.1s linear'
          }} />

          <div style={{ position: 'absolute', bottom: '-42px', left: '-12px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '30px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '3px', width: '14px', alignItems: 'center' }}>
              <div style={{ height: '1.5px', background: '#ffffff', width: '12px' }} />
              <div style={{ height: '1.5px', background: '#ffffff', width: '7px' }} />
            </div>
            <span style={{ color: '#ffffff', fontSize: '12px', fontWeight: '700', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
              ALT
            </span>
          </div>
        </div>
      </div>

      {/* 3. VERTICAL VELOCITY / SPEED GAUGE */}
      <div style={{ position: 'absolute', right: '45px', top: '50%', transform: 'translateY(-50%)', width: '150px', height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <div style={{ position: 'relative', width: '15px', height: '100%', marginRight: '14px' }}>
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '2px', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.6)' }} />
          
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} style={{ 
              position: 'absolute', left: i % 2 === 0 ? '2px' : '6px', top: `${i * 10}%`, 
              width: i % 2 === 0 ? '11px' : '7px', height: '2px', background: '#ffffff' 
            }} />
          ))}

          <span style={{ position: 'absolute', bottom: '-26px', right: '-4px', color: '#ffffff', fontSize: '12px', fontWeight: '700', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
            SPD
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', width: '85px' }}>
          <span style={{ color: '#ffffff', fontSize: '28px', fontWeight: '700', textShadow: '0 2px 4px rgba(0,0,0,0.95)' }}>
            {speed.toFixed(0)}
          </span>
          <span style={{ color: '#ffffff', fontSize: '15px', fontWeight: '700', marginLeft: '3px', textShadow: '0 2px 4px rgba(0,0,0,0.95)' }}>
            M/S
          </span>
        </div>
      </div>

    </div>
  );
};

const DistanceMarkers: React.FC<{ maxExtent: number }> = ({ maxExtent }) => {
  const step = Math.max(Math.floor(maxExtent / 3), 1);
  const fs = Math.max(maxExtent * 0.04, 0.08);
  const items = [];
  for (let i = step; i <= Math.ceil(maxExtent); i += step) {
    items.push(
      <React.Fragment key={i}>
        <Text position={[i,0.02,0]} fontSize={fs} color="#dc2626" rotation={[-Math.PI/2,0,0]} anchorX="center" anchorY="top">{i}m</Text>
        <Text position={[-i,0.02,0]} fontSize={fs} color="#dc2626" rotation={[-Math.PI/2,0,0]} anchorX="center" anchorY="top">-{i}m</Text>
        <Text position={[0,0.02,-i]} fontSize={fs} color="#16a34a" rotation={[-Math.PI/2,0,0]} anchorX="left" anchorY="middle">{i}m</Text>
        <Text position={[0,0.02,i]} fontSize={fs} color="#16a34a" rotation={[-Math.PI/2,0,0]} anchorX="left" anchorY="middle">-{i}m</Text>
        <Text position={[0,-i,0]} fontSize={fs} color="#2dd4bf" rotation={[0,0,0]} anchorX="left" anchorY="middle">{i}m↓</Text>
      </React.Fragment>
    );
  }
  return <>{items}</>;
};

// ========================================================
// NATIVE HIGH-PERFORMANCE SAT MAP GENERATOR FOR 3D CANVAS
// ========================================================
interface SatelliteGroundProps {
  homeCoord: { lat: number; lon: number } | null;
}

const SatelliteGround: React.FC<SatelliteGroundProps> = ({ homeCoord }) => {
  if (!homeCoord) return null;

  const zoom = 18; // Direct matching level zoom mapping
  const n = Math.pow(2, zoom);
  const latRad = (homeCoord.lat * Math.PI) / 180;

  // Convert Home coordinates directly to core Mercator tile points
  const centerXTile = Math.floor(((homeCoord.lon + 180) / 360) * n);
  const centerYTile = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );

  // Compute exact meters per tile width bound at this target latitude
  const tileSizeMeters = (40075016.686 * Math.cos(latRad)) / n;

  const tiles = [];
  // Build a 3x3 high-res local world matrix array around the origin
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tileX = centerXTile + dx;
      const tileY = centerYTile + dy;

      const url = `https://mt1.google.com/vt/lyrs=s&x=${tileX}&y=${tileY}&z=${zoom}`;
      
      // Map local coordinates directly to match ThreeJS coordinate system space:
      // X = Easting, Y = Northing (maps to -Z in our 3D space orientation context)
      const posX = dx * tileSizeMeters;
      const posZ = dy * tileSizeMeters;

      tiles.push({ url, posX, posZ });
    }
  }

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      {tiles.map((tile, i) => (
        <TileMesh key={i} url={tile.url} size={tileSizeMeters} posX={tile.posX} posY={-tile.posZ} />
      ))}
    </group>
  );
};

const TileMesh: React.FC<{ url: string; size: number; posX: number; posY: number }> = ({ url, size, posX, posY }) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'Anonymous';
    loader.load(url, (tex) => {
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      setTexture(tex);
    });
  }, [url]);

  if (!texture) return null;

  return (
    <mesh position={[posX, posY, 0]}>
      <planeGeometry args={[size, size, 16, 16]} />
      <meshStandardMaterial map={texture} roughness={0.7} metalness={0.0} side={THREE.DoubleSide} />
    </mesh>
  );
};

const Fit3DView: React.FC<{ trigger: number, threePoints: THREE.Vector3[], controlsRef: any }> = ({ trigger, threePoints, controlsRef }) => {
  const { camera } = useThree();
  const pointsRef = useRef(threePoints);
  
  useEffect(() => { pointsRef.current = threePoints; }, [threePoints]);

  useEffect(() => {
    if (trigger > 0 && pointsRef.current.length > 0) {
      const box = new THREE.Box3().setFromPoints(pointsRef.current);
      const center = new THREE.Vector3(); box.getCenter(center);
      const size = new THREE.Vector3(); box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 5); 
      
      camera.position.set(center.x - maxDim * 1.5, center.y + maxDim, center.z + maxDim * 1.5);
      
      if (controlsRef.current) {
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }
    }
  }, [trigger, camera, controlsRef]); 
  return null;
};

const ROVModel: React.FC<{ telemetry: Telemetry; stateColor: string }> = ({ telemetry, stateColor }) => {
  const YELL = '#eab308'; const BLK = '#171717'; const LENS = '#94a3b8';
  const entireRovRef = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    if (entireRovRef.current) {
      const rovPos = new THREE.Vector3(telemetry.x ?? 0, -Math.abs(telemetry.z ?? 0), -(telemetry.y ?? 0));
      const distance = camera.position.distanceTo(rovPos);
      const scaleFactor = Math.max(1.0, distance * 0.15);
      
      entireRovRef.current.scale.lerp(new THREE.Vector3(scaleFactor, scaleFactor, scaleFactor), 0.1);
      entireRovRef.current.position.lerp(rovPos, 0.15);

      const yaw = -(telemetry.yaw ?? 0) * (Math.PI / 180);
      const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
      entireRovRef.current.quaternion.slerp(targetQuat, 0.15);
    }
  });

  return (
    <group ref={entireRovRef}>
      <group scale={[0.28, 0.28, 0.28]}>
        <Box args={[0.7, 0.28, 0.6]} position={[0, 0.1, 0]}><meshStandardMaterial color={YELL} /></Box>
        <Box args={[0.55, 0.26, 0.7]} position={[0, 0.08, 0]}><meshStandardMaterial color={YELL} /></Box>
        <Cylinder args={[0.015, 0.015, 0.75, 8]} position={[0, -0.15, 0.3]} rotation={[0,0,Math.PI/2]}><meshStandardMaterial color={BLK} /></Cylinder>
        <Cylinder args={[0.015, 0.015, 0.75, 8]} position={[0, -0.15, -0.3]} rotation={[0,0,Math.PI/2]}><meshStandardMaterial color={BLK} /></Cylinder>
        <Sphere args={[0.07, 16, 16]} position={[0, 0.06, -0.16]}><meshStandardMaterial color={LENS} /></Sphere>
        <Sphere args={[0.07, 16, 16]} position={[0, 0.06, 0.16]}><meshStandardMaterial color={LENS} /></Sphere>
        <Box args={[0.3, 0.01, 0.02]} position={[0, 0.245, 0]}><meshStandardMaterial color={stateColor} emissive={new THREE.Color(stateColor)} emissiveIntensity={2.0} /></Box>
        <group position={[1.0, 0.1, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <Cylinder args={[0.03, 0.03, 0.5, 8]} position={[0, -0.75, 0]}><meshStandardMaterial color="#4285F4" /></Cylinder>
          <Cone args={[0.16, 0.5, 20]} position={[0, -0.35, 0]}><meshStandardMaterial color="#4285F4" /></Cone>
        </group>
      </group>
    </group>
  );
};

const CameraChaseController: React.FC<{ telemetry: Telemetry; active: boolean }> = ({ telemetry, active }) => {
  const { camera } = useThree();
  
  useFrame(() => {
    if (!active) return;
    const targetX = telemetry.x ?? 0;
    const targetY = -Math.abs(telemetry.z ?? 0);
    const targetZ = -(telemetry.y ?? 0);
    const headingRad = -(telemetry.yaw ?? 0) * (Math.PI / 180);

    const offsetVector = new THREE.Vector3(-3.8, 4.5, 0);
    offsetVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), headingRad);

    const cameraTargetX = targetX + offsetVector.x;
    const cameraTargetY = targetY + offsetVector.y;
    const cameraTargetZ = targetZ + offsetVector.z;

    camera.position.lerp(new THREE.Vector3(cameraTargetX, cameraTargetY, cameraTargetZ), 0.08);
    camera.lookAt(new THREE.Vector3(targetX, targetY, targetZ));
  });

  return null;
};

const ProfessionalDashboard: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const controlsRef = useRef<any>(null); 
  const measureLayer = useRef<L.LayerGroup>(L.layerGroup()); 
  const resurfaceLayer = useRef<L.LayerGroup>(L.layerGroup()); 
  const mapSegments = useRef<L.Polyline[]>([]);
  const [mapCentered, setMapCentered] = useState<boolean>(false);
  
  const [currentHome, setCurrentHome] = useState<{lat: number; lon: number} | null>(null);
  const homeCoord = useRef<{lat: number, lon: number} | null>(null);

  const [telemetry, setTelemetry] = useState<Telemetry>({
    time: '', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, roll: 0, status: 'Disconnected', sensor_state: 6, satellites: 0, fom: 99.9, altitude: 0, lat: 0, lon: 0, hdop: 99.9, ax: 0, ay: 0, az: 1, gps_drift: 0, gps_drift_pct: 0, depth_sensor_m: 0, gps_alive: false, dvl_alive: false, imu_alive: false, compass_alive: false
  });
  
  const [history, setHistory] = useState<Telemetry[]>([]);
  const [sidebarTab, setSidebarTab] = useState<'telemetry'|'sensors'>('telemetry');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const recordingRef = useRef<boolean>(false);
  const [pointsCount, setPointsCount] = useState<number>(0);
  const csvBuffer = useRef<Telemetry[]>([]);
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const measurePoints = useRef<L.LatLng[]>([]);
  const [resurfaceMarkers, setResurfaceMarkers] = useState<THREE.Vector3[]>([]);
  const wasSubmergedRef = useRef<boolean>(false);

  const [trackingActive, setTrackingActive] = useState<boolean>(true);
  const [trigger3DFit, setTrigger3DFit] = useState<number>(0);
  
  const [isIsometric, setIsIsometric] = useState<boolean>(false);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      const full = { 
        ...d, 
        time: new Date().toLocaleTimeString(),
        status: d.status ?? 'Live Stream Active',
        ax: d.ax ?? 0, ay: d.ay ?? 0, az: d.az ?? 1,
        altitude: d.altitude ?? d.dvl_alt ?? d.dvl_altitude ?? 0 
      };
      
      setTelemetry(full);
      
      if (recordingRef.current) {
        csvBuffer.current.push(full);
        setPointsCount(csvBuffer.current.length);
      }

      const currentDepth = d.depth_sensor_m ?? 0;
      if (!wasSubmergedRef.current && currentDepth > 0.25) {
        wasSubmergedRef.current = true; 
      } else if (wasSubmergedRef.current && currentDepth < 0.12) {
        const markerPos = new THREE.Vector3(d.x ?? 0, -Math.abs(d.z ?? 0), -(d.y ?? 0));
        setResurfaceMarkers(prev => [...prev, markerPos]);
        wasSubmergedRef.current = false; 
      }

      setHistory(prev => { 
        if (prev.length > 0 && prev[prev.length-1].x === full.x && prev[prev.length-1].y === full.y) {
           return prev; 
        }
        const next = [...prev, full]; 
        if (next.length > 100000) next.shift(); 
        return next; 
      });
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    
    mapInstance.current = L.map(mapRef.current, { 
      zoomControl: true, 
      attributionControl: false,
      maxZoom: 24, 
      minZoom: 1
    }).setView([0, 0], 2);
    
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { 
      maxZoom: 24,
      maxNativeZoom: 20, 
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: 'Imagery © Google'
    }).addTo(mapInstance.current);
    
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapInstance.current);
    measureLayer.current.addTo(mapInstance.current);
    resurfaceLayer.current.addTo(mapInstance.current);

    const CompassControl = L.Control.extend({
        onAdd: () => {
            const div = L.DomUtil.create('div', 'leaflet-bar');
            div.innerHTML = `
              <div style="width: 85px; height: 85px; background: rgba(15,23,42,0.9); border-radius: 50%; border: 3px solid #475569; position: relative; box-shadow: 0 4px 12px rgba(0,0,0,0.6);">
                  <div style="position: absolute; top: 3px; left: 50%; transform: translateX(-50%); color: #ef4444; font-weight: bold; font-family: monospace; font-size: 14px; user-select:none;">N</div>
                  <div style="position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%); color: #94a3b8; font-weight: bold; font-family: monospace; font-size: 14px; user-select:none;">S</div>
                  <div style="position: absolute; left: 4px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-weight: bold; font-family: monospace; font-size: 14px; user-select:none;">W</div>
                  <div style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-weight: bold; font-family: monospace; font-size: 14px; user-select:none;">E</div>
                  <div id="map-compass" style="position: absolute; top: 18px; left: 18px; width: 44px; height: 44px; transition: transform 0.08s linear;">
                      <div style="width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 22px solid #ef4444; position: absolute; left: 14px; top: 0;"></div>
                      <div style="width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 22px solid #cbd5e1; position: absolute; left: 14px; bottom: 0;"></div>
                  </div>
              </div>
            `;
            return div;
        }
    });
    mapInstance.current.addControl(new CompassControl({ position: 'topright' }));
    markerRef.current = L.marker([0, 0]).addTo(mapInstance.current);

    mapInstance.current.on('dragstart', () => setTrackingActive(false));
    mapInstance.current.on('zoomstart', () => setTrackingActive(false));
    mapInstance.current.on('mousedown', () => setTrackingActive(false));
    mapInstance.current.on('wheel', () => setTrackingActive(false));

    mapInstance.current.on('click', (e: any) => {
        if (!isMeasuring) return;
        measurePoints.current.push(e.latlng);
        L.circleMarker(e.latlng, { radius: 5, color: '#eab308' }).addTo(measureLayer.current);
        
        if (measurePoints.current.length === 2) {
            const dist = measurePoints.current[0].distanceTo(measurePoints.current[1]);
            L.polyline(measurePoints.current, { color: '#eab308', weight: 4, dashArray: '5, 5' }).addTo(measureLayer.current);
            alert(`Measured Distance: ${dist.toFixed(2)} meters`);
            measurePoints.current = []; 
            setTimeout(() => measureLayer.current.clearLayers(), 4000); 
        }
    });
  }, [isMeasuring]);

  useEffect(() => {
    if (!mapInstance.current || !homeCoord.current) return;
    
    resurfaceLayer.current.clearLayers();
    resurfaceMarkers.forEach(pos => {
      const localX = pos.x;
      const localY = -pos.z; 
      
      const OLat = homeCoord.current!.lat;
      const OLon = homeCoord.current!.lon;

      const cLat = OLat + localY / 111320;
      const cLon = OLon + localX / (111320 * Math.cos(OLat * Math.PI / 180));
      
      L.circleMarker([cLat, cLon], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#ef4444',
        fillOpacity: 1.0
      }).bindPopup(`<div style="font-family:monospace;font-size:11px;font-weight:bold;color:#ef4444;">🔴 RESURFACE DETECTED</div>`, { className: 'custom-dark-popup' })
      .addTo(resurfaceLayer.current);
    });
  }, [resurfaceMarkers]);

  const fitMapToPath = () => {
    setTrackingActive(false);
    if (!mapInstance.current || history.length === 0 || !homeCoord.current) return;

    const OLat = homeCoord.current.lat;
    const OLon = homeCoord.current.lon;

    const minX = Math.min(...history.map(h => h.x ?? 0));
    const maxX = Math.max(...history.map(h => h.x ?? 0));
    const minY = Math.min(...history.map(h => h.y ?? 0));
    const maxY = Math.max(...history.map(h => h.y ?? 0));

    const lat1 = OLat + minY / 111320;
    const lon1 = OLon + minX / (111320 * Math.cos(OLat * Math.PI / 180));
    const lat2 = OLat + maxY / 111320;
    const lon2 = OLon + maxX / (111320 * Math.cos(OLat * Math.PI / 180));

    if (lat1 === lat2 && lon1 === lon2) {
      mapInstance.current.setView([lat1, lon1], 22);
    } else {
      mapInstance.current.fitBounds([[lat1, lon1], [lat2, lon2]], { padding: [50, 50], maxZoom: 22, animate: true, duration: 0.5 });
    }
  };

  useEffect(() => {
    const compassEl = document.getElementById('map-compass');
    if (compassEl) {
        compassEl.style.transform = `rotate(${-telemetry.yaw}deg)`;
    }

    if (!mapInstance.current || !markerRef.current) return;

    const size = 32; 
    
    const svgChevron = `
        <svg viewBox="0 0 24 24" width="100%" height="100%">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5"/>
        </svg>
    `;

    const headingIcon = L.divIcon({
        className: 'rov-marker',
        html: `<div style="transform: rotate(${telemetry.yaw}deg); width: ${size}px; height: ${size}px; filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.8));">
                  ${svgChevron}
               </div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
    
    markerRef.current?.setIcon(headingIcon);

  }, [telemetry.yaw, telemetry.sensor_state]);

  useEffect(() => {
    if (!mapInstance.current || history.length === 0) return;
    const curPt = history[history.length - 1];

    if (typeof curPt.lat === 'number' && curPt.lat !== 0.0 && !homeCoord.current) {
      const calculatedHomeLat = curPt.lat - (curPt.y ?? 0) / 111320;
      const calculatedHomeLon = curPt.lon - (curPt.x ?? 0) / (111320 * Math.cos(calculatedHomeLat * Math.PI / 180));
      
      const lockedHome = { lat: calculatedHomeLat, lon: calculatedHomeLon };
      homeCoord.current = lockedHome;
      setCurrentHome(lockedHome); 
      
      mapInstance.current.setView([curPt.lat, curPt.lon], 22);
      
      L.circle([calculatedHomeLat, calculatedHomeLon], { 
        color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.8, radius: 0.5 
      }).addTo(mapInstance.current);
      
      setMapCentered(true);
    }

    if (!homeCoord.current) return;
    const OLat = homeCoord.current.lat; 
    const OLon = homeCoord.current.lon;

    const cLat = OLat + (curPt.y ?? 0) / 111320; 
    const cLon = OLon + (curPt.x ?? 0) / (111320 * Math.cos(OLat * Math.PI / 180));
    const currentLatLng = new L.LatLng(cLat, cLon);

    markerRef.current?.setLatLng(currentLatLng);

    if (trackingActive) {
      mapInstance.current.panTo(currentLatLng, { animate: true, duration: 0.25 });
    }

    if (history.length > 1) {
      const prevPt = history[history.length - 2];
      const pLat = OLat + (prevPt.y ?? 0) / 111320;
      const pLon = OLon + (prevPt.x ?? 0) / (111320 * Math.cos(OLat * Math.PI / 180));
      const prevLatLng = new L.LatLng(pLat, pLon);
      const pathColor = getStateColor(curPt.sensor_state);
      
      const outline = L.polyline([prevLatLng, currentLatLng], { color: '#000000', weight: 8, opacity: 0.6, lineCap: 'round', lineJoin: 'round' }).addTo(mapInstance.current);
      const inner = L.polyline([prevLatLng, currentLatLng], { color: pathColor, weight: 4, opacity: 1.0, lineCap: 'round', lineJoin: 'round' }).addTo(mapInstance.current);
      
      inner.bindPopup(`
        <div style="font-family:monospace;font-size:12px;padding:4px;line-height:1.4;">
          <b style="color:#eab308; font-size:14px;">📍 ${curPt.time ?? ''}</b><br/>
          <hr style="border:0; border-top:1px solid #334155; margin:6px 0;"/>
          <span style="color:#94a3b8">X Axis:</span> <b style="color:#38bdf8">${(curPt.x ?? 0).toFixed(2)}m</b><br/>
          <span style="color:#94a3b8">Y Axis:</span> <b style="color:#38bdf8">${(curPt.y ?? 0).toFixed(2)}m</b><br/>
          <span style="color:#94a3b8">Depth :</span> <b style="color:#2dd4bf">${Math.abs(curPt.z ?? 0).toFixed(2)}m</b>
        </div>`, { className: 'custom-dark-popup', closeButton: false });
        
      inner.on('mouseover', (e) => e.target.openPopup());
      inner.on('mouseout', (e) => e.target.closePopup());
      
      mapSegments.current.push(outline, inner);
    }
  }, [history, trackingActive]);

  const toggleRecording = () => {
    if (!recordingRef.current) {
      csvBuffer.current = []; setPointsCount(0); recordingRef.current = true; setIsRecording(true);
    } else {
      recordingRef.current = false; setIsRecording(false);
    }
  };

  const toggleMeasure = () => {
    setIsMeasuring(!isMeasuring); measurePoints.current = []; measureLayer.current.clearLayers();
  };

  const triggerCSVExport = () => {
    if (csvBuffer.current.length === 0) return;
    const headers = ['Timestamp', 'Latitude', 'Longitude', 'Local_X_m', 'Local_Y_m', 'Pressure_Depth_m', 'DVL_Altitude_m', 'Linear_Vx_ms', 'Linear_Vy_ms', 'Gyro_Heading_Yaw', 'Satellites_Count', 'DVL_FOM', 'Navigation_Drift_m'].join(',');
    const rows = csvBuffer.current.map(r => [r.time, r.lat, r.lon, (r.x ?? 0).toFixed(3), (r.y ?? 0).toFixed(3), (r.depth_sensor_m ?? 0).toFixed(2), (r.altitude ?? 0).toFixed(2), (r.vx ?? 0).toFixed(3), (r.vy ?? 0).toFixed(3), (r.yaw ?? 0).toFixed(1), r.satellites ?? 0, (r.fom ?? 99.9).toFixed(4), (r.gps_drift ?? 0).toFixed(2)].join(','));
    const blob = new Blob([headers + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.setAttribute('download', `CORATIA_Tether_Log_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const threePoints = useMemo(() => history.map(h => new THREE.Vector3(h.x ?? 0, -Math.abs(h.z ?? 0), -(h.y ?? 0))), [history]);
  const threeColors = useMemo(() => history.map(h => new THREE.Color(getStateColor(h.sensor_state))), [history]);
  
  const maxExtent = useMemo(() => {
    if (!threePoints.length) return 5;
    let rawMax = Math.max(5, ...threePoints.map(p => Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z))));
    return Math.min(rawMax, 15);
  }, [threePoints]);

  const cur = telemetry; 
  const stateColor = getStateColor(cur.sensor_state);

  return (
    <div className="db">
      <div className="topbar">
        <div className="topbar-left">
          <div className="logo">CORATIA MISSION CONTROL</div>
          <div className="conn-badge">
            <span className={`live-dot ${cur.status?.includes('FAULT') || cur.status?.includes('WARN') ? 'offline' : ''}`}></span>
            {cur.status ?? 'Awaiting Pipeline...'}
          </div>
          <div className="topbar-actions">
            <button className="btn-rec" style={{background: trackingActive ? '#22c55e' : '#334155', fontWeight: 'bold'}} onClick={() => {
              if (!trackingActive) {
                setTrackingActive(true);
                setTrigger3DFit(0);
              } else {
                setTrackingActive(false);
              }
            }}>
              {trackingActive ? '🛰️ TRACK LOCK ENGAGED' : '🛰️ TRACK VEHICLE'}
            </button>
            <button className="btn-rec" style={{background: isMeasuring ? '#eab308' : '#334155'}} onClick={toggleMeasure}>
              {isMeasuring ? '📏 MEASURING MODE ACTIVE' : '📏 2D DISTANCE RULER'}
            </button>
            <button className={`btn-rec ${isRecording ? 'recording' : ''}`} onClick={toggleRecording}>
              {isRecording ? `🔴 STOP RECORDING (${pointsCount})` : '⚪ START RECORDING'}
            </button>
            <button className="btn-exp" onClick={triggerCSVExport} disabled={isRecording || pointsCount === 0}>↓ EXPORT CSV</button>
          </div>
        </div>
        <div className="top-stats">
          <div className="stat-item"><span className="stat-label">NAV STATE MATRIX</span><span className="stat-val" style={{ color: stateColor }}>{STATE_LABEL[cur.sensor_state] ?? 'Standby'}</span></div>
          <div className="stat-item"><span className="stat-label">GNSS SATS</span><span className="stat-val">{cur.satellites ?? 0}</span></div>
          <div className="stat-item"><span className="stat-label">DVL FOM</span><span className="stat-val">{(cur.fom ?? 99.9).toFixed(3)}</span></div>
          <div className="stat-item"><span className="stat-label">TRUE GYRO HEADING</span><span className="stat-val">{(cur.yaw ?? 0).toFixed(0)}°</span></div>
        </div>
      </div>

      <div className="panels">
        
        <div className="panel panel-3d" style={{ flex: 1, position: 'relative' }}>
          
          <button className="fit-btn" onClick={() => { setTrackingActive(false); setTrigger3DFit(prev => prev + 1); }}>
            ⛶ FIT 3D PATH
          </button>

          <div className="ph"><span className="plabel">3D SPATIAL MISSION TRAJECTORY</span></div>
          
          <div className="hud-tr">
            <div className="hud-card" style={{ borderColor: '#2dd4bf' }}><span className="hud-label">DEPTH SENSOR</span><span className="hud-val" style={{ color: '#2dd4bf' }}>{(cur.depth_sensor_m ?? 0).toFixed(2)}m</span></div>
            <div className="hud-card" style={{ borderColor: stateColor }}><span className="hud-label">EKF DEPLOYED DEPTH</span><span className="hud-val" style={{ color: stateColor }}>{Math.abs(cur.z ?? 0).toFixed(2)}m</span></div>
            <div className="hud-card">
               <span className="hud-label">DVL SEABED ALTITUDE</span>
               <span className="hud-val" style={{ color: (cur.altitude && cur.altitude > 0) ? '#2dd4bf' : '#ef4444' }}>
                 {(cur.altitude && cur.altitude > 0) ? `${cur.altitude.toFixed(2)}m` : 'NO LOCK'}
               </span>
            </div>
          </div>
          
          <div className="traj-panel" style={{ position: 'relative', width: '100%', height: '100%' }}>
            
            <PubgHUD telemetry={cur} />

            <button 
              style={{ position: 'absolute', bottom: '20px', right: '20px', zIndex: 20, background: isIsometric ? '#eab308' : '#334155', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              onClick={() => setIsIsometric(!isIsometric)}
            >
              {isIsometric ? '🔄 FREE CAMERA' : '📐 ISOMETRIC LOCK'}
            </button>

            <Canvas gl={{ antialias: true }}>
              {/* SKY SYSTEM ENVIRONMENT LAYERS */}
              <Sky distance={450000} sunPosition={[100, 45, 100]} inclination={0} azimuth={0.25} />
              <ambientLight intensity={0.7} />
              <directionalLight position={[50, 150, 50]} intensity={1.8} />

              {[0, -5, -10, -15, -20].map((depthLvl) => (
                <Grid 
                  key={`grid-${depthLvl}`}
                  position={[0, 0, 0]} 
                  args={[30, 30]} 
                  cellSize={1} 
                  cellThickness={1} 
                  // FIXED COLORS: Using solid darker slate grays instead of rgba strings
                  cellColor="rgba(56, 189, 248, 0.2)" 
                  sectionSize={5} 
                  sectionThickness={1.5} 
                  sectionColor="rgba(56, 189, 248, 0.4)"  
                  fadeDistance={40} 
                  fadeStrength={3} 
                  infiniteGrid 
                />
              ))}

              <OrbitControls 
                ref={controlsRef} 
                makeDefault 
                minDistance={0.1} 
                maxDistance={500} 
                target={trackingActive ? [cur.x ?? 0, -Math.abs(cur.z ?? 0), -(cur.y ?? 0)] : [0,0,0]}
                onStart={() => setTrackingActive(false)}
                maxPolarAngle={isIsometric ? Math.PI / 3 : Math.PI}
                minPolarAngle={isIsometric ? Math.PI / 3 : 0}
                maxAzimuthAngle={isIsometric ? Math.PI / 4 : Infinity}
                minAzimuthAngle={isIsometric ? Math.PI / 4 : -Infinity}
              />
              
              <axesHelper args={[10]} />
              <DistanceMarkers maxExtent={maxExtent} />
              
              <group position={[0,0,0]}>
                <Sphere args={[0.09, 16, 16]}><meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.5} /></Sphere>
              </group>
              
              {resurfaceMarkers.map((pos, idx) => (
                <group position={pos} key={idx}>
                  <Sphere args={[0.12, 16, 16]}><meshStandardMaterial color="#ef4444" roughness={0.2} /></Sphere>
                </group>
              ))}
              
              {threePoints.length > 1 && (
                <Line key={threePoints.length} points={threePoints} vertexColors={threeColors} lineWidth={10} />
              )}
              
              <CameraChaseController telemetry={cur} active={trackingActive && !isIsometric} />
              <ROVModel telemetry={cur} stateColor={stateColor} />
              <Fit3DView trigger={trigger3DFit} threePoints={threePoints} controlsRef={controlsRef} />
            </Canvas>
          </div>
        </div>
        
        <div className="panel panel-map" style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          
          <button className="fit-btn" onClick={fitMapToPath} style={{ zIndex: 1000 }}>
            ⛶ FIT 2D PATH
          </button>

          {!trackingActive && mapCentered && (
             <button className="recenter-btn" onClick={() => { setTrackingActive(true); setTrigger3DFit(0); }} style={{ zIndex: 1000 }}>
               <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                 <circle cx="12" cy="12" r="10"></circle>
                 <circle cx="12" cy="12" r="3"></circle>
               </svg>
             </button>
          )}

          <div className="map-panel" ref={mapRef} style={{ height: '100%', width: '100%', zIndex: 1 }}></div>
          {!mapCentered && (
            <div className="map-gcs-overlay" style={{ zIndex: 1000 }}><span className="gcs-warn-pulse">⚠️ AWAITING SURFACE INITIALIZATION MATRIX LOCK</span></div>
          )}
        </div>
        
        <div className="sidebar">
          <div className="sb-tabs">
            <button className={`sb-tab ${sidebarTab === 'telemetry' ? 'active' : ''}`} onClick={() => setSidebarTab('telemetry')}>Telemetry</button>
            <button className={`sb-tab ${sidebarTab === 'sensors' ? 'active' : ''}`} onClick={() => setSidebarTab('sensors')}>Sensors</button>
          </div>
          {sidebarTab === 'telemetry' && (
            <div className="sb-content">
              <div className="sb-section">
                <div className="sb-title">GNSS Global Positioning</div>
                <div className="sb-row"><span className="sb-key">Latitude</span><span className="sb-val">{(cur.lat ?? 0).toFixed(6)}°</span></div>
                <div className="sb-row"><span className="sb-key">Longitude</span><span className="sb-val">{(cur.lon ?? 0).toFixed(6)}°</span></div>
                <div className="sb-row"><span className="sb-key">HDOP</span><span className="sb-val">{(cur.hdop ?? 99.9).toFixed(2)}</span></div>
              </div>
              <div className="sb-section">
                <div className="sb-title">Relative Transform Coordinates</div>
                <div className="sb-row"><span className="sb-key">Local Northing (Y)</span><span className="sb-val">{(cur.y ?? 0).toFixed(3)} m</span></div>
                <div className="sb-row"><span className="sb-key">Local Easting (X)</span><span className="sb-val">{(cur.x ?? 0).toFixed(3)} m</span></div>
                <div className="sb-row"><span className="sb-key">Heave Position (Z)</span><span className="sb-val teal">{(cur.z ?? 0).toFixed(3)} m</span></div>
              </div>
              <div className="sb-section">
                <div className="sb-title">Acoustic Speeds</div>
                <div className="sb-row"><span className="sb-key">Forward Velocity (Vx)</span><span className="sb-val teal">{(cur.vx ?? 0).toFixed(3)} m/s</span></div>
                <div className="sb-row"><span className="sb-key">Lateral Velocity (Vy)</span><span className="sb-val teal">{(cur.vy ?? 0).toFixed(3)} m/s</span></div>
              </div>
              <div className="sb-section">
                <div className="sb-title">Project Drift Analysis</div>
                <div className="sb-row"><span className="sb-key">Drift error</span><span className="sb-val" style={{color: (cur.gps_drift ?? 0) > 2 ? '#ef4444' : '#22c55e'}}>{(cur.gps_drift ?? 0).toFixed(2)} m</span></div>
                <div className="sb-row"><span className="sb-key">Drift Ratio %</span><span className="sb-val">{(cur.gps_drift_pct ?? 0).toFixed(1)} %</span></div>
              </div>
            </div>
          )}
          {sidebarTab === 'sensors' && (
            <div className="sb-content">
              <div className="sb-section">
                <div className="sb-title">Hardware Pipeline Link Status</div>
                <div className="sensor-row"><span className="sensor-dot" style={{ background: cur.imu_alive ? '#22c55e' : '#ef4444' }}></span><span className="sensor-name">IMU Accel/Gyro Core</span><span className="sensor-status" style={{color: cur.imu_alive ? '#22c55e' : '#ef4444'}}>{cur.imu_alive ? 'NOMINAL' : 'LOST'}</span></div>
                <div className="sensor-row"><span className="sensor-dot" style={{ background: cur.compass_alive ? '#22c55e' : '#ef4444' }}></span><span className="sensor-name">Digital Magnetometer</span><span className="sensor-status" style={{color: cur.compass_alive ? '#22c55e' : '#ef4444'}}>{cur.compass_alive ? 'NOMINAL' : 'LOST'}</span></div>
                <div className="sensor-row"><span className="sensor-dot" style={{ background: cur.dvl_alive ? '#22c55e' : '#ef4444' }}></span><span className="sensor-name">Acoustic DVL Array</span><span className="sensor-status" style={{color: cur.dvl_alive ? '#22c55e' : '#ef4444'}}>{cur.dvl_alive ? 'NOMINAL' : 'LOST'}</span></div>
                <div className="sensor-row"><span className="sensor-dot" style={{ background: cur.gps_alive ? '#22c55e' : '#ef4444' }}></span><span className="sensor-name">GNSS Antenna Array</span><span className="sensor-status" style={{color: cur.gps_alive ? '#22c55e' : '#ef4444'}}>{cur.gps_alive ? 'NOMINAL' : 'LOST'}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfessionalDashboard;
