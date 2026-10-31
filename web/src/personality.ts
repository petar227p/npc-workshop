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
