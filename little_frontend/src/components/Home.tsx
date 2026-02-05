import { useState, useEffect } from "react";
import { getSystemStats, SystemStats, getSettings, getAssignments } from "../lib/api";

type HomeProps = {
  onNavigateToArch: () => void;
  onTriggerAurUpgrade: () => void;
};

const ARCH_LOGO = `
                   -\`                    
                  .o+\`                   
                 \`ooo/                   
                \`+oooo:                  
               \`+oooooo:                 
               -+oooooo+:                
             \`/:-:++oooo+:               
            \`/++++/+++++++:              
           \`/++++++++++++++:             
          \`/+++ooooooooooooo/\`           
         ./ooosssso++osssssso+\`          
        .oossssso-\`\`\`\`/ossssss+\`         
       -osssssso.      :ssssssso.        
      :osssssss/        osssso+++.       
     /ossssssss/        +ssssooo/-       
   \`/ossssso+/:-        -:/+osssso+-     
  \`+sso+:-\`                 \`.-/+oso:    
 \`++:.                           \`-/+/   
 .\`                                 \`/   
`;

export function Home({ onNavigateToArch, onTriggerAurUpgrade }: HomeProps) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Array<{ course: string; assignment: string; due: string }>>([]);

  const loadStats = async () => {
    setError(null);
    try {
      const data = await getSystemStats();
      setStats(data);
    } catch (err: any) {
      setError(err.message || "Failed to load system stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 1000); // Update every 1 second
    
    // Check deadlines
    const checkDeadlines = async () => {
        try {
            const settings = await getSettings();
            if (!settings?.courses) return;
            
            const alerts: Array<{ course: string; assignment: string; due: string }> = [];
            
            for (const course of settings.courses) {
                if (course.notify === false) continue;

                try {
                    const asses = await getAssignments(course.id);
                    const now = Date.now();
                    
                    asses.forEach(a => {
                        const status = a.submission?.workflow_state;
                        const isFinished = status === 'submitted' || status === 'graded' || status === 'pending_review';
                        
                        if (!isFinished && a.due_at) {
                            const due = new Date(a.due_at).getTime();
                            if (due < now || (due - now < 24 * 3600 * 1000)) {
                                alerts.push({
                                    course: course.name,
                                    assignment: a.name,
                                    due: a.due_at
                                });
                            }
                        }
                    });
                } catch (e) { console.error(e) } 
            }
            setNotifications(alerts.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime()));
        } catch (e) { console.error(e) }
    };
    
    checkDeadlines();
    
    return () => clearInterval(interval);
  }, []);

  const formatBatteryTime = (seconds: number | null): string => {
    if (!seconds) return "Calculating...";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const handleQuickAurUpgrade = () => {
    onTriggerAurUpgrade();
    onNavigateToArch();
  };

  return (
    <div className="home-container">
      <div className="home-content">
        <div className="logo-section">
          <pre className="arch-logo">{ARCH_LOGO}</pre>
          <h1>Little Tools</h1>
        </div>

        {error && <div className="error">{error}</div>}

        {!loading && stats && (
          <div className="stats-container">
            {notifications.length > 0 && (
                <div className="notifications-alert">
                    <div className="alert-header">🚨 Upcoming Deadlines</div>
                    <div className="alert-list">
                    {notifications.map((n, i) => (
                        <div key={i} className="alert-item">
                            <span className="course">{n.course}</span>
                            <span className="task">{n.assignment}</span>
                            <span className="due">
                                {new Date(n.due).getTime() < Date.now() ? "OVERDUE" : "due in " + Math.ceil((new Date(n.due).getTime() - Date.now()) / (3600*1000)) + "h"}
                            </span>
                        </div>
                    ))}
                    </div>
                </div>
            )}
            
            <div className="stats-grid">
            {/* System Info */}
            <div className="stat-card">
              <div className="stat-icon">💻</div>
              <div className="stat-content">
                <div className="stat-label">System</div>
                <div className="stat-value">{stats.hostname}</div>
                <div className="stat-detail">
                  {stats.cpu.count} cores @ {stats.cpu.freq_mhz} MHz
                </div>
              </div>
            </div>

            {/* CPU Usage */}
            <div className="stat-card">
              <div className="stat-icon">⚙️</div>
              <div className="stat-content">
                <div className="stat-label">CPU Usage</div>
                <div className="stat-value">{stats.cpu.percent}%</div>
                <div className="progress-bar-mini">
                  <div
                    className="progress-fill-mini"
                    style={{ width: `${stats.cpu.percent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Memory */}
            <div className="stat-card">
              <div className="stat-icon">🧠</div>
              <div className="stat-content">
                <div className="stat-label">Memory</div>
                <div className="stat-value">
                  {stats.memory.used_gb} / {stats.memory.total_gb} GB
                </div>
                <div className="progress-bar-mini">
                  <div
                    className="progress-fill-mini"
                    style={{ width: `${stats.memory.percent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Battery */}
            {stats.battery && Object.keys(stats.battery).length > 0 && (
              <div className="stat-card">
                <div className="stat-icon">
                  {stats.battery.plugged_in ? "🔌" : "🔋"}
                </div>
                <div className="stat-content">
                  <div className="stat-label">Battery</div>
                  <div className="stat-value">{stats.battery.percent}%</div>
                  <div className="stat-detail">
                    {stats.battery.plugged_in
                      ? "AC Connected"
                      : stats.battery.time_left
                      ? formatBatteryTime(stats.battery.time_left)
                      : "Discharging"}
                  </div>
                </div>
              </div>
            )}

            {/* WiFi */}
            <div className="stat-card">
              <div className="stat-icon">
                {stats.wifi.connected ? "📶" : "📡"}
              </div>
              <div className="stat-content">
                <div className="stat-label">Network</div>
                <div className="stat-value">
                  {stats.wifi.connected ? "Connected" : "Disconnected"}
                </div>
                <div className="stat-detail">
                  {stats.wifi.connected
                    ? `${stats.wifi.interface} • ${stats.wifi.ip}`
                    : "No WiFi"}
                </div>
              </div>
            </div>

            {/* Power */}
            {stats.wattage && (
              <div className="stat-card">
                <div className="stat-icon">⚡</div>
                <div className="stat-content">
                  <div className="stat-label">Power Draw</div>
                  <div className="stat-value">{stats.wattage} W</div>
                  <div className="stat-detail">Current consumption</div>
                </div>
              </div>
            )}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
