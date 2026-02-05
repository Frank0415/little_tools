import { useState, useEffect } from "react";
import { getSettings, saveSettings, Settings as SettingsType } from "../lib/api";

export function NotionSettings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getSettings()
      .then((data) => {
        setSettings(data);
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
      await saveSettings(settings);
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

  if (loading) return <div style={{ padding: "2rem" }}>Loading settings...</div>;

  return (
    <div className="settings-container">
      <h2>Notion Settings</h2>
      {error && <div className="error">{error}</div>}
      {success && <div className="success">Settings saved!</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Notion Integration Token</label>
          <input
            type="password"
            name="notion_token"
            value={settings?.notion_token || ""}
            onChange={handleChange}
          />
        </div>
        <button type="submit">Save Settings</button>
      </form>
    </div>
  );
}
