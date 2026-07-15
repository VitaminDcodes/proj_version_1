import multiprocessing
import sys
import time

# Import your four modules
import dvl_sender_v2
import gps_sender_v2
import imu_sender_v2
import fusion_engine_v2

if __name__ == '__main__':
    # CRITICAL: This line is required for PyInstaller multiprocessing on Windows
    multiprocessing.freeze_support()
    
    print("Starting CORATIA Backend Services...")

    # Create separate processes for each script
    # Replace 'run_dvl' etc., with whatever you named the functions in Step 1
    p_dvl = multiprocessing.Process(target=dvl_sender_v2.run_dvl)
    p_gps = multiprocessing.Process(target=gps_sender_v2.run_gps)
    p_imu = multiprocessing.Process(target=imu_sender_v2.run_imu)
    p_fusion = multiprocessing.Process(target=fusion_engine_v2.run_fusion)

    # Start all processes simultaneously
    p_dvl.start()
    p_gps.start()
    p_imu.start()
    p_fusion.start()

    try:
        # Keep the main program running while the background processes do their work
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down services...")
        p_dvl.terminate()
        p_gps.terminate()
        p_imu.terminate()
        p_fusion.terminate()
        sys.exit(0)
