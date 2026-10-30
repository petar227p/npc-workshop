// Plain constants with no zod, so the browser can import them without pulling the schemas into its bundle.

export const MAX_SAY_LENGTH = 500; // one spoken line; the engine, the HTTP route and the chat box all enforce it
export const MAX_EMOTE_LENGTH = 200; // one gesture, e.g. "wipes the anvil and squints at you"
export const MAX_NEWS_LENGTH = 300; // one piece of news passed on: the teller's own words for it
export const MAX_HAPPENED_LENGTH = 300; // one world event, as god mode (or a game) reports it
export const MAX_NOTE_LENGTH = 500; // a god-mode note in its own words, before the model reads it
export const MAX_HOURS_AGO = 48; // how far back a world event may be reported: two days, like the longest skip
export const MAX_LABEL_LENGTH = 40; // what players and the model call a good, material or item type ("iron sword")
export const MAX_SYNC_REASON = 200; // why a game changed an inventory itself ("looted the mill chest")
