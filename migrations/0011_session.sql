-- Session links (decision D35): where an item was worked on – the address of the chat or coding session
-- (e.g. https://claude.ai/code/session_…). first_session = the first session known for the item, last_session = the one
-- that changed it last (or a link the user entered in the web app). NULL = not known: claude.ai chats and ChatGPT do not
-- tell the model their address, and changes in the web app carry none. Each change also records its session in the
-- event data ("session"), so the history shows where every step happened. Session links never go into source.
ALTER TABLE items ADD COLUMN first_session TEXT;
ALTER TABLE items ADD COLUMN last_session TEXT;
