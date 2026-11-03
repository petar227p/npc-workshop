// A bounded, explicitly marked part of the persona keeps free-form existing prompts intact.
const START = '<!-- workshop:personality -->';
const END = '<!-- /workshop:personality -->';

// Unmarked prompts (the examples, older drafts) describe the character in the first bullet of their "## Who" section;
// that bullet is the personality until it is first edited, when it becomes the marked part in the same place.
// Line ends may be CRLF (a Windows checkout of the examples); the bullet's range never takes in the '\r'.
function whoBullet(persona: string): { start: number; end: number } | null {
  const who = persona.search(/^## Who /m);
  if (who < 0) return null;
  const after = persona.slice(who);
  const list = after.match(/\r?\n\r?\n- /);
  const next = after.slice(1).search(/\r?\n## /);
  if (!list || list.index === undefined || (next >= 0 && list.index > next + 1)) return null;
  const start = who + list.index + list[0].length - 2;
  const line = persona.slice(start).search(/\r?\n/);
  return { start, end: line < 0 ? persona.length : start + line };
}

export function readPersonality(persona: string): string {
  const start = persona.indexOf(START);
  const end = persona.indexOf(END, start + START.length);
  if (start >= 0 && end >= 0) {
    const content = persona.slice(start + START.length, end);
    return content.startsWith('\n') && content.endsWith('\n') ? content.slice(1, -1) : content;
  }
  if (start >= 0) return '';
  const bullet = whoBullet(persona);
  return bullet ? persona.slice(bullet.start + 2, bullet.end) : '';
}

// An emptied personality keeps its markers, so the field stays empty instead of showing the next bullet.
export function writePersonality(persona: string, value: string): string {
  const start = persona.indexOf(START);
  const end = start < 0 ? -1 : persona.indexOf(END, start + START.length);
  const block = `${START}\n${value}\n${END}`;
  if (start >= 0 && end >= 0) return persona.slice(0, start) + block + persona.slice(end + END.length);
  const bullet = start < 0 ? whoBullet(persona) : null;
  if (bullet) return persona.slice(0, bullet.start) + block + persona.slice(bullet.end);
  if (!value) return persona;
  return persona.trim() ? `${block}\n\n${persona}` : block;
}

// Setup places the supplied personality in the first bullet of the "Who" section. Mark that exact bullet so the
// simple editor can change it later without retaining the old instructions.
export function markSetupPersonality(persona: string, value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return persona;
  const bullet = whoBullet(persona);
  if (!bullet || persona.slice(bullet.start, bullet.end) !== `- ${normalized}`) return persona;
  return persona.slice(0, bullet.start) + writePersonality('', normalized) + persona.slice(bullet.end);
}
