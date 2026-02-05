import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getAssignments, Assignment, submitAssignment } from "../lib/api";

interface AssignmentSubmitterProps {
  courseId: number;
}

export function AssignmentSubmitter({ courseId }: AssignmentSubmitterProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<number | "">("");
  const [droppedFile, setDroppedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getAssignments(courseId)
      .then((data) => {
        setAssignments(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });

    // Listen for drag-drop events
    const unlisten = getCurrentWindow().listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
      if (event.payload.paths.length > 0) {
        setDroppedFile(event.payload.paths[0]);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [courseId]);

  const handleSubmit = async () => {
    if (!selectedAssignment || !droppedFile) return;

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      await submitAssignment(courseId, Number(selectedAssignment), droppedFile);
      setSuccess(true);
      setDroppedFile(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading assignments...</div>;

  return (
    <div className="assignment-submitter">
      <h3>Submit Assignment</h3>
      {error && <div className="error">{error}</div>}
      {success && <div className="success">Assignment submitted successfully!</div>}
      
      <div className="form-group">
        <label>Select Assignment</label>
        <select 
          value={selectedAssignment} 
          onChange={(e) => setSelectedAssignment(e.target.value === "" ? "" : Number(e.target.value))}
          disabled={submitting}
        >
          <option value="">-- Select an Assignment --</option>
          {assignments.map((asm) => (
            <option key={asm.id} value={asm.id}>
              {asm.name}
            </option>
          ))}
        </select>
      </div>

      <div 
        className={`drop-zone ${droppedFile ? "has-file" : ""}`}
        onDragOver={(e) => e.preventDefault()}
      >
        {droppedFile ? (
          <div className="file-info">
            <span className="file-icon">📄</span>
            <span className="file-name">{droppedFile.split("/").pop()}</span>
            <button className="clear-file" onClick={() => setDroppedFile(null)}>✕</button>
          </div>
        ) : (
          <p>Drag and drop your submission file here</p>
        )}
      </div>

      <button 
        onClick={handleSubmit} 
        disabled={!selectedAssignment || !droppedFile || submitting}
        className="submit-btn"
      >
        {submitting ? "Submitting..." : "Submit to Canvas"}
      </button>
    </div>
  );
}
