
CREATE TABLE stocks (
    date TIMESTAMPTZ NULL,
    symbol TEXT NULL,
    open DOUBLE PRECISION NULL,
    high DOUBLE PRECISION NULL,
    low DOUBLE PRECISION NULL,
    close DOUBLE PRECISION NULL,
    adj_close DOUBLE PRECISION NULL,
    volume BIGINT NULL
);

CREATE TABLE credits (
    movie_id INTEGER,
    title TEXT,
    "cast" JSONB,
    crew JSONB
);

CREATE TABLE movies (
    budget BIGINT,
    genres JSONB,
    homepage TEXT,
    id INTEGER,
    keywords JSONB,
    original_language TEXT,
    original_title TEXT,
    overview TEXT,
    popularity DOUBLE PRECISION,
    production_companies JSONB,
    production_countries JSONB,
    release_date TIMESTAMP,
    revenue BIGINT,
    runtime DOUBLE PRECISION,
    spoken_languages JSONB,
    status TEXT,
    tagline TEXT,
    title  TEXT,
    vote_average DOUBLE PRECISION,
    vote_count INTEGER
);
create table regions (
	country varchar(120), 
	code2 varchar(2), 
	code3 varchar(3), 
	numeric_code int, 
	region varchar(120), 
	global_region varchar(120)
);