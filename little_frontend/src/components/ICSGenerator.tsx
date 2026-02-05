import React, { useState } from 'react';
import { ICSEvent, ScheduleConfig, generateICS } from '../lib/api';
import { CalendarPreview } from './CalendarPreview';

export function ICSGenerator() {
  const [events, setEvents] = useState<ICSEvent[]>([]);
  const [currentEvent, setCurrentEvent] = useState<ICSEvent>({
    title: "",
    location: "",
    description: "",
    start_date: new Date().toISOString().split('T')[0],
    start_time: "08:00",
    end_time: "09:00",
    schedules: [],
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [highlightedEvent, setHighlightedEvent] = useState<ICSEvent | null>(null);

const [globalEndMode, setGlobalEndMode] = useState<"count" | "date" | "weeks">("weeks");
const [globalCount, setGlobalCount] = useState(1);
const [globalUntilDate, setGlobalUntilDate] = useState("");
const [globalInterval, setGlobalInterval] = useState(1);
const [customIntervalDays, setCustomIntervalDays] = useState<number[]>([]);

const toggleWeekday = (wd: number) => {
    const existingIndex = currentEvent.schedules.findIndex(s => s.day === wd);
    
    if (existingIndex >= 0) {
        // Remove it
        const newSchedules = [...currentEvent.schedules];
        newSchedules.splice(existingIndex, 1);
        setCurrentEvent({...currentEvent, schedules: newSchedules});
        // Also remove from custom list if present
        setCustomIntervalDays(prev => prev.filter(d => d !== wd));
    } else {
        // Add default config for this day sync with global settings
        const defaultSched: ScheduleConfig = {
            day: wd,
            interval: globalInterval,
            end_mode: globalEndMode,
            count: globalCount,
            until_date: globalUntilDate
        };
        
        setCurrentEvent({
            ...currentEvent, 
            schedules: [...currentEvent.schedules, defaultSched].sort((a,b) => a.day - b.day)
        });
    }
  };

  const handleGlobalChange = (updates: { 
    mode?: "count" | "date" | "weeks", 
    count?: number, 
    date?: string,
    interval?: number
  }) => {
    if (updates.mode !== undefined) setGlobalEndMode(updates.mode);
    if (updates.count !== undefined) setGlobalCount(updates.count);
    if (updates.date !== undefined) setGlobalUntilDate(updates.date);
    if (updates.interval !== undefined) setGlobalInterval(updates.interval);

    // Calculate new values to apply
    const mode = updates.mode !== undefined ? updates.mode : globalEndMode;
    const cnt = updates.count !== undefined ? updates.count : globalCount;
    const dt = updates.date !== undefined ? updates.date : globalUntilDate;
    const intv = updates.interval !== undefined ? updates.interval : globalInterval;

    const newSchedules = currentEvent.schedules.map(s => {
        const isCustomInterval = customIntervalDays.includes(s.day);
        return {
            ...s,
            end_mode: mode,
            count: cnt,
            until_date: dt,
            // If interval changed and this day is NOT custom, update it
            interval: (updates.interval !== undefined && !isCustomInterval) ? intv : s.interval
        };
    });
    setCurrentEvent(prev => ({ ...prev, schedules: newSchedules }));
  };
  
  const toggleCustomInterval = (day: number, isCustom: boolean) => {
      if (isCustom) {
          setCustomIntervalDays(prev => [...prev, day]);
      } else {
          setCustomIntervalDays(prev => prev.filter(d => d !== day));
          // Reset to global interval
          const newSchedules = currentEvent.schedules.map(s => 
              s.day === day ? { ...s, interval: globalInterval } : s
          );
          setCurrentEvent(prev => ({ ...prev, schedules: newSchedules }));
      }
  };

  const updateSchedule = (day: number, updates: Partial<ScheduleConfig>) => {
    // Only allow updating if it's a custom day or we are forcing it?
    // Actually just update it. If user types in box, they mean it.
    const newSchedules = currentEvent.schedules.map(s => 
        s.day === day ? { ...s, ...updates } : s
    );
    setCurrentEvent({...currentEvent, schedules: newSchedules});
  };

  const selectWorkdays = () => {
    const workdays = [1,2,3,4,5];
    const allSelected = workdays.every(wd => currentEvent.schedules.find(s => s.day === wd));
    
    let newSchedules = [...currentEvent.schedules];

    if (allSelected) {
        // Deselect all workdays
        newSchedules = newSchedules.filter(s => !workdays.includes(s.day));
        setCustomIntervalDays(prev => prev.filter(d => !workdays.includes(d)));
    } else {
        // Select missing
        workdays.forEach(wd => {
            if (!newSchedules.find(s => s.day === wd)) {
                 newSchedules.push({ 
                     day: wd, 
                     interval: globalInterval, 
                     end_mode: globalEndMode,
                     count: globalCount,
                     until_date: globalUntilDate
                });
            }
        });
    }
    setCurrentEvent({...currentEvent, schedules: newSchedules.sort((a,b) => a.day - b.day)});
  };


  const selectWeekends = () => {
    const weekends = [6,7];
    const allSelected = weekends.every(wd => currentEvent.schedules.find(s => s.day === wd));
    
    let newSchedules = [...currentEvent.schedules];

    if (allSelected) {
        newSchedules = newSchedules.filter(s => !weekends.includes(s.day));
        // Cleanup custom days
        setCustomIntervalDays(prev => prev.filter(d => !weekends.includes(d)));
    } else {
        weekends.forEach(wd => {
             if (!newSchedules.find(s => s.day === wd)) {
                 newSchedules.push({ 
                     day: wd, 
                     interval: globalInterval, 
                     end_mode: globalEndMode,
                     count: globalCount,
                     until_date: globalUntilDate
                });
            }
        });
    }
    setCurrentEvent({...currentEvent, schedules: newSchedules.sort((a,b) => a.day - b.day)});
  };

  const addEvent = () => {
    if (!currentEvent.title || currentEvent.schedules.length === 0) {
      alert("Please provide a title and at least one weekday.");
      return;
    }
    setEvents([...events, currentEvent]);
    // Reset but keep some common values
    setCurrentEvent({
      ...currentEvent,
      title: "",
      location: "",
      description: "",
      schedules: []
    });
  };

  const removeEvent = (index: number) => {
    setEvents(events.filter((_, i) => i !== index));
  };
  
  const handleEventClick = (ev: ICSEvent) => {
      setHighlightedEvent(ev);
      setShowPreview(true);
  };

  const handleDownload = async () => {
    if (events.length === 0) return;
    setIsGenerating(true);
    try {
      const content = await generateICS(events);
      const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'events.ics');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      alert("Failed to generate ICS: " + error);
    } finally {
      setIsGenerating(false);
    }
  };

  const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="ics-generator">
      <div className="ics-form card">
        <div style={{display: 'flex', justifyContent: 'space-between'}}>
            <h3>Add New Event</h3>
            <button className="secondary-btn" onClick={() => { setHighlightedEvent(currentEvent); setShowPreview(!showPreview); }}>
                {showPreview ? "Hide Preview" : "Show Calendar Preview"}
            </button>
        </div>
        
        {showPreview && (
            <CalendarPreview 
                events={[currentEvent, ...events]} 
                highlightedEvent={highlightedEvent}
                onClose={() => setShowPreview(false)} 
            />
        )}

        <div className="form-group">
          <label>Title</label>
          <input 
            type="text" 
            value={currentEvent.title} 
            onChange={e => setCurrentEvent({...currentEvent, title: e.target.value})}
            placeholder="e.g. Mathematics"
          />
        </div>
        <div className="form-row">
            <div className="form-group flex-1">
                <label>Location</label>
                <input 
                    type="text" 
                    value={currentEvent.location} 
                    onChange={e => setCurrentEvent({...currentEvent, location: e.target.value})}
                    placeholder="e.g. Room 101"
                />
            </div>
            <div className="form-group flex-1">
                <label>Start Date (First week)</label>
                <input 
                    type="date" 
                    value={currentEvent.start_date} 
                    onChange={e => setCurrentEvent({...currentEvent, start_date: e.target.value})}
                />
            </div>
        </div>
        <div className="form-row">
            <div className="form-group flex-1">
                <label>Start Time</label>
                <input 
                    type="time" 
                    value={currentEvent.start_time} 
                    onChange={e => setCurrentEvent({...currentEvent, start_time: e.target.value})}
                />
            </div>
            <div className="form-group flex-1">
                <label>End Time</label>
                <input 
                    type="time" 
                    value={currentEvent.end_time} 
                    onChange={e => setCurrentEvent({...currentEvent, end_time: e.target.value})}
                />
            </div>
        </div>

        <div className="form-group">
            <label>Weekdays & Recurrence</label>
            <div className="weekday-selector">
                {weekdayNames.map((name, i) => {
                    const wd = i + 1;
                    const isSelected = !!currentEvent.schedules.find(s => s.day === wd);
                    return (
                        <button 
                            key={i}
                            className={`weekday-btn ${isSelected ? 'active' : ''}`}
                            onClick={() => toggleWeekday(wd)}
                        >
                            {name}
                        </button>
                    );
                })}
            </div>
            <div className="quick-select">
                <button className="secondary-btn" onClick={selectWorkdays}>Workdays</button>
                <button className="secondary-btn" onClick={selectWeekends}>Weekends</button>
            </div>
        </div>

        {/* Recurrence & End Settings */}
        <div className="schedules-config" style={{ marginBottom: '1.5rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '6px' }}>
            <h4 style={{marginTop: 0, marginBottom: '1rem', fontSize: '13px', color: 'var(--text-secondary)'}}>Recurrence & Duration</h4>
            
            {/* Common Settings */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                    <label style={{fontSize: '11px', display: 'block', marginBottom: '4px'}}>Common Interval (Weeks)</label>
                    <input 
                        type="number" 
                        min="1" 
                        value={globalInterval}
                        onChange={(e) => handleGlobalChange({ interval: parseInt(e.target.value) || 1 })}
                        style={{ width: '100%', padding: '6px' }}
                    />
                </div>
                <div>
                    <label style={{fontSize: '11px', display: 'block', marginBottom: '4px'}}>End By</label>
                    <select 
                        value={globalEndMode}
                        onChange={(e) => handleGlobalChange({ mode: e.target.value as any })}
                        style={{ width: '100%', padding: '6px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    >
                        <option value="weeks">Duration (Weeks)</option>
                        <option value="date">On Date</option>
                    </select>
                </div>
                
                {(globalEndMode === 'weeks' || globalEndMode === 'count') ? (
                    <div style={{ gridColumn: '2' }}>
                        <label style={{fontSize: '11px', display: 'block', marginBottom: '4px'}}>Number of Weeks</label>
                        <input 
                            type="number" 
                            min="1" 
                            value={globalCount}
                            onChange={(e) => handleGlobalChange({ count: parseInt(e.target.value) || 1 })}
                            style={{ width: '100%', padding: '6px' }}
                        />
                    </div>
                ) : (
                    <div style={{ gridColumn: '2' }}>
                        <label style={{fontSize: '11px', display: 'block', marginBottom: '4px'}}>Until Date</label>
                        <input 
                            type="date" 
                            value={globalUntilDate}
                            onChange={(e) => handleGlobalChange({ date: e.target.value })}
                            style={{ width: '100%', padding: '6px' }}
                        />
                    </div>
                )}
            </div>

            {/* Individual Overrides List */}
            {currentEvent.schedules.length > 0 && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                    <label style={{display: 'block', marginBottom: '0.5rem', fontSize: '12px', fontWeight: 600}}>Selected Days Interval Config</label>
                    
                    {currentEvent.schedules.map((sched) => {
                        const isCustom = customIntervalDays.includes(sched.day);
                        return (
                            <div key={sched.day} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem', fontSize: '13px' }}>
                                <div style={{ width: '100px', fontWeight: 'bold' }}>{weekdayNames[sched.day-1]}</div>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={isCustom}
                                            onChange={(e) => toggleCustomInterval(sched.day, e.target.checked)}
                                        />
                                        <span>Customize Interval</span>
                                    </label>
                                    
                                    {isCustom && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input 
                                                type="number" 
                                                min="1" 
                                                value={sched.interval}
                                                onChange={(e) => updateSchedule(sched.day, { interval: parseInt(e.target.value) || 1 })}
                                                style={{ width: '60px', padding: '4px' }}
                                            />
                                            <span style={{ fontSize: '11px', opacity: 0.8 }}>weeks</span>
                                        </div>
                                    )}
                                    {!isCustom && (
                                        <span style={{ fontSize: '11px', opacity: 0.6, fontStyle: 'italic' }}>
                                            (Global: Every {globalInterval} weeks)
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>

        <div className="form-group">
            <label>Details / Description</label>
            <textarea 
                value={currentEvent.description} 
                onChange={e => setCurrentEvent({...currentEvent, description: e.target.value})}
                placeholder="Add more details here..."
                rows={3}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', fontFamily: 'inherit' }}
            />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="primary-btn" onClick={addEvent}>Add Event to List</button>
        </div>
      </div>

      {events.length > 0 && (
        <div className="events-list-section card">
          <div className="section-header">
            <h3>Current Events ({events.length})</h3>
            <button 
                className="primary-btn" 
                onClick={handleDownload}
                disabled={isGenerating}
            >
                {isGenerating ? "Generating..." : "Download ICS"}
            </button>
          </div>
          <div className="events-scroll">
            {events.map((ev, i) => (
                <div 
                    key={i} 
                    className="event-item-row" 
                    onClick={() => handleEventClick(ev)}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="event-info">
                        <strong>{ev.title}</strong>
                        <div className="event-sub">
                            {ev.schedules.map(s => weekdayNames[s.day-1]).join(', ')} | {ev.start_time}-{ev.end_time}
                        </div>
                    </div>
                    <button className="close-btn" onClick={(e) => { e.stopPropagation(); removeEvent(i); }} style={{ position: 'relative', top: 0, right: 0 }}>×</button>
                </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
