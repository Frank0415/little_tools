from datetime import datetime, timedelta
from typing import List, Optional, Literal
from pydantic import BaseModel
from icalendar import Calendar, Event, vRecur

class ScheduleConfig(BaseModel):
    day: int  # 1 (Mon) to 7 (Sun)
    interval: int = 1
    end_mode: Literal["count", "date", "weeks"] = "weeks"
    count: Optional[int] = 1 # Used for both 'count' (occurrences) and 'weeks' (duration)
    until_date: Optional[str] = None  # YYYY-MM-DD

class ICSEventRequest(BaseModel):
    title: str
    location: Optional[str] = ""
    description: Optional[str] = ""
    start_date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: str    # HH:MM
    schedules: List[ScheduleConfig]

def generate_ics_content(events_data: List[ICSEventRequest]) -> str:
    cal = Calendar()
    cal.add('prodid', '-//Little Tools ICS Generator//')
    cal.add('version', '2.0')

    weekday_map = {1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR", 6: "SA", 7: "SU"}

    for data in events_data:
        try:
            start_date_obj = datetime.strptime(data.start_date, "%Y-%m-%d").date()
            start_time_obj = datetime.strptime(data.start_time, "%H:%M").time()
            end_time_obj = datetime.strptime(data.end_time, "%H:%M").time()
        except ValueError:
            continue

        # For each schedule config, create an event entry
        for sched in data.schedules:
            target_wd_iso = sched.day - 1 # 0=Mon, ..., 6=Sun
            
            # Find first occurrence of target_wd on or after start_date_obj
            days_offset = (target_wd_iso - start_date_obj.weekday() + 7) % 7
            first_event_date = start_date_obj + timedelta(days=days_offset)
            
            event = Event()
            event.add('summary', data.title)
            if data.location:
                event.add('location', data.location)
            if data.description:
                event.add('description', data.description)
            
            dt_start = datetime.combine(first_event_date, start_time_obj)
            dt_end = datetime.combine(first_event_date, end_time_obj)
            
            event.add('dtstart', dt_start)
            event.add('dtend', dt_end)
            event.add('dtstamp', datetime.now())
            
            recur = {
                'FREQ': 'WEEKLY',
                'INTERVAL': sched.interval,
                'BYDAY': weekday_map[sched.day]
            }

            if sched.end_mode == "date" and sched.until_date:
                try:
                    until_dt = datetime.strptime(sched.until_date, "%Y-%m-%d")
                    # Set UNTIL to end of that day to overlap the event time
                    recur['UNTIL'] = until_dt.replace(hour=23, minute=59, second=59)
                except ValueError:
                    pass # Fallback or error handling
            elif sched.end_mode == "weeks" and sched.count:
                # Calculate UNTIL based on weeks duration from the first event of this schedule
                weeks_duration = sched.count
                # Duration starts from the first_event_date. 
                # e.g. 1 week means until start + 7 days.
                # Usually "End after 5 weeks" means the recurrence block lasts 5 weeks.
                end_date = first_event_date + timedelta(weeks=weeks_duration) - timedelta(days=1)
                # Subtract 1 day to make it inclusive/exclusive correctly?
                # If After 1 week, it means it ends next week?
                # Let's assume inclusive until that date? 
                # If Start=Mon Jan 1, Count=1 (Week). Interval=1 (Weekly).
                # Jan 1 + 7 days = Jan 8. 
                # Should Jan 8 be included? "After 1 week it has happened".
                # If it's a "Duration", usually means the window is [Start, Start + N Weeks).
                # If N=1, Window is Jan 1 to Jan 8.
                recur['UNTIL'] = datetime.combine(end_date, end_time_obj).replace(hour=23, minute=59, second=59)
            else:
                recur['COUNT'] = sched.count or 1

            event.add('rrule', vRecur(recur))
            
            cal.add_component(event)

    return cal.to_ical().decode('utf-8')
