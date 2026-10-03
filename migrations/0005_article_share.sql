-- Per-article public share flag. Default is private (0).
-- When shared = 1, anyone with the article URL can read that article and its thumbnail.
ALTER TABLE articles ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;
