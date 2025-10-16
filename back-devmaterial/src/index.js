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
 *           type: integer
 *         panne_id:
 *           type: string
 *         type_panne:
 *           type: string
 *         commentaire:
 *           type: string
 *         date_demande:
 *           type: string
 *           format: date
 *         date_inspection:
 *           type: string
 *           format: date
 *         date_intervention:
 *           type: string
 *           format: date
 *         date_disponibilite:
 *           type: string
 *           format: date
 *         prix_devis:
 *           type: number
 *           format: double
 *         rapport:
 *           type: string
 *         devis_valide:
 *           type: boolean
 *         demande_cloturee:
 *           type: boolean
 *         client_id:
 *           type: integer
 *       example:
 *         id: 1
 *         panne_id: "PANNE-001"
 *         type_panne: "Electrique"
 *         commentaire: "Problème intermittent"
 *         date_demande: "2025-10-15"
 *         date_inspection: null
 *         date_intervention: null
 *         date_disponibilite: null
 *         prix_devis: 125.50
 *         rapport: null
 *         devis_valide: false
 *         demande_cloturee: false
 *         client_id: 42
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
        const result = await pool.query("SELECT * FROM demandes ORDER BY id ASC");
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
        // Accept english field names (fault_type, comment, fault_id) and french compatibility
        const {
            id,
            fault_id,
            fault_type,
            comment,
            // french
            panne_id,
            type_panne,
            commentaire
        } = req.body;

        const finalFaultId = fault_id || panne_id || null;
        const finalFaultType = fault_type || type_panne;
        const finalComment = comment || commentaire || null;

        if (!finalFaultType) return res.status(400).json({ error: 'fault_type (or type_panne) is required' });

        let result;
        if (id) {
            result = await pool.query(
                `INSERT INTO demandes (id, fault_id, fault_type, comment, request_date) VALUES ($1, $2, $3, $4, CURRENT_DATE) RETURNING *`,
                [id, finalFaultId, finalFaultType, finalComment]
            );
        } else {
            result = await pool.query(
                `INSERT INTO demandes (fault_id, fault_type, comment, request_date) VALUES ($1, $2, $3, CURRENT_DATE) RETURNING *`,
                [finalFaultId, finalFaultType, finalComment]
            );
        }
        return res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur lors de la création de la demande :', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get single demande by id
app.get('/api/demandes/:id', async (req, res) => {
    const id = req.params.id; // accept UUID string
    try {
        const result = await pool.query('SELECT * FROM demandes WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Demande not found' });
        return res.json(result.rows[0]);
    } catch (err) {
        console.error('Erreur lors de la récupération de la demande :', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Patch partial update by id (update per field)
app.patch('/api/demandes/:id', async (req, res) => {
    const id = req.params.id; // accept UUID

    const allowed = [
        // english
        'fault_id','fault_type','comment','request_date','inspection_date','intervention_date',
        'availability_date','estimate_price','report','estimate_validated','request_closed','client_id'
    ];

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

// --- webhook ---
app.post("/webhook", (req, res) => {
    const signature = req.headers["x-signature"];
    const payload = JSON.stringify(req.body);

    console.log("📩 Webhook reçu :", payload);
    console.log("🔐 Signature :", signature);

    res.status(200).send({ message: "Event received" });
});


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

app.listen(port, async () => {
    console.log(`✅ Backend running on port ${port}`);
    console.log(`📄 Documentation API disponible sur http://localhost:${port}/api-docs`);

    // Connexion au webhook
    setTimeout(async () => {
        console.log('⏳ Tentative de connexion au webhook...');
        await subscribeToWebhook();
    }, 10000);

});
