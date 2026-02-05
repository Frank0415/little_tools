import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ICSEvent, ScheduleConfig } from '../lib/api';

type CalendarPreviewProps = {
  events: ICSEvent[];
  selectedEventIndex?: number;
  highlightedEvent?: ICSEvent | null;
  onClose: () => void;
};

export function CalendarPreview({ events, selectedEventIndex, highlightedEvent, onClose }: CalendarPreviewProps) {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [width, setWidth] = useState(480);
  const isResizing = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 300 && newWidth < window.innerWidth * 0.9) {
        setWidth(newWidth);
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
  };

  // Generate calendar days for the visible year
  const yearData = useMemo(() => {
    const months = [];
    for (let m = 0; m < 12; m++) {
      const date = new Date(currentYear, m, 1);
      const days = [];
      
      // Pad beginning
      let startDay = date.getDay(); 
      // Adjust if week starts on Monday? Standard JS getDay() is 0=Sun. 
      // ICS Generator UI assumes ISO (1=Mon ... 7=Sun). 
      // Let's standardise display on Sun-Sat for simplicity or Mon-Sun depending on pref.
      // Let's stick to standard grid (Sun-Sat) for now.
      
      for (let i = 0; i < startDay; i++) {
        days.push(null);
      }
      
      while (date.getMonth() === m) {
        days.push(new Date(date));
        date.setDate(date.getDate() + 1);
      }
      months.push({ name: new Date(currentYear, m, 1).toLocaleString('default', { month: 'long' }), days });
    }
    return months;
  }, [currentYear]);

  // Calculate highlighted dates
  const eventDates = useMemo(() => {
    const dates = new Set<string>();
    const eventsToShow = highlightedEvent ? [highlightedEvent] : events;
    
    eventsToShow.forEach(ev => {
        ev.schedules.forEach(sched => {
            const startDate = new Date(ev.start_date);
            const targetDay = sched.day === 7 ? 0 : sched.day; // Convert ISO (1-7) to JS (1-6, 0)
            
            // Find first occurrence
            let current = new Date(startDate);
            // Adjust to first matching weekday on or after start date
            const currentDay = current.getDay();
            const dist = (targetDay + 7 - currentDay) % 7;
            current.setDate(current.getDate() + dist);

            let count = 0;
            const maxCount = sched.end_mode === 'count' ? (sched.count || 1) : 999;
            const untilDate = sched.end_mode === 'date' && sched.until_date ? new Date(sched.until_date) : null;
            if (untilDate) untilDate.setHours(23, 59, 59, 999); // End of day

            // Simple loop to generate dates
            // Limit to reasonable logic: avoid infinite loops if something is wrong
            while (count < maxCount) {
                if (untilDate && current > untilDate) break;
                
                // Add to set if within view range (optimization)
                // Actually user wants to see year before/after, so we shouldn't strictly filter if we want to scroll years
                // But mostly useful to see "this year"
                
                dates.add(current.toDateString());
                
                // Next occurrence
                current.setDate(current.getDate() + (7 * sched.interval));
                count++;
                
                if (count > 500) break; // Safety break
            }
        });
    });
    return dates;
  }, [events, highlightedEvent, currentYear]); // Recalc generally if events change

  return (
    <div className="calendar-preview-panel" style={{ width: width }}>
      <div 
        className="resize-handle"
        onMouseDown={startResizing}
        onDoubleClick={() => setWidth(400)}
        title="Double click to reset width"
      />
      <div className="panel-header">
        <div className="year-nav">
          <button onClick={() => setCurrentYear(y => y - 1)}>← {currentYear - 1}</button>
          <span className="current-year">{currentYear}</span>
          <button onClick={() => setCurrentYear(y => y + 1)}>{currentYear + 1} →</button>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      
      <div className="calendar-grid-year">
        {yearData.map((month, idx) => (
          <div key={idx} className="month-card">
            <h4>{month.name}</h4>
            <div className="days-grid">
              {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="day-header">{d}</div>)}
              {month.days.map((d, i) => (
                <div 
                    key={i} 
                    className={`day-cell ${d && eventDates.has(d.toDateString()) ? 'highlight' : ''}`}
                >
                  {d ? d.getDate() : ''}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
