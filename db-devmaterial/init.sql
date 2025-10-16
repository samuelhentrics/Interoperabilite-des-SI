-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS demandes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Unique request identifier
    fault_id VARCHAR(50),           -- Original fault identifier
    fault_type VARCHAR(100),        -- Fault type/category
    comment TEXT,                   -- Comment about the fault
    request_date DATE,              -- Date when request was created
    inspection_date DATE,           -- Inspection date
    intervention_date DATE,         -- Intervention date
    availability_date DATE,         -- Availability date
    estimate_price NUMERIC(10,2),   -- Price estimate
    report TEXT,                    -- Report
    estimate_validated BOOLEAN DEFAULT FALSE, -- Is the estimate validated?
    request_closed BOOLEAN DEFAULT FALSE,    -- Is the request closed?
    client_id INTEGER               -- Reference to client
);
