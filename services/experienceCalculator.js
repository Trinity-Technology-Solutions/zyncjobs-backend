// Deterministic experience computation from work-experience date strings.
// Parses ranges like "Jun 2021 - Present", "2021 - 2023", "01/2020 - 12/2022"
// and returns total months/years. Returns null when nothing can be parsed.

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

const PRESENT_RE = /\b(present|current|till\s*date|till\s*now|ongoing|now)\b/i;
const YEAR_RE = /\b(19|20)\d{2}\b/;
const MONTH_YEAR_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,.\-/]*(\d{4})\b/i;
const NUM_MONTH_YEAR_RE = /\b(\d{1,2})\s*[/\-.]\s*(\d{4})\b/;

function parseDatePart(str) {
  if (!str) return null;
  const my = str.match(MONTH_YEAR_RE);
  if (my) return { year: parseInt(my[2], 10), month: MONTHS[my[1].slice(0, 3).toLowerCase()] };
  const nm = str.match(NUM_MONTH_YEAR_RE);
  if (nm) {
    const month = parseInt(nm[1], 10);
    if (month >= 1 && month <= 12) return { year: parseInt(nm[2], 10), month: month - 1 };
  }
  const y = str.match(YEAR_RE);
  if (y) return { year: parseInt(y[0], 10), month: 0 };
  return null;
}

function splitRange(dateStr) {
  const parts = String(dateStr || '').split(/[-–—to]+/).map(s => s.trim()).filter(Boolean);
  return parts;
}

export function computeTotalExperience(workExperiences) {
  if (!Array.isArray(workExperiences)) return null;
  let totalMonths = 0;
  let parsedAny = false;

  for (const exp of workExperiences) {
    const dateStr = exp?.date || '';
    if (!dateStr) continue;
    const parts = splitRange(dateStr);
    const start = parseDatePart(parts[0]);
    if (!start) continue;

    let end = null;
    if (parts.length > 1) {
      end = parseDatePart(parts.slice(1).join(' '));
    } else {
      // Single date with no range — assume 1 year unless "Present"
      if (PRESENT_RE.test(dateStr)) {
        end = { year: new Date().getFullYear(), month: new Date().getMonth() };
      } else {
        totalMonths += 12;
        parsedAny = true;
        continue;
      }
    }
    if (!end && PRESENT_RE.test(dateStr)) {
      end = { year: new Date().getFullYear(), month: new Date().getMonth() };
    }
    if (!end) continue;

    const months = (end.year - start.year) * 12 + (end.month - start.month);
    if (months > 0 && months < 600) {
      totalMonths += months;
      parsedAny = true;
    }
  }

  if (!parsedAny) return null;
  return Math.round((totalMonths / 12) * 10) / 10;
}

// Fallback: scan raw text for explicit "X years" statements
export function extractExperienceYearsFromText(text) {
  if (!text) return null;
  const m = text.match(/\b(\d+(?:\.\d+)?)\s*(?:\+|to\s*\d+)?\s*years?\b/i);
  if (m) {
    const v = parseFloat(m[1]);
    if (v >= 0 && v <= 60) return v;
  }
  return null;
}

export default { computeTotalExperience, extractExperienceYearsFromText };