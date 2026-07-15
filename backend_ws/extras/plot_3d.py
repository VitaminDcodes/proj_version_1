import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
from matplotlib import cm

# Load the CSV file (adjust filename if needed)
df = pd.read_csv("CORATIA_Tether_Log_2026-06-16 (1).csv")

# Prepare data
x = df['Local_X_m'].values
y = df['Local_Y_m'].values
z = -df['Pressure_Depth_m'].values   # negative depth for upward is positive

# Velocity components (already in body frame, but we rotate them? We'll just plot raw DVL velocities)
vx = df['Linear_Vx_ms'].values
vy = df['Linear_Vy_ms'].values
heading = df['Gyro_Heading_Yaw'].values
drift = df['Navigation_Drift_m'].values

# Time index for colour mapping
time_idx = np.arange(len(df))

# Downsample for quiver arrows (plot every N-th point)
step = 10
x_q = x[::step]
y_q = y[::step]
z_q = z[::step]
vx_q = vx[::step]
vy_q = vy[::step]
# For 3D quiver, we need a vertical component (we set to 0)
vz_q = np.zeros_like(vx_q)

# Create figure
fig = plt.figure(figsize=(14, 10))
ax = fig.add_subplot(111, projection='3d')

# 1. Plot trajectory, colour by heading
sc = ax.scatter(x, y, z, c=heading, cmap='hsv', s=2, alpha=0.8, label='Trajectory (heading)')
# 2. Plot quiver arrows (velocity) – scaled for visibility
scale_factor = 0.1   # adjust to make arrows visible
ax.quiver(x_q, y_q, z_q, vx_q*scale_factor, vy_q*scale_factor, vz_q,
          color='red', arrow_length_ratio=0.2, alpha=0.6, label='DVL Velocity')

# 3. Add colourbar for heading
cbar = fig.colorbar(sc, ax=ax, shrink=0.5, aspect=20)
cbar.set_label('Gyro Heading (°)')

# Labels and title
ax.set_xlabel('Local Easting X (m)')
ax.set_ylabel('Local Northing Y (m)')
ax.set_zlabel('Depth Z (m) (negative downward)')
ax.set_title('3D Trajectory with DVL Velocity Arrows\nColoured by Heading')

# Optionally, mark start and end
ax.scatter(x[0], y[0], z[0], color='green', s=50, label='Start')
ax.scatter(x[-1], y[-1], z[-1], color='red', s=50, label='End')

# Legend
ax.legend()

# Show the plot
plt.tight_layout()
plt.show()

# Second plot: 2D top view with drift magnitude as colour
fig2, ax2 = plt.subplots(figsize=(12, 8))
sc2 = ax2.scatter(x, y, c=drift, cmap='plasma', s=3, alpha=0.8)
ax2.set_xlabel('Local Easting X (m)')
ax2.set_ylabel('Local Northing Y (m)')
ax2.set_title('Top View: Trajectory coloured by Navigation Drift (m)')
cbar2 = fig2.colorbar(sc2, ax=ax2, shrink=0.8)
cbar2.set_label('Drift (m)')
ax2.axis('equal')
plt.tight_layout()
plt.show()
