// A bounded, explicitly marked part of the persona keeps free-form existing prompts intact.
const START = '<!-- workshop:personality -->';
const END = '<!-- /workshop:personality -->';

// Unmarked prompts (the examples, older drafts) describe the character in the first bullet of their "## Who" section;
// that bullet is the personality until it is first edited, when it becomes the marked part in the same place.
function whoBullet(persona: string): { start: number; end: number } | null {
  const who = persona.search(/^## Who /m);
  if (who < 0) return null;
  const list = persona.indexOf('\n\n- ', who);
  const next = persona.indexOf('\n## ', who + 1);
  if (list < 0 || (next >= 0 && list > next)) return null;
  const start = list + 2;
  const end = persona.indexOf('\n', start);
  return { start, end: end < 0 ? persona.length : end };
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
  const section = persona.indexOf('\n\n- ', persona.indexOf('## Who '));
  if (section < 0) return persona;
  const start = section + 2;
  const line = `- ${normalized}`;
  if (!persona.startsWith(`${line}\n`, start)) return persona;
  return persona.slice(0, start) + writePersonality('', normalized) + persona.slice(start + line.length);
}
