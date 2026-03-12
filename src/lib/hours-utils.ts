// Utility for parsing and displaying opening hours

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0, su: 0,
  monday: 1, mon: 1, mo: 1,
  tuesday: 2, tue: 2, tu: 2, tues: 2,
  wednesday: 3, wed: 3, we: 3,
  thursday: 4, thu: 4, th: 4, thurs: 4,
  friday: 5, fri: 5, fr: 5,
  saturday: 6, sat: 6, sa: 6,
};

const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseTime(timeStr: string): number | null {
  const s = timeStr.trim().toLowerCase();
  if (s === 'closed') return null;
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(?:\u202f)?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toLowerCase();
  if (period === 'pm' && hours !== 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function isDayMatch(dayPart: string, currentDay: number): boolean {
  const rangeParts = dayPart.split(/\s*[-–—]\s*/);
  if (rangeParts.length === 2) {
    const startDay = DAY_NAMES[rangeParts[0].trim()];
    const endDay = DAY_NAMES[rangeParts[1].trim()];
    if (startDay !== undefined && endDay !== undefined) {
      if (startDay <= endDay) return currentDay >= startDay && currentDay <= endDay;
      return currentDay >= startDay || currentDay <= endDay;
    }
  }
  return DAY_NAMES[dayPart.trim()] === currentDay;
}

export function parseTimeRange(timePart: string): { start: number; end: number } | null {
  const parts = timePart.split(/\s*[-–—to]+\s*/i);
  if (parts.length < 2) return null;
  const start = parseTime(parts[0]);
  const end = parseTime(parts[parts.length - 1]);
  if (start === null || end === null) return null;
  return { start, end };
}

export function isCurrentlyOpen(hours: string): boolean {
  if (!hours || !hours.trim()) return false;
  const now = new Date();
  const currentDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const entries = hours.split(/[,;|]/).map(e => e.trim()).filter(Boolean);
  for (const entry of entries) {
    const dayTimeMatch = entry.match(/^([a-zA-Z]+(?:\s*[-–—]\s*[a-zA-Z]+)?)\s*[:]\s*(.+)$/);
    if (dayTimeMatch) {
      const dayPart = dayTimeMatch[1].trim().toLowerCase();
      const timePart = dayTimeMatch[2].trim();
      if (!isDayMatch(dayPart, currentDay)) continue;
      if (timePart.toLowerCase() === 'closed') return false;
      if (timePart.toLowerCase().includes('24 hour') || timePart.toLowerCase().includes('open 24')) return true;
      const timeRange = parseTimeRange(timePart);
      if (timeRange && currentMinutes >= timeRange.start && currentMinutes <= timeRange.end) return true;
      continue;
    }
    const noColonMatch = entry.match(/^([a-zA-Z]+(?:\s*[-–—]\s*[a-zA-Z]+)?)\s+(.+)$/);
    if (noColonMatch) {
      const dayPart = noColonMatch[1].trim().toLowerCase();
      const timePart = noColonMatch[2].trim();
      if (!isDayMatch(dayPart, currentDay)) continue;
      if (timePart.toLowerCase() === 'closed') return false;
      const timeRange = parseTimeRange(timePart);
      if (timeRange && currentMinutes >= timeRange.start && currentMinutes <= timeRange.end) return true;
    }
  }
  return false;
}

export function isFollowUpDue(followUpDate: string): boolean {
  if (!followUpDate) return false;
  return new Date(followUpDate) <= new Date();
}

export interface ParsedDayHours {
  day: string;
  dayIndex: number;
  hours: string;
  isToday: boolean;
}

export function parseAllDayHours(hoursStr: string): ParsedDayHours[] {
  if (!hoursStr || !hoursStr.trim()) return [];
  const currentDay = new Date().getDay();
  const results: ParsedDayHours[] = [];
  const entries = hoursStr.split(/[,;|]/).map(e => e.trim()).filter(Boolean);
  
  for (const entry of entries) {
    const match = entry.match(/^([a-zA-Z]+(?:\s*[-–—]\s*[a-zA-Z]+)?)\s*[:\s]\s*(.+)$/);
    if (match) {
      const dayPart = match[1].trim();
      const timePart = match[2].trim();
      
      // Check if it's a day range
      const rangeParts = dayPart.split(/\s*[-–—]\s*/);
      if (rangeParts.length === 2) {
        const startDay = DAY_NAMES[rangeParts[0].toLowerCase().trim()];
        const endDay = DAY_NAMES[rangeParts[1].toLowerCase().trim()];
        if (startDay !== undefined && endDay !== undefined) {
          let d = startDay;
          while (true) {
            results.push({
              day: DAY_ORDER[d],
              dayIndex: d,
              hours: timePart,
              isToday: d === currentDay,
            });
            if (d === endDay) break;
            d = (d + 1) % 7;
          }
          continue;
        }
      }
      
      const dayIdx = DAY_NAMES[dayPart.toLowerCase().trim()];
      if (dayIdx !== undefined) {
        results.push({
          day: DAY_ORDER[dayIdx],
          dayIndex: dayIdx,
          hours: timePart,
          isToday: dayIdx === currentDay,
        });
      }
    }
  }
  
  // Sort by day, starting from today
  results.sort((a, b) => {
    const aOffset = (a.dayIndex - currentDay + 7) % 7;
    const bOffset = (b.dayIndex - currentDay + 7) % 7;
    return aOffset - bOffset;
  });
  
  return results;
}

export function getTodayHours(hoursStr: string): string {
  const parsed = parseAllDayHours(hoursStr);
  const today = parsed.find(p => p.isToday);
  if (today) return `${SHORT_DAYS[today.dayIndex]}: ${today.hours}`;
  return hoursStr.length > 30 ? hoursStr.slice(0, 30) + '…' : hoursStr;
}
