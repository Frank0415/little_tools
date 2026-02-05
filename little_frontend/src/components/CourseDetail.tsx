import { useState, useEffect, ReactElement } from "react";
import { getCourseFiles, CourseFile, startDownload, startSelectedDownload } from "../lib/api";
import { useDownloadStore } from "../store/useDownloadStore";

type CourseDetailProps = {
  courseId: number;
  courseName: string;
  onBack: () => void;
};

type FolderNode = {
  name: string;
  path: string;
  depth: number;
  files: CourseFile[];
  subfolders: Record<string, FolderNode>;
};

export function CourseDetail({ courseId, courseName, onBack }: CourseDetailProps) {
  const [files, setFiles] = useState<CourseFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  
  const tasks = useDownloadStore((s) => s.tasks);
  const startPollingTask = useDownloadStore((s) => s.startPollingTask);

  useEffect(() => {
    loadFiles();
  }, [courseId]);

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCourseFiles(courseId);
      setFiles(data);
      // Auto-expand root level
      const rootFolders = new Set(data.map((f) => (f.folder_name || "").split("/")[0]).filter(Boolean));
      setExpandedFolders(Object.fromEntries([...rootFolders].map((f) => [f, true])));
    } catch (err: any) {
      setError(err.message || "Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  const buildFileTree = (): FolderNode => {
    const root: FolderNode = {
      name: "root",
      path: "",
      depth: 0,
      files: [],
      subfolders: {},
    };

    files.forEach((file) => {
      const folderPath = file.folder_name || "";
      const parts = folderPath.split("/").filter(Boolean);

      let current = root;
      let currentPath = "";

      parts.forEach((part, idx) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!current.subfolders[part]) {
          current.subfolders[part] = {
            name: part,
            path: currentPath,
            depth: idx + 1,
            files: [],
            subfolders: {},
          };
        }
        current = current.subfolders[part];
      });

      current.files.push(file);
    });

    return root;
  };

  const toggleFile = (fileId: number, checked: boolean) => {
    setSelectedFiles((prev) => ({ ...prev, [String(fileId)]: checked }));
  };

  const toggleFolder = (folderNode: FolderNode, checked: boolean) => {
    const collectFileIds = (node: FolderNode): number[] => {
      const ids = node.files.map((f) => f.id).filter((id): id is number => id !== null);
      Object.values(node.subfolders).forEach((sub) => {
        ids.push(...collectFileIds(sub));
      });
      return ids;
    };

    const fileIds = collectFileIds(folderNode);
    setSelectedFiles((prev) => {
      const next = { ...prev };
      fileIds.forEach((id) => {
        next[String(id)] = checked;
      });
      return next;
    });
  };

  const handleDownloadAll = async () => {
    try {
      const { task_id } = await startDownload(courseId, courseName);
      startPollingTask(task_id);
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    }
  };

  const handleDownloadSelected = async () => {
    const fileIds = Object.entries(selectedFiles)
      .filter(([, selected]) => selected)
      .map(([id]) => Number(id))
      .filter((id) => !Number.isNaN(id));

    if (fileIds.length === 0) {
      alert("Select at least one file to download.");
      return;
    }

    try {
      const { task_id } = await startSelectedDownload(courseId, fileIds, courseName);
      startPollingTask(task_id);
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    }
  };

// Removed local pollTask function

  const renderFolder = (node: FolderNode, isRoot = false): ReactElement => {
    const isExpanded = expandedFolders[node.path] ?? false;
    const allFileIds = (() => {
      const collectIds = (n: FolderNode): number[] => {
        const ids = n.files.map((f) => f.id).filter((id): id is number => id !== null);
        Object.values(n.subfolders).forEach((sub) => ids.push(...collectIds(sub)));
        return ids;
      };
      return collectIds(node);
    })();
    const allSelected = allFileIds.length > 0 && allFileIds.every((id) => selectedFiles[String(id)]);

    if (isRoot) {
      return (
        <>
          {Object.values(node.subfolders).map((subfolder) => renderFolder(subfolder))}
          {node.files.length > 0 && (
            <div className="folder-node root-folder">
              <div className="folder-header">
                <span className="folder-name">(Root Files)</span>
              </div>
              <div className="file-list-container">
                {node.files.map((file) => (
                  <div
                    key={file.id}
                    className="file-item"
                  >
                    {file.id !== null && (
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={!!selectedFiles[String(file.id)]}
                        onChange={(e) => toggleFile(file.id as number, e.target.checked)}
                      />
                    )}
                    <span className="file-name" title={file.display_name || undefined}>
                      {file.display_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      );
    }

    return (
      <div className="folder-node">
        <div className="folder-header">
          <button
            className="expand-btn"
            onClick={() =>
              setExpandedFolders((prev) => ({ ...prev, [node.path]: !isExpanded }))
            }
          >
            {isExpanded ? "▾" : "▸"}
          </button>
          <input
            type="checkbox"
            className="checkbox"
            checked={allFileIds.length > 0 && allSelected}
            onChange={(e) => toggleFolder(node, e.target.checked)}
          />
          <span className="folder-name">{node.name}/</span>
        </div>
        {isExpanded && (
          <div className="folder-content">
            {Object.values(node.subfolders).map((subfolder) => renderFolder(subfolder))}
            {node.files.length > 0 && (
              <div className="file-list-container">
                {node.files.map((file) => (
                  <div
                    key={file.id}
                    className="file-item"
                  >
                    {file.id !== null && (
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={!!selectedFiles[String(file.id)]}
                        onChange={(e) => toggleFile(file.id as number, e.target.checked)}
                      />
                    )}
                    <span className="file-name" title={file.display_name || undefined}>
                      {file.display_name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className="loading">Loading files...</div>;

  const tree = buildFileTree();

  return (
    <div className="course-detail">
      <div className="course-detail-header">
        <button onClick={onBack} className="back-btn">
          ← Back to Courses
        </button>
        <h2>{courseName}</h2>
        <div className="course-detail-actions">
          <button onClick={handleDownloadAll}>Download All</button>
          <button className="secondary-btn" onClick={handleDownloadSelected}>
            Download Selected
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="file-tree-container">
        {files.length === 0 ? (
          <div className="empty-state">No files found in this course.</div>
        ) : (
          renderFolder(tree, true)
        )}
      </div>

      {Object.values(tasks).length > 0 && (
        <div className="active-downloads">
          <h3>Active Downloads</h3>
          {Object.values(tasks).map((task) => (
            <div key={task.task_id} className="download-task">
              <div className="task-header">
                <span>Task {task.task_id}</span>
                <span className={`status-badge status-${task.status}`}>
                  {task.status}
                </span>
              </div>
              {task.progress !== undefined && (
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${task.progress}%`,
                    }}
                  />
                  <span className="progress-text">
                    {Math.round(task.progress)}%
                  </span>
                </div>
              )}
              {task.error && <div className="error">{task.error}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
