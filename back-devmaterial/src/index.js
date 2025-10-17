import express from "express";
import pkg from "pg";
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import cors from 'cors';
import 'dotenv/config';


const { Pool } = pkg;
const app = express();
const port = process.env.PORT || 3000;

// --- Middlewares globaux ---
app.use(cors());
app.use(express.json());

// --- Configuration de la base de données ---
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

// --- Configuration de Swagger ---
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
                title: 'API DevMaterial',
                    version: '1.0.0',
                    description: 'Documentation de l\'API pour la gestion des demandes de matériel.',
        },
        servers: [
            {
                url: `http://localhost:${port}`,
                description: 'Serveur de développement',
            },
        ],
    },
    apis: ['./src/index.js'], // Assure-toi que le chemin est correct !
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

// --- Route pour la documentation Swagger ---
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --- Schéma de données Swagger ---
/**
 * @swagger
 * components:
 *   schemas:
 *     Demande:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         code:
 *           type: string
 *         statut:
 *           type: string
 *         dateCreation:
 *           type: string
 *           format: date
 *         type:
 *           type: string
 *         commentaire:
 *           type: string
 *         client_id:
 *           type: string
 *           format: uuid
 *         client_name:
 *           type: string
 *       example:
 *         id: "a1b2c3d4-..."
 *         code: "REQ-0001"
 *         statut: "open"
 *         dateCreation: "2025-10-15"
 *         type: "Electrique"
 *         commentaire: "Problème intermittent"
 *         client_id: "1111-2222-3333"
 *         client_name: "ACME"
 */

// --- Routes de l'API ---

/**
 * @swagger
 * /api/demandes:
 *   get:
 *     summary: Récupère la liste de toutes les demandes
 *     tags: [Demandes]
 *     responses:
 *       200:
 *         description: La liste des demandes a été récupérée avec succès.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Demande'
 */
app.get("/api/demandes", async (req, res) => {
    try {
        // Return demandes with client name
        const q = `SELECT d.*, c.nom AS client_name
                   FROM demandes d
                   LEFT JOIN client c ON d.client_id = c.id
                   ORDER BY d.dateCreation DESC NULLS LAST`;
        const result = await pool.query(q);
        res.json(result.rows);
    } catch (err) {
        console.error('Erreur lors de la récupération des demandes :', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

/**
 * @swagger
 * /api/demandes:
 *   post:
 *     summary: Crée une nouvelle demande
 *     tags: [Demandes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Demande'
 *     responses:
 *       200:
 *         description: La commande a été créée avec succès.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Demande'
 *       500:
 *         description: Une erreur est survenue sur le serveur.
 */
app.post('/api/demandes', async (req, res) => {
    try {
        await createDemande(req.body);

        try{
            await publishToWebhookPost(process.env.WEBHOOK_POST_URL + "/api/demandes", req.body);
        }
        catch (err) {
            console.error('Erreur lors de l\'envoi du webhook :', err);
        }
    } catch (err) {
        console.error('Erreur lors de la création de la demande :', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get single demande by id
app.get('/api/demandes/:id', async (req, res) => {
    const id = req.params.id; // accept UUID string
    try {
        const q = `SELECT d.*, c.nom AS client_name
                   FROM demandes d
                   LEFT JOIN client c ON d.client_id = c.id
                   WHERE d.id = $1`;
        const result = await pool.query(q, [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Demande not found' });
        const demande = result.rows[0];

        // fetch related items
        const devis = (await pool.query('SELECT * FROM devis WHERE demande_id = $1 ORDER BY id', [id])).rows;
        const interventions = (await pool.query('SELECT * FROM intervention WHERE demande_id = $1 ORDER BY id', [id])).rows;
        const inspection = (await pool.query('SELECT * FROM inspection WHERE demande_id = $1 LIMIT 1', [id])).rows[0] || null;
        const rapport = (await pool.query('SELECT * FROM rapport WHERE demande_id = $1 LIMIT 1', [id])).rows[0] || null;

        let structuredResponse = demande;
        structuredResponse.devis = devis;
        structuredResponse.interventions = interventions;
        structuredResponse.inspection = inspection;
        structuredResponse.rapport = rapport;

        return res.json(structuredResponse);
    } catch (err) {
        console.error('Erreur lors de la récupération de la demande :', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Patch partial update by id (update per field)
app.patch('/api/demandes/:id', async (req, res) => {
    const id = req.params.id; // accept UUID

    const allowed = ['code','statut','dateCreation','type','commentaire','client_id'];
    const keys = Object.keys(req.body).filter(k => allowed.includes(k));
    if (keys.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    const setClauses = keys.map((k, i) => `${k} = $${i+1}`).join(', ');
    const values = keys.map(k => req.body[k]);
    values.push(id);

    const query = `UPDATE demandes SET ${setClauses} WHERE id = $${keys.length + 1} RETURNING *`;
    try {
        const result = await pool.query(query, values);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Demande not found' });
        return res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur lors de la mise à jour de la demande :', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Full replace/update of a demande and its related entities
app.put('/api/demandes/:id', async (req, res) => {
    const id = req.params.id;
    const body = req.body || {};

    // Map incoming fields to DB columns
    const demandeFieldsMap = {
        code: 'code',
        statut: 'statut',
        datecreation: 'dateCreation',
        dateCreation: 'dateCreation',
        type: 'type',
        commentaire: 'commentaire',
        client_id: 'client_id',
        clientId: 'client_id'
    };

    const keys = Object.keys(body).filter(k => Object.keys(demandeFieldsMap).includes(k));

    const conn = await pool.connect();
    try {
        await conn.query('BEGIN');

        // Update demandes table if there are top-level demande fields
        if (keys.length > 0) {
            const cols = keys.map((k, i) => `${demandeFieldsMap[k]} = $${i + 1}`).join(', ');
            const vals = keys.map(k => body[k]);
            vals.push(id);
            const q = `UPDATE demandes SET ${cols} WHERE id = $${keys.length + 1} RETURNING *`;
            const up = await conn.query(q, vals);
            if (up.rows.length === 0) {
                await conn.query('ROLLBACK');
                return res.status(404).json({ error: 'Demande not found' });
            }
        }

        // Helper to update or insert inspection
        if (body.inspection) {
            const insp = body.inspection;
            // Prefer update by id, fallback to demande_id
            if (insp.id) {
                await conn.query(
                    `UPDATE inspection SET date = $1, piecedefectueuse = $2, commentaire = $3 WHERE id = $4`,
                    [insp.date || null, insp.piecedefectueuse || null, insp.commentaire || null, insp.id]
                );
            } else {
                // update by demande_id
                await conn.query(
                    `UPDATE inspection SET date = $1, piecedefectueuse = $2, commentaire = $3 WHERE demande_id = $4`,
                    [insp.date || null, insp.piecedefectueuse || null, insp.commentaire || null, id]
                );
            }
        }

        // Helper to update rapport
        if (body.rapport) {
            const rap = body.rapport;
            const fin = rap.finintervention !== undefined ? rap.finintervention : (rap.finIntervention !== undefined ? rap.finIntervention : null);
            if (rap.id) {
                await conn.query(
                    `UPDATE rapport SET finIntervention = $1, commentaire = $2 WHERE id = $3`,
                    [fin, rap.commentaire || null, rap.id]
                );
            } else {
                await conn.query(
                    `UPDATE rapport SET finIntervention = $1, commentaire = $2 WHERE demande_id = $3`,
                    [fin, rap.commentaire || null, id]
                );
            }
        }

        // Helper to update/insert devis
        if (body.devis) {
            const handleDevis = async (d) => {
                const p = d.prixdepiece !== undefined ? d.prixdepiece : (d.prixDePiece !== undefined ? d.prixDePiece : null);
                const h = d.prixhoraire !== undefined ? d.prixhoraire : (d.prixHoraire !== undefined ? d.prixHoraire : null);
                const t = d.tempsestime !== undefined ? d.tempsestime : (d.tempsEstime !== undefined ? d.tempsEstime : null);
                if (d.id) {
                    await conn.query(`UPDATE devis SET prixDePiece = $1, prixHoraire = $2, tempsEstime = $3 WHERE id = $4`, [p, h, t, d.id]);
                } else {
                    // if a row exists for this demande, update first row; otherwise insert
                    const existing = await conn.query('SELECT id FROM devis WHERE demande_id = $1 LIMIT 1', [id]);
                    if (existing.rows.length > 0) {
                        await conn.query(`UPDATE devis SET prixDePiece = $1, prixHoraire = $2, tempsEstime = $3 WHERE id = $4`, [p, h, t, existing.rows[0].id]);
                    } else {
                        await conn.query(`INSERT INTO devis (prixDePiece, prixHoraire, tempsEstime, demande_id) VALUES ($1,$2,$3,$4)`, [p || 0, h || 0, t || 0, id]);
                    }
                }
            };

            if (Array.isArray(body.devis)) {
                for (const d of body.devis) await handleDevis(d);
            } else {
                await handleDevis(body.devis);
            }
        }

        // Helper to update interventions
        if (body.interventions || body.intervention) {
            const items = body.interventions || (body.intervention ? [body.intervention] : []);
            for (const it of items) {
                const date = it.date || null;
                const lieu = it.lieu || it.lieuIntervention || null;
                const temps = it.tempsreel || it.tempsReel || null;
                const comm = it.commentaire || null;
                if (it.id) {
                    await conn.query(`UPDATE intervention SET date = $1, lieu = $2, tempsReel = $3, commentaire = $4 WHERE id = $5`, [date, lieu, temps, comm, it.id]);
                } else {
                    const existing = await conn.query('SELECT id FROM intervention WHERE demande_id = $1 LIMIT 1', [id]);
                    if (existing.rows.length > 0) {
                        await conn.query(`UPDATE intervention SET date = $1, lieu = $2, tempsReel = $3, commentaire = $4 WHERE id = $5`, [date, lieu, temps, comm, existing.rows[0].id]);
                    } else {
                        await conn.query(`INSERT INTO intervention (date, lieu, tempsReel, commentaire, demande_id) VALUES ($1,$2,$3,$4,$5)`, [date, lieu, temps, comm, id]);
                    }
                }
            }
        }

        await conn.query('COMMIT');

        // Return fresh data (reuse existing GET logic)
        const q = `SELECT d.*, c.nom AS client_name
                   FROM demandes d
                   LEFT JOIN client c ON d.client_id = c.id
                   WHERE d.id = $1`;
        const result = await pool.query(q, [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Demande not found after update' });
        const demande = result.rows[0];

        const devis = (await pool.query('SELECT * FROM devis WHERE demande_id = $1 ORDER BY id', [id])).rows;
        const interventions = (await pool.query('SELECT * FROM intervention WHERE demande_id = $1 ORDER BY id', [id])).rows;
        const inspection = (await pool.query('SELECT * FROM inspection WHERE demande_id = $1 LIMIT 1', [id])).rows[0] || null;
        const rapport = (await pool.query('SELECT * FROM rapport WHERE demande_id = $1 LIMIT 1', [id])).rows[0] || null;

        let structuredResponse = demande;
        structuredResponse.devis = devis;
        structuredResponse.interventions = interventions;
        structuredResponse.inspection = inspection;
        structuredResponse.rapport = rapport;

        return res.json(structuredResponse);
    } catch (err) {
        await conn.query('ROLLBACK').catch(() => {});
        console.error('Erreur lors de la mise à jour complète de la demande :', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    } finally {
        conn.release();
    }
});

// Delete demande by id
app.delete('/api/demandes/:id', async (req, res) => {
    const id = req.params.id; // accept UUID
    try {
        const result = await pool.query('DELETE FROM demandes WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Demande not found' });
        return res.json({ message: 'Demande deleted', deleted: result.rows[0] });
    } catch (err) {
        console.error('Erreur lors de la suppression de la demande :', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

async function createDemande(data) {
    try {
        const id = data.id; // accept UUID
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const demandeType = data.type;
        const commentaire = data.commentaire;
        const client_name = data.client_name;


        // Validate required fields per your request
        if (!commentaire) throw new Error('commentaire is required');
        if (!demandeType) throw new Error('type is required');
        if (!client_name) throw new Error('client_name is required');

        // Verify client exists
        const cCheck = await pool.query('SELECT id, nom FROM client WHERE nom = $1', [client_name]);
        if (cCheck.rows.length === 0) throw new Error('client_name not found');

        // Use transaction to create demande and initial related rows
        const clientNom = cCheck.rows[0].nom;
        const clientIdFinal = cCheck.rows[0].id;
        const conn = await pool.connect();
        try {
            await conn.query('BEGIN');
            const insertDemandeQuery = id
                ? `INSERT INTO demandes (id, code, statut, dateCreation, type, commentaire, client_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`
                : `INSERT INTO demandes (code, statut, dateCreation, type, commentaire, client_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`;
            const insertDemandeParams = id
                ? [id, code || null, 0 || null, new Date().toISOString().slice(0,10), demandeType, commentaire, clientIdFinal]
                : [code || null, 0 || null, new Date().toISOString().slice(0,10), demandeType, commentaire, clientIdFinal];

            const rDem = await conn.query(insertDemandeQuery, insertDemandeParams);
            const demandeRow = rDem.rows[0];

            // Create initial inspection (empty)
            const rInsp = await conn.query('INSERT INTO inspection (demande_id) VALUES ($1) RETURNING *', [demandeRow.id]);

            // Inserer intervention
            const rInterv = await conn.query('INSERT INTO intervention (demande_id, lieu, tempsReel, date) VALUES ($1, NULL, NULL, NULL) RETURNING *', [demandeRow.id]);

            // Create initial rapport (empty)
            const rRap = await conn.query('INSERT INTO rapport (demande_id, finIntervention, commentaire) VALUES ($1, false, NULL) RETURNING *', [demandeRow.id]);

            // Create initial devis with zeroed prices and zero interval
            const rDevis = await conn.query('INSERT INTO devis (prixDePiece, prixHoraire, tempsEstime, demande_id) VALUES ($1,$2,$3,$4) RETURNING *', [0, 0, 0, demandeRow.id]);

            await conn.query('COMMIT');

            // attach client name for convenience
            demandeRow.client_name = clientNom;


            let structuredResponse = demandeRow;
            structuredResponse.inspection = rInsp.rows[0];
            structuredResponse.rapport = rRap.rows[0];
            structuredResponse.devis = rDevis.rows[0];
            structuredResponse.intervention = rInterv.rows[0];

            return res.json(structuredResponse);
        } catch (errInner) {
            await conn.query('ROLLBACK');
            throw errInner;
        } finally {
            conn.release();
        }
    } catch (err) {
        throw err;
    }
}


// --- webhook ---
app.post("/webhook", (req, res) => {
    const signature = req.headers["x-signature"];
    const payload = JSON.stringify(req.body);

    console.log("📩 Webhook reçu :", payload);
    console.log("🔐 Signature :", signature);

    res.status(200).send({ message: "Event received" });
});

async function publishToWebhookPost(url, data) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '<no body>');
            throw new Error(`HTTP ${response.status} - ${text}`);
        }
    } catch (err) {
        throw err;
    }
}





async function publishToWebhookPut(url, data) {
    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '<no body>');
            throw new Error(`HTTP ${response.status} - ${text}`);
        }
    }
    catch (err) {
        throw err;
    }
}

async function publishToWebhookDelete(url, data) {
    try {
        const response = await fetch(url, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '<no body>');
            throw new Error(`HTTP ${response.status} - ${text}`);
        }
    }
    catch (err) {
        throw err;
    }
}



async function subscribeToWebhook() {
    const subscribeUrl = process.env.WEBHOOK_SUBSCRIBE_URL;
    const callbackUrl = process.env.CALLBACK_URL || `http://localhost:${port}/webhook`;

    if (!subscribeUrl) {
        console.warn('⚠️ WEBHOOK_SUBSCRIBE_URL is not defined — skipping webhook subscription');
        return;
    }

    try {
        const who = process.env.WEBHOOK_WHO || 'erp-devmaterial';
        console.log(`➡️ Subscribing to webhook at ${subscribeUrl} as '${who}' with callback ${callbackUrl}`);
        const response = await fetch(subscribeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ who, url: callbackUrl }),
        });

        if (response.ok) {
            console.log(`✅ Connecté au webhook : ${subscribeUrl} (who=${who})`);
        } else {
            const text = await response.text().catch(() => '<no body>');
            console.error('❌ Erreur lors de la connexion au webhook :', text);
        }
    } catch (err) {
        console.error('⚠️ Impossible de se connecter au webhook :', err && err.message ? err.message : err);
    }
}

if (process.env.NODE_ENV !== 'test') {
    app.listen(port, async () => {
        console.log(`✅ Backend running on port ${port}`);
        console.log(`📄 Documentation API disponible sur http://localhost:${port}/api-docs`);

        // Connexion au webhook
        setTimeout(async () => {
            console.log('⏳ Tentative de connexion au webhook...');
            await subscribeToWebhook();
        }, 10000);

    });
}

export default app;
