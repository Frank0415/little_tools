import { useState, useEffect } from "react";
import { startDownload, getSettings } from "../lib/api";
import { useDownloadStore } from "../store/useDownloadStore";
import { CourseDetail } from "./CourseDetail";

type CourseListProps = {
  settingsVersion?: number;
};

export function CourseList({ settingsVersion = 0 }: CourseListProps) {
  const [courses, setCourses] = useState<Array<{ name: string; id: number; notify?: boolean }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<{ id: number; name: string; notify?: boolean; initialView?: "files" | "assignments" } | null>(null);
  const [assignmentsRefreshToken, setAssignmentsRefreshToken] = useState(0);

  const startPollingTask = useDownloadStore((s) => s.startPollingTask);
  const tasks = useDownloadStore((s) => s.tasks);

  useEffect(() => {
    getSettings()
      .then((data) => {
        setCourses(data.courses || []);
      })
      .catch((err) => setError(err.message));
  }, [settingsVersion]);

  const handleDownload = async (courseId: number) => {
    try {
      const course = courses.find((c) => c.id === courseId);
      const { task_id } = await startDownload(courseId, course?.name);
      startPollingTask(task_id);
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    }
  };

  const handleRefreshAssignments = () => {
    const token = Date.now();
    sessionStorage.setItem("assignments_refresh_token", token.toString());
    setAssignmentsRefreshToken(token);
  };


  if (selectedCourse) {
    return (
      <CourseDetail
        courseId={selectedCourse.id}
        courseName={selectedCourse.name}
        notify={selectedCourse.notify !== false}
        initialView={selectedCourse.initialView}
        assignmentsRefreshToken={assignmentsRefreshToken}
        onBack={() => setSelectedCourse(null)}
      />
    );
  }

  return (
    <div className="course-list">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Courses</h2>
        <button className="secondary-btn" onClick={handleRefreshAssignments}>
          Refresh Homework
        </button>
      </div>
      {courses.length === 0 ? (
        <div className="empty-state">
          <p>No courses saved. Add them in Settings.</p>
        </div>
      ) : (
        <div className="course-table">
          <div className="course-table-header">
            <span>Course Name</span>
            <span>Course ID</span>
            <span>Homework</span>
            <span>Actions</span>
          </div>
          {courses.map((course) => (
            <div key={course.id} className="course-table-row">
              <div>{course.name}</div>
              <div>{course.id}</div>
              <div className="row-actions">
                <button
                  className="secondary-btn"
                  onClick={() => setSelectedCourse({ ...course, initialView: "assignments" })}
                >
                  View Homework
                </button>
              </div>
              <div className="row-actions">
                <button onClick={() => handleDownload(course.id)}>Download All</button>
                <button
                  className="secondary-btn"
                  onClick={() => setSelectedCourse({ ...course, initialView: "files" })}
                >
                  Download Details
                </button>
              </div>
            </div>
          ))}
          {error && <div className="error" style={{ paddingTop: "0.5rem" }}>{error}</div>}
        </div>
      )}

      {Object.values(tasks).length > 0 && (
        <div className="active-downloads">
          <h3>Active Downloads</h3>
          {Object.values(tasks).map((task) => (
            <div key={task.task_id} className="download-progress">
              <div className="progress-info">
                <span>{task.status === "completed" ? "Completed" : task.current_file || "Starting..."}</span>
                <span>{Math.round(task.progress)}%</span>
              </div>
              <div className="progress-bar-bg">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${task.progress}%` }}
                ></div>
              </div>
              {task.error && <div className="error">{task.error}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
