import { useState, useEffect } from "react";
import { getSettings, saveSettings, Settings as SettingsType } from "../lib/api";

type CanvasSettingsProps = {
  onSaved?: () => void;
};

export function CanvasSettings({ onSaved }: CanvasSettingsProps) {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [courseRows, setCourseRows] = useState<Array<{ name: string; id: string }>>([]);

  useEffect(() => {
    getSettings()
      .then((data) => {
        setSettings(data);
        const rows = (data.courses || []).map((course) => ({
          name: course.name,
          id: String(course.id),
        }));
        setCourseRows(rows.length > 0 ? rows : [{ name: "", id: "" }]);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setError(null);
    setSuccess(false);

    try {
      const normalizedCourses = courseRows
        .filter((row) => row.name.trim() && row.id.trim())
        .map((row) => ({
          name: row.name.trim(),
          id: Number(row.id),
        }));

      if (normalizedCourses.some((course) => Number.isNaN(course.id))) {
        throw new Error("Course ID must be a number");
      }

      await saveSettings({
        ...settings,
        courses: normalizedCourses,
      });
      onSaved?.();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  const updateCourseRow = (index: number, field: "name" | "id", value: string) => {
    setCourseRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const addCourseRow = () => {
    setCourseRows((prev) => [...prev, { name: "", id: "" }]);
  };

  const removeCourseRow = (index: number) => {
    setCourseRows((prev) => prev.filter((_, i) => i !== index));
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading settings...</div>;

  return (
    <div className="settings-container">
      <h2>Canvas Settings</h2>
      {error && <div className="error">{error}</div>}
      {success && <div className="success">Settings saved!</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Canvas Base URL</label>
          <input
            type="text"
            name="canvas_base_url"
            value={settings?.canvas_base_url || ""}
            onChange={handleChange}
            placeholder="https://canvas.instructure.com"
          />
        </div>
        <div className="form-group">
          <label>Canvas API Token</label>
          <input
            type="password"
            name="canvas_token"
            value={settings?.canvas_token || ""}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Download Directory</label>
          <input
            type="text"
            name="download_dir"
            value={settings?.download_dir || ""}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Temp Directory</label>
          <input
            type="text"
            name="temp_dir"
            value={settings?.temp_dir || ""}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Courses (Name + ID)</label>
          <div className="course-table">
            <div className="course-table-header">
              <span>Course Name</span>
              <span>Course ID</span>
              <span>Actions</span>
            </div>
            {courseRows.map((row, index) => (
              <div key={index} className="course-table-row">
                <input
                  type="text"
                  placeholder="e.g. ENGR496"
                  value={row.name}
                  onChange={(e) => updateCourseRow(index, "name", e.target.value)}
                />
                <input
                  type="text"
                  placeholder="e.g. 85928"
                  value={row.id}
                  onChange={(e) => updateCourseRow(index, "id", e.target.value)}
                />
                <div className="row-actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => removeCourseRow(index)}
                    disabled={courseRows.length === 1}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <div className="course-table-footer">
              <button type="button" onClick={addCourseRow}>+ Add Course</button>
            </div>
          </div>
        </div>
        <button type="submit">Save Settings</button>
      </form>
    </div>
  );
}
