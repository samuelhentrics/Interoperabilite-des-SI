CREATE TABLE IF NOT EXISTS commandes (
    id SERIAL PRIMARY KEY,
    number VARCHAR(50),
    type VARCHAR(50),
    dateDemande DATE
);
