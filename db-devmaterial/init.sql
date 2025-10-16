-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS demandes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Identifiant unique de la demande
    panne_id VARCHAR(50),                  -- ID de la panne
    type_panne VARCHAR(100),               -- Type de panne
    commentaire TEXT,                      -- Commentaire sur la panne
    date_demande DATE,                     -- Date de la demande
    date_inspection DATE,                  -- Date d'inspection
    date_intervention DATE,                -- Date d'intervention
    date_disponibilite DATE,               -- Date de disponibilité
    prix_devis NUMERIC(10,2),              -- Prix du devis
    rapport TEXT,                          -- Rapport
    devis_valide BOOLEAN DEFAULT FALSE,    -- Le devis est-il validé ?
    demande_cloturee BOOLEAN DEFAULT FALSE,-- La demande est-elle clôturée ?
    client_id INTEGER                      -- ID du client qui a demandé (référence à une table clients)
);
