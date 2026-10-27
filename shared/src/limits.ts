// Plain constants with no zod, so the browser can import them without pulling the schemas into its bundle.

export const MAX_SAY_LENGTH = 500; // one spoken line; the engine, the HTTP route and the chat box all enforce it
