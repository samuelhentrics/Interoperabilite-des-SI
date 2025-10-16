CREATE TABLE IF NOT EXISTS demandes (
    id SERIAL PRIMARY KEY,
    number VARCHAR(50),
    type VARCHAR(50),
    dateDemande DATE
);
