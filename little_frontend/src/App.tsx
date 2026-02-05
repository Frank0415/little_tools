import { useState, useEffect } from "react";
import { useHealth } from "./hooks/useHealth";
import { useDownloadStore } from "./store/useDownloadStore";
import { CanvasSettings } from "./components/Settings";
import { NotionSettings } from "./components/NotionSettings";
import { CourseList } from "./components/CourseList";
import { Home } from "./components/Home";
import "./App.css";

function App() {
  const isOnline = useHealth();
  const updateTasks = useDownloadStore((s) => s.updateTasks);
  const startPollingTask = useDownloadStore((s) => s.startPollingTask);
  const [showSettings, setShowSettings] = useState(false);
  const [activeApp, setActiveApp] = useState<"home" | "canvas" | "notion">("home");
  const [settingsVersion, setSettingsVersion] = useState(0);

  useEffect(() => {
    const now = Date.now().toString();
    sessionStorage.setItem("assignments_refresh_token", now);
    sessionStorage.setItem("files_refresh_token", now);
  }, []);

  // Initial sync and auto-polling for active tasks
  useEffect(() => {
    if (isOnline) {
      updateTasks().then(() => {
        const tasks = useDownloadStore.getState().tasks;
        Object.values(tasks).forEach(task => {
          if (task.status === "running" || task.status === "pending") {
            startPollingTask(task.task_id);
          }
        });
      });
    }
  }, [isOnline, updateTasks, startPollingTask]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-title">Little Tools</div>
        <nav className="sidebar-nav">
          <button
            className={`sidebar-item ${activeApp === "home" ? "active" : ""}`}
            onClick={() => {
              setActiveApp("home");
              setShowSettings(false);
            }}
          >
            Home
          </button>
          <button
            className={`sidebar-item ${activeApp === "canvas" ? "active" : ""}`}
            onClick={() => {
              setActiveApp("canvas");
              setShowSettings(false);
            }}
          >
            Canvas Assistant
          </button>
          <button
            className={`sidebar-item ${activeApp === "notion" ? "active" : ""}`}
            onClick={() => {
              setActiveApp("notion");
              setShowSettings(false);
            }}
          >
            Notion Sync
          </button>
        </nav>
        <div className="sidebar-footer">v0.1.0</div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="status-bar">
            <span className={`status-indicator ${isOnline ? "online" : "offline"}`}>
              {isOnline ? "● Online" : "● Offline"}
            </span>
            <button onClick={() => setShowSettings(!showSettings)}>
              {showSettings ? "Back to Home" : "Settings"}
            </button>
          </div>
          <div className="page-title">
            <h1>
              {activeApp === "home"
                ? ""
                : activeApp === "canvas"
                ? "Canvas Assistant"
                : "Notion Sync"}
            </h1>
            <p>
              {activeApp === "home"
                ? ""
                : activeApp === "canvas"
                ? "Manage course file downloads and submissions."
                : "Configure Notion integration settings."}
            </p>
          </div>
        </header>

        {showSettings ? (
          activeApp === "canvas" ? (
            <CanvasSettings onSaved={() => setSettingsVersion((v) => v + 1)} />
          ) : activeApp === "notion" ? (
            <NotionSettings />
          ) : (
            <div className="empty-state">
              <h3>No settings for this app</h3>
              <p>This app does not require additional settings.</p>
            </div>
          )
        ) : (
          <div className="home-content">
            {!isOnline ? (
              <div className="warning">
                Backend is offline. Please ensure the Python sidecar is running.
              </div>
            ) : activeApp === "home" ? (
                <Home />
            ) : activeApp === "canvas" ? (
              <CourseList settingsVersion={settingsVersion} />
            ) : (
              <div className="empty-state">
                <h3>Notion Sync</h3>
                <p>Open Settings to configure Notion integration.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
