-- UUID generator
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =======================
-- 1) DEMANDE
-- =======================
CREATE TABLE IF NOT EXISTS demandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(255),
  state INTEGER,
  createdAt DATE,
  type VARCHAR(255),
  comment TEXT
);

-- =======================
-- 2) DEVIS  (0..n par Demande)
-- =======================
CREATE TABLE IF NOT EXISTS devis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priceComponent  NUMERIC(10,2),
  priceHour NUMERIC(10,2),
  estimatedTime INTERVAL,
  demande_id UUID NOT NULL,
  CONSTRAINT fk_devis_demande
    FOREIGN KEY (demande_id)
    REFERENCES demandes(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

-- =======================
-- 3) INTERVENTION  (0..n par Demande)
-- =======================
CREATE TABLE IF NOT EXISTS intervention (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interventionDate DATE,
  localisation VARCHAR(255),
  realTime INTERVAL,   -- durée réelle (ex: '12 hours 30 minutes')
  comment TEXT,
  demande_id UUID NOT NULL,
  CONSTRAINT fk_intervention_demande
    FOREIGN KEY (demande_id)
    REFERENCES demandes(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);


-- =======================
-- 4) INSPECTION  (0..1 par Demande)
-- =======================
CREATE TABLE IF NOT EXISTS inspection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspectedAt DATE,
  defectiveComponent VARCHAR(255),
  comment TEXT,
  demande_id UUID UNIQUE,  -- garantit au plus une inspection par demande
  CONSTRAINT fk_inspection_demande
    FOREIGN KEY (demande_id)
    REFERENCES demandes(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

-- =======================
-- 5) RAPPORT  (0..1 par Demande)
-- =======================
CREATE TABLE IF NOT EXISTS rapport (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endIntervention BOOLEAN,
  comment TEXT,
  demande_id UUID UNIQUE,    -- garantit au plus un rapport par demande
  CONSTRAINT fk_rapport_demande
    FOREIGN KEY (demande_id)
    REFERENCES demandes(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);
