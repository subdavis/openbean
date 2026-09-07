-- 180px-wide WebP copy uploaded alongside the original, used as the feed's blur-up
-- placeholder and (later) the calendar's tile. NULL means the client could not make
-- one; callers fall back to the original.
ALTER TABLE post_photos ADD COLUMN thumb_key TEXT;

-- Intrinsic size of the original, captured client-side at upload. Lets the feed
-- reserve each slide's real box instead of guessing one ratio for everything.
ALTER TABLE post_photos ADD COLUMN width INTEGER;
ALTER TABLE post_photos ADD COLUMN height INTEGER;
