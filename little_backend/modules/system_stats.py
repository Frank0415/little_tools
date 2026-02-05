"""System stats module for fetching hardware information"""
import psutil
import socket
import os
from typing import Dict, Optional


def get_system_stats() -> Dict:
    """Get current system stats including WiFi, battery, and power consumption"""
    
    # Battery info
    battery = psutil.sensors_battery()
    battery_info = {}
    if battery:
        battery_info = {
            "percent": round(battery.percent, 1),
            "plugged_in": battery.power_plugged,
            "time_left": battery.secsleft if battery.secsleft != psutil.POWER_TIME_UNLIMITED else None,
        }
    
    # Network info (WiFi)
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except Exception:
        local_ip = "N/A"
    
    # Network interfaces
    net_interfaces = psutil.net_if_addrs()
    wifi_info = {"connected": False, "interface": None, "ip": None}
    
    # Look for wireless interface (common names: wlan, wlp, wifi)
    for iface_name, addrs in net_interfaces.items():
        if any(prefix in iface_name.lower() for prefix in ["wlan", "wlp", "wifi", "wireless"]):
            for addr in addrs:
                if addr.family == socket.AF_INET:  # IPv4
                    wifi_info = {
                        "connected": True,
                        "interface": iface_name,
                        "ip": addr.address,
                    }
                    break
    
    # CPU info
    cpu_freq = psutil.cpu_freq()
    cpu_info = {
        "percent": round(psutil.cpu_percent(interval=0.1), 1),
        "freq_mhz": round(cpu_freq.current) if cpu_freq else None,
        "count": psutil.cpu_count(logical=True),
    }
    
    # Memory info
    mem = psutil.virtual_memory()
    memory_info = {
        "total_gb": round(mem.total / (1024 ** 3), 2),
        "used_gb": round(mem.used / (1024 ** 3), 2),
        "percent": round(mem.percent, 1),
    }
    
    # Power/Wattage (approximation from CPU + battery discharge rate)
    wattage = None
    if battery and not battery.power_plugged and battery.secsleft > 0:
        # Estimate wattage from battery drain rate
        # This is a rough estimate
        try:
            # Get energy info if available (Linux-specific)
            energy_now_path = "/sys/class/power_supply/BAT0/power_now"
            if os.path.exists(energy_now_path):
                with open(energy_now_path, "r") as f:
                    microwatts = int(f.read().strip())
                    wattage = round(microwatts / 1_000_000, 2)  # Convert to watts
        except Exception:
            pass
    
    return {
        "battery": battery_info,
        "wifi": wifi_info,
        "cpu": cpu_info,
        "memory": memory_info,
        "wattage": wattage,
        "hostname": hostname,
    }
