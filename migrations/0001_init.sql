-- Article metadata index. HTML bodies live in R2 at r2_key.
CREATE TABLE IF NOT EXISTS articles (
	id TEXT PRIMARY KEY NOT NULL,
	slug TEXT NOT NULL,
	title TEXT NOT NULL,
	source_url TEXT NOT NULL,
	author TEXT,
	lang TEXT,
	published_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	r2_key TEXT NOT NULL,
	notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_slug ON articles (slug);

CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles (created_at DESC);
