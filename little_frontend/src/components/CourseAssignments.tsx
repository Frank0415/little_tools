import { useState, useEffect } from "react";
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

export function CourseAssignments({ courseId, notify, refreshToken }: CourseAssignmentsProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    unfinished: true,
    ddl: true,
  });

  useEffect(() => {
    loadAssignments();
  }, [courseId]);

  useEffect(() => {
    if (refreshToken !== undefined) {
      loadAssignments(true);
    }
  }, [refreshToken, courseId]);

  const loadAssignments = async (force = false) => {
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

    try {
      const data = await getAssignments(courseId);
      setAssignments(data);
      localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, data }));
    } catch (err: any) {
      setError(err.message);
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
    groups.push({ id: 'unfinished', name: 'Unfinished Assignments', assignments: normalUnfinished });
  }
  
  if (finished.length > 0) {
    groups.push({ id: 'finished', name: 'Finished Assignments', assignments: finished });
  }

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) return <div className="loading">Loading assignments...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="assignments-container" style={{ display: 'flex', height: '100%' }}>
      <div className="assignments-list" style={{ flex: 1, overflowY: 'auto' }}>
        {groups.map(group => (
          <div key={group.id} className={`folder-node ${group.isDDL ? 'ddl-group' : ''}`}>
             <div 
               className="folder-header" 
               onClick={() => toggleGroup(group.id)}
               style={group.isDDL ? { color: '#ff4d4d' } : undefined}
             >
               <span className="expand-icon">{expandedGroups[group.id] ? "▾" : "▸"}</span>
               <span className="folder-name">{group.name} ({group.assignments.length})</span>
             </div>
             
             {expandedGroups[group.id] && (
               <div className="folder-content">
                 <div className="file-list-container">
                    {group.assignments.map(a => (
                      <div 
                        key={a.id} 
                        className={`assignment-item ${selectedAssignment?.id === a.id ? 'selected' : ''}`}
                        onClick={() => setSelectedAssignment(a)}
                      >
                        <span className="assignment-name">{a.name}</span>
                        <span className="assignment-date">{formatYmd(a.due_at)}</span>
                      </div>
                    ))}
                 </div>
               </div>
             )}
          </div>
        ))}
      </div>

      {selectedAssignment && (
        <div className="assignment-detail-panel">
          <button className="close-btn" onClick={() => setSelectedAssignment(null)}>×</button>
          <h3>{selectedAssignment.name}</h3>
          
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
    </div>
  );
}
