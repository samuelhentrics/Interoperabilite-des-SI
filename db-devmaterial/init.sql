-- UUID generator
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =======================
-- 1) CLIENT
-- =======================
CREATE TABLE IF NOT EXISTS client (
  id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom VARCHAR(255)
);

-- =======================
-- 2) DEMANDE
-- =======================
CREATE TABLE IF NOT EXISTS demandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(255),
  statut VARCHAR(255),
  dateCreation DATE,
  type VARCHAR(255),
  commentaire TEXT,
  client_id UUID NOT NULL,
  CONSTRAINT fk_demandes_client
    FOREIGN KEY (client_id)
    REFERENCES client(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT         -- un client avec des demandes ne peut pas être supprimé
);

CREATE INDEX IF NOT EXISTS idx_demandes_client_id ON demandes(client_id);

-- =======================
-- 3) DEVIS  (0..n par Demande)
-- =======================
CREATE TABLE IF NOT EXISTS devis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prixDePiece NUMERIC(10,2),
  prixHoraire NUMERIC(10,2),
  tempsEstime INTERVAL,
  demande_id UUID NOT NULL,
  CONSTRAINT fk_devis_demande
    FOREIGN KEY (demande_id)
    REFERENCES demandes(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_devis_demande_id ON devis(demande_id);

-- =======================
-- 4) INTERVENTION  (0..n par Demande)
-- =======================
CREATE TABLE IF NOT EXISTS intervention (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE,
  lieu VARCHAR(255),
  tempsReel INTERVAL,   -- durée réelle (ex: '12 hours 30 minutes')
  commentaire TEXT,
  demande_id UUID NOT NULL,
  CONSTRAINT fk_intervention_demande
    FOREIGN KEY (demande_id)
    REFERENCES demandes(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_intervention_demande_id ON intervention(demande_id);

-- =======================
-- 5) INSPECTION  (0..1 par Demande)
-- =======================
CREATE TABLE IF NOT EXISTS inspection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE,
  pieceDefectueuse VARCHAR(255),
  commentaire TEXT,
  demande_id UUID UNIQUE,  -- garantit au plus une inspection par demande
  CONSTRAINT fk_inspection_demande
    FOREIGN KEY (demande_id)
    REFERENCES demandes(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

-- =======================
-- 6) RAPPORT  (0..1 par Demande)
-- =======================
CREATE TABLE IF NOT EXISTS rapport (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finIntervention BOOLEAN,
  commentaire TEXT,
  demande_id UUID UNIQUE,    -- garantit au plus un rapport par demande
  CONSTRAINT fk_rapport_demande
    FOREIGN KEY (demande_id)
    REFERENCES demandes(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);
