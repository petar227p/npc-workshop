export type ValidationHelp = { message: string; target: 'catalogue' | 'abilities' | 'permissions' | 'character' | 'character-advanced' | 'world' | 'appearance' | null; label: string };

export function validationHelp(error: string): ValidationHelp {
  if (/need(?:s)? a catalogue with something to sell/i.test(error)) return { message: 'This character can make offers but has nothing in its catalogue. Add an item or change its permissions.', target: 'catalogue', label: 'Go to catalogue' };
  if (/SIGNAL needs at least one signal/i.test(error)) return { message: 'Add an action the character can request from the game, or remove its signal permission.', target: 'abilities', label: 'Go to abilities' };
  if (/needs the .*facts|needs START_WORK|model verb|GIVE is for NPCs|must be allowed SAY/i.test(error)) return { message: error, target: 'permissions', label: 'Go to permissions' };
  if (/^name:.*at least 1 character/i.test(error)) return { message: 'Give your character a name before testing.', target: 'character', label: 'Add a name' };
  const path = error.split(':', 1)[0];
  if (/^(catalogue|start)(\.|$)/.test(path)) return { message: error, target: 'catalogue', label: 'Go to catalogue' };
  if (/^(id|model|effort|fallbacks)(\.|$)/.test(path) || /^npc id /.test(error)) return { message: error, target: 'character-advanced', label: 'Go to character settings' };
  if (/^(name|persona)(\.|$)/.test(path)) return { message: error, target: 'character', label: 'Go to character' };
  if (/^(schedule|location|perception_radius|triggers|cue)(\.|$)/.test(path)) return { message: error, target: 'world', label: 'Go to behaviour' };
  if (/^(art|sprite)(\.|$)/.test(path)) return { message: error, target: 'appearance', label: 'Go to appearance' };
  if (/^(verbs|model_verbs|facts|labels|signals)(\.|$)/.test(path)) return { message: error, target: 'permissions', label: 'Go to permissions' };
  return { message: error, target: null, label: '' };
}
