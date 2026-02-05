export const API_BASE_URL = "http://127.0.0.1:8756";

export interface Settings {
  canvas_token: string | null;
  canvas_base_url: string | null;
  notion_token: string | null;
  download_dir: string;
  temp_dir: string;
  courses: Array<{ name: string; id: number; notify?: boolean }>;
}

export interface Course {
  id: number;
  name: string;
  course_code: string;
}

export interface Assignment {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
  html_url: string;
  submission?: {
    workflow_state: string;
    submitted_at: string | null;
    grade: string | null;
    score: number | null;
  };
}

export interface DownloadTask {
  task_id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  current_file: string | null;
  total_files: number;
  downloaded_files: number;
  error: string | null;
}

export interface CourseFile {
  id: number | null;
  display_name: string | null;
  folder_name: string;
  url: string | null;
}

export interface SystemStats {
  battery: {
    percent: number;
    plugged_in: boolean;
    time_left: number | null;
  };
  wifi: {
    connected: boolean;
    interface: string | null;
    ip: string | null;
  };
  cpu: {
    percent: number;
    freq_mhz: number | null;
    count: number;
  };
  memory: {
    total_gb: number;
    used_gb: number;
    percent: number;
  };
  wattage: number | null;
  hostname: string;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      return false;
    }
    try {
      const data = await response.json();
      return data.status === "ok";
    } catch {
      return true;
    }
  } catch (error) {
    console.error("Health check failed:", error);
    return false;
  }
}

export interface ScheduleConfig {
  day: number;
  interval: number;
  end_mode: "count" | "date" | "weeks";
  count?: number;
  until_date?: string;
}

export interface ICSEvent {
  title: string;
  location?: string;
  description?: string;
  start_date: string;
  start_time: string;
  end_time: string;
  schedules: ScheduleConfig[];
}

export async function getSettings(): Promise<Settings> {
  const response = await fetch(`${API_BASE_URL}/api/settings`);
  if (!response.ok) {
    throw new Error("Failed to fetch settings");
  }
  return response.json();
}

export async function saveSettings(settings: Settings): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to save settings");
  }
}

export async function getCourses(): Promise<Course[]> {
  const response = await fetch(`${API_BASE_URL}/api/canvas/courses`);
  if (!response.ok) {
    throw new Error("Failed to fetch courses");
  }
  return response.json();
}

export async function startDownload(courseId: number, courseName?: string): Promise<{ task_id: string }> {
  const response = await fetch(`${API_BASE_URL}/api/downloader/download/${courseId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ course_name: courseName }),
  });
  if (!response.ok) {
    throw new Error("Failed to start download");
  }
  return response.json();
}

export async function startSelectedDownload(courseId: number, fileIds: number[], courseName?: string): Promise<{ task_id: string }> {
  const response = await fetch(`${API_BASE_URL}/api/downloader/download/${courseId}/selected`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file_ids: fileIds, course_name: courseName }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to start selected download");
  }
  return response.json();
}

export async function getAssignments(courseId: number): Promise<Assignment[]> {
  const response = await fetch(`${API_BASE_URL}/api/canvas/courses/${courseId}/assignments`);
  if (!response.ok) {
    throw new Error("Failed to fetch assignments");
  }
  return response.json();
}

export async function generateICS(events: ICSEvent[]): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/ics/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(events),
  });
  if (!response.ok) {
    throw new Error("Failed to generate ICS");
  }
  const data = await response.json();
  return data.content;
}

export async function getTaskStatus(taskId: string): Promise<DownloadTask> {
  const response = await fetch(`${API_BASE_URL}/api/downloader/tasks/${taskId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch task status");
  }
  return response.json();
}

export async function listAllTasks(): Promise<DownloadTask[]> {
  const response = await fetch(`${API_BASE_URL}/api/downloader/tasks`);
  if (!response.ok) {
    throw new Error("Failed to list all tasks");
  }
  return response.json();
}

export async function getCourseFiles(courseId: number): Promise<CourseFile[]> {
  const response = await fetch(`${API_BASE_URL}/api/canvas/courses/${courseId}/files`);
  if (!response.ok) {
    let detail = "Failed to fetch course files";
    try {
      const data = await response.json();
      if (data?.detail) {
        detail = data.detail;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }
  return response.json();
}

export async function submitAssignment(courseId: number, assignmentId: number, filePath: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/canvas/courses/${courseId}/assignments/${assignmentId}/submit?file_path=${encodeURIComponent(filePath)}`, {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to submit assignment");
  }
}

export async function startTerminalCommand(commandKey: string): Promise<{ session_id: string }> {
  const response = await fetch(`${API_BASE_URL}/api/modules/terminal/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command_key: commandKey }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to start terminal command");
  }
  return response.json();
}

export async function sendTerminalInput(sessionId: string, data: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/modules/terminal/input/${sessionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to send input");
  }
}

export async function pollTerminalOutput(sessionId: string, offset: number): Promise<{ output: string; next_offset: number; done: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/modules/terminal/output/${sessionId}?offset=${offset}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to read output");
  }
  return response.json();
}

export async function getSystemStats(): Promise<SystemStats> {
  const response = await fetch(`${API_BASE_URL}/api/system/stats`);
  if (!response.ok) {
    throw new Error("Failed to fetch system stats");
  }
  return response.json();
}
