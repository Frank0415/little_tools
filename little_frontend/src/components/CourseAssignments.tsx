import { useState, useEffect, useRef } from "react";
import { getAssignments, Assignment } from "../lib/api";

type CourseAssignmentsProps = {
  courseId: number;
  notify: boolean;
  refreshToken?: number;
};

type AssignmentGroup = {
  id: string;
  name: string;
  assignments: Assignment[];
  isDDL?: boolean;
};

const CACHE_TTL_MS = 30 * 60 * 1000;

const getAssignmentNotifications = (): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem('assignment_notifications');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const setAssignmentNotification = (assignmentId: number, enabled: boolean) => {
  const notifications = getAssignmentNotifications();
  notifications[assignmentId.toString()] = enabled;
  localStorage.setItem('assignment_notifications', JSON.stringify(notifications));
};

export function CourseAssignments({ courseId, notify, refreshToken }: CourseAssignmentsProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);
  const [assignmentNotifications, setAssignmentNotifications] = useState<Record<string, boolean>>({});
  const [panelWidth, setPanelWidth] = useState(420);
  const isResizing = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 300 && newWidth < window.innerWidth * 0.9) {
        setPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResizing = (e: React.MouseEvent) => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  };
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    unfinished: true,
    ddl: true,
  });

  useEffect(() => {
    loadAssignments();
    setAssignmentNotifications(getAssignmentNotifications());
  }, [courseId]);

  useEffect(() => {
    if (refreshToken !== undefined) {
      loadAssignments(true, true);
    }
  }, [refreshToken, courseId]);

  const loadAssignments = async (force = false, isManual = false) => {
    const cacheKey = `assignments_cache_${courseId}`;
    const sessionToken = Number(sessionStorage.getItem("assignments_refresh_token") || "0");
    let cached: { timestamp: number; data: Assignment[] } | null = null;

    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        cached = JSON.parse(raw);
      }
    } catch {
      cached = null;
    }

    const now = Date.now();
    const isStale = !cached || now - cached.timestamp > CACHE_TTL_MS || cached.timestamp < sessionToken;

    if (cached?.data) {
      setAssignments(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    if (!isStale && !force) return;

    if (isManual) {
      setRefreshStatus("Refreshing...");
    }

    try {
      const data = await getAssignments(courseId);
      setAssignments(data);
      localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, data }));
      if (isManual) {
        setRefreshStatus("Updated");
        setTimeout(() => setRefreshStatus(null), 1500);
      }
    } catch (err: any) {
      setError(err.message);
      if (isManual) {
        setRefreshStatus("Refresh failed");
        setTimeout(() => setRefreshStatus(null), 1500);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatYmd = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}/${m}/${day}`;
  };

  const isFinished = (a: Assignment) => {
    const status = a.submission?.workflow_state;
    return status === 'submitted' || status === 'graded' || status === 'pending_review';
  };

  const isDDL = (a: Assignment) => {
    if (!a.due_at) return false;
    const due = new Date(a.due_at).getTime();
    const now = Date.now();
    // Past deadline OR within 24 hours
    return due < now || (due - now < 24 * 60 * 60 * 1000);
  };

  const groups: AssignmentGroup[] = [];

  const finished = assignments.filter(isFinished);
  const unfinished = assignments.filter(a => !isFinished(a));
  
  // Splitting unfinished into DDL and Normal Unfinished if notify is true
  let ddlAssignments: Assignment[] = [];
  let normalUnfinished: Assignment[] = [];

  if (notify) {
    ddlAssignments = unfinished.filter(isDDL);
    normalUnfinished = unfinished.filter(a => !isDDL(a));
  } else {
    normalUnfinished = unfinished;
  }

  if (notify && ddlAssignments.length > 0) {
    groups.push({ id: 'ddl', name: 'Wait to Finish (DDL)', assignments: ddlAssignments, isDDL: true });
  }
  
  if (normalUnfinished.length > 0) {
    groups.push({ id: 'unfinished', name: 'Unfinished Assignments', assignments: normalUnfinished, isDDL:true });
  }
  
  if (finished.length > 0) {
    groups.push({ id: 'finished', name: 'Finished Assignments', assignments: finished });
  }

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) return <div className="loading">Loading assignments...</div>;
  if (error) return <div className="error">{error}</div>;

  const handleSelectAssignment = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setPanelCollapsed(false);
  };

  const handleNotificationToggle = (assignmentId: number) => {
    const current = assignmentNotifications[assignmentId.toString()] ?? true;
    const newValue = !current;
    setAssignmentNotification(assignmentId, newValue);
    setAssignmentNotifications(prev => ({
      ...prev,
      [assignmentId.toString()]: newValue
    }));
  };

  return (
    <>
      {selectedAssignment && !panelCollapsed && (
        <div className="assignment-detail-panel" style={{ width: panelWidth }}>
          <div 
            className="resize-handle"
            onMouseDown={startResizing}
            onDoubleClick={() => setPanelWidth(420)}
            title="Double click to reset width"
          />
          <button className="close-btn" onClick={() => setSelectedAssignment(null)}>×</button>
          <button className="panel-toggle" onClick={() => setPanelCollapsed(true)}>↘</button>
          <h3>{selectedAssignment.name}</h3>
          
          <div className="detail-row">
            <span className="label">Notify:</span>
            <label className="notify-checkbox">
              <input
                type="checkbox"
                checked={assignmentNotifications[selectedAssignment.id.toString()] ?? true}
                onChange={() => handleNotificationToggle(selectedAssignment.id)}
              />
              <span>Show in deadline alerts</span>
            </label>
          </div>
          
          <div className="detail-row">
            <span className="label">Due Date:</span>
            <span>{selectedAssignment.due_at ? new Date(selectedAssignment.due_at).toLocaleString() : 'No Due Date'}</span>
          </div>
          
          <div className="detail-row">
            <span className="label">Points:</span>
            <span>{selectedAssignment.points_possible !== null ? selectedAssignment.points_possible : '-'}</span>
          </div>
          
          <div className="detail-row">
            <span className="label">Status:</span>
            <span className={`status-badge status-${selectedAssignment.submission?.workflow_state || 'none'}`}>
              {selectedAssignment.submission?.workflow_state || 'Unsubmitted'}
            </span>
          </div>

          <div className="detail-description">
            <h4>Description</h4>
            <div dangerouslySetInnerHTML={{ __html: selectedAssignment.description || 'No description' }} />
          </div>
          
          {selectedAssignment.html_url && (
            <div className="detail-actions">
               <a href={selectedAssignment.html_url} target="_blank" rel="noreferrer" className="btn">
                 Open in Canvas
               </a>
            </div>
          )}
        </div>
      )}
      {selectedAssignment && panelCollapsed && (
        <button className="panel-expand" onClick={() => setPanelCollapsed(false)}>
          Show Details
        </button>
      )}
      
      <div className="assignments-container">
        <div className="assignments-list">
          {refreshStatus && (
            <div style={{ padding: "0.5rem 0.75rem", color: "var(--text-secondary)", fontSize: "12px" }}>
              {refreshStatus}
            </div>
          )}
          {groups.map(group => {
            const isUnfinishedGroup = group.id === 'unfinished';
            const isDDLGroup = group.id === 'ddl';
            
            return (
              <div key={group.id} className={`folder-node ${group.isDDL ? 'ddl-group' : ''}`}>
                <div 
                  className="folder-header" 
                  onClick={() => toggleGroup(group.id)}
                  style={group.isDDL ? { color: '#ff4d4d', borderLeft: '6px solid #ff4d4d' } : undefined}
                >
                  <span className={`expand-icon ${(isUnfinishedGroup || isDDLGroup) ? 'unfinished' : ''}`}>
                    {expandedGroups[group.id] ? "▾" : "▸"}
                  </span>
                  <span className="folder-name">{group.name} ({group.assignments.length})</span>
                </div>
                
                {expandedGroups[group.id] && (
                  <div className="folder-content">
                    <div className="file-list-container">
                      {group.assignments.map(a => {
                        const isUnfinished = group.id === 'unfinished';
                        const isDDL = group.id === 'ddl';
                        return (
                          <div 
                            key={a.id} 
                            className={`assignment-item ${selectedAssignment?.id === a.id ? 'selected' : ''} ${(isUnfinished || isDDL) ? 'unfinished' : ''}`}
                            onClick={() => handleSelectAssignment(a)}
                          >
                            <span className="assignment-name">{a.name}</span>
                            <span className="assignment-date">{formatYmd(a.due_at)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
