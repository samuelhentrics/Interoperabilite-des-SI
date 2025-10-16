CREATE TABLE IF NOT EXISTS demande (
    id SERIAL PRIMARY KEY,
    numero VARCHAR(50),
    type VARCHAR(50),
    date DATE
);
