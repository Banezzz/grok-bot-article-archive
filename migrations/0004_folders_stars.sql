-- Per-user manual folders (many-to-many with articles.id) and per-user stars.
CREATE TABLE folders (
	id TEXT PRIMARY KEY NOT NULL,
	user_id TEXT NOT NULL,
	name TEXT NOT NULL,
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX idx_folders_user_id ON folders (user_id);
CREATE UNIQUE INDEX idx_folders_user_name ON folders (user_id, name COLLATE NOCASE);

CREATE TABLE folder_articles (
	folder_id TEXT NOT NULL,
	article_id TEXT NOT NULL,
	created_at TEXT NOT NULL,
	PRIMARY KEY (folder_id, article_id)
);

CREATE INDEX idx_folder_articles_article_id ON folder_articles (article_id);
CREATE INDEX idx_folder_articles_folder_id ON folder_articles (folder_id);

CREATE TABLE article_stars (
	user_id TEXT NOT NULL,
	article_id TEXT NOT NULL,
	created_at TEXT NOT NULL,
	PRIMARY KEY (user_id, article_id)
);

CREATE INDEX idx_article_stars_article_id ON article_stars (article_id);
CREATE INDEX idx_article_stars_user_id ON article_stars (user_id);
