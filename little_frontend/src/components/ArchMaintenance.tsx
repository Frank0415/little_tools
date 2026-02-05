import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { startTerminalCommand, sendTerminalInput, pollTerminalOutput } from "../lib/api";

const COMMANDS = [
  { key: "upgrade_aur", label: "Upgrade ALL using AUR", primary: true },
  { key: "upgrade_official", label: "Upgrade official packages" },
  { key: "check_failed_services", label: "Check failed systemd services" },
  { key: "check_logs", label: "Check error logs" },
  { key: "orphaned_packages", label: "Check orphaned packages" },
  { key: "clean_cache", label: "Clean package cache" },
  { key: "disks_health", label: "Check disks health" },
  { key: "toggle_monitor", label: "Toggle monitor scaling" },
  { key: "reboot_polybar", label: "Reboot Polybar" },
  { key: "toggle_wacom", label: "Toggle Wacom tablet" },
];

export function ArchMaintenance() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [terminalDone, setTerminalDone] = useState(false);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const inputBufferRef = useRef<string>("");
  const sessionIdRef = useRef<string | null>(null);

  // Sync sessionId to ref
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Initialize xterm.js terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#0b1020",
        foreground: "#e0e0e0",
        cursor: "#00ff00",
      },
      rows: 30,
      cols: 100,
    });

    term.open(terminalRef.current);
    xtermRef.current = term;

    // Handle user input
    term.onData((data) => {
      // Handle special keys
      if (data === "\r") {
        // Enter key - send buffered input
        const currentSessionId = sessionIdRef.current;
        if (currentSessionId && inputBufferRef.current) {
          sendTerminalInput(currentSessionId, inputBufferRef.current + "\n").catch((err) => {
            term.writeln(`\r\nError: ${err.message}`);
          });
          inputBufferRef.current = "";
        }
        term.write("\r\n");
      } else if (data === "\u007F") {
        // Backspace
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          term.write("\b \b");
        }
      } else if (data === "\u0003") {
        // Ctrl+C
        const currentSessionId = sessionIdRef.current;
        if (currentSessionId) {
          sendTerminalInput(currentSessionId, "\x03").catch(console.error);
        }
        inputBufferRef.current = "";
        term.write("^C\r\n");
      } else {
        // Regular character
        inputBufferRef.current += data;
        term.write(data);
      }
    });

    term.writeln("Welcome to Little Tools Terminal");
    term.writeln("Select a maintenance task above to begin.\r\n");

    return () => {
      term.dispose();
    };
  }, []);

  // Poll for terminal output
  useEffect(() => {
    if (!sessionId || !xtermRef.current) return;

    const interval = setInterval(async () => {
      try {
        const result = await pollTerminalOutput(sessionId, offset);
        if (result.output && xtermRef.current) {
          // Write output to xterm
          xtermRef.current.write(result.output.replace(/\n/g, "\r\n"));
          setOffset(result.next_offset);
        }
        if (result.done) {
          setTerminalDone(true);
          setRunningKey(null);
        }
      } catch {
        // ignore polling errors
      }
    }, 500);

    return () => clearInterval(interval);
  }, [sessionId, offset]);

  const startCommand = async (key: string) => {
    if (!xtermRef.current) return;

    try {
      setRunningKey(key);
      setTerminalDone(false);
      setOffset(0);
      inputBufferRef.current = "";

      xtermRef.current.clear();
      xtermRef.current.writeln(`\x1b[1;32m▶ Starting: ${COMMANDS.find((c) => c.key === key)?.label}\x1b[0m\r\n`);

      const { session_id } = await startTerminalCommand(key);
      setSessionId(session_id);
    } catch (err: any) {
      xtermRef.current.writeln(`\x1b[1;31mError: ${err.message}\x1b[0m\r\n`);
    }
  };

  return (
    <div className="arch-maintenance">
      <div className="arch-actions">
        {COMMANDS.map((cmd) => (
          <button
            key={cmd.key}
            className={cmd.primary ? "primary-btn" : "secondary-btn"}
            onClick={() => startCommand(cmd.key)}
            disabled={!!runningKey && runningKey !== cmd.key}
          >
            {cmd.label}
          </button>
        ))}
      </div>

      <div className="terminal-panel">
        <div className="terminal-header">
          <span>Terminal</span>
          <span className="terminal-status">
            {runningKey ? "Running" : terminalDone ? "Completed" : "Idle"}
          </span>
        </div>
        <div ref={terminalRef} className="xterm-container" />
      </div>
    </div>
  );
}
