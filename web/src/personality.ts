// A bounded, explicitly marked part of the persona keeps free-form existing prompts intact.
const START = '<!-- workshop:personality -->';
const END = '<!-- /workshop:personality -->';

export function readPersonality(persona: string): string {
  const start = persona.indexOf(START);
  const end = persona.indexOf(END, start + START.length);
  if (start < 0 || end < 0) return '';
  const content = persona.slice(start + START.length, end);
  return content.startsWith('\n') && content.endsWith('\n') ? content.slice(1, -1) : content;
}

export function writePersonality(persona: string, value: string): string {
  const start = persona.indexOf(START);
  const end = start < 0 ? -1 : persona.indexOf(END, start + START.length);
  const block = value ? `${START}\n${value}\n${END}` : '';
  if (start >= 0 && end >= 0) return persona.slice(0, start) + block + persona.slice(end + END.length);
  return block ? `${persona}${persona.trim() ? '\n\n' : ''}${block}` : persona;
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
