// src/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';

dotenv.config();
const { Pool } = pkg;

const PORT = Number(process.env.PORT || 3001);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'devuser',
  password: process.env.DB_PASSWORD || 'wagonpass',
  database: process.env.DB_NAME || 'db_wagonlits',
});

// Helpers
function xmlEscape(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUUID(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

const app = express();
app.use(cors());
app.use(express.json()); // même si nos endpoints renvoient XML, on garde pour d'éventuels webhooks JSON

// ---------------- Swagger ----------------
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Wagonlits',
      version: '1.3.0',
      description:
        "Documentation de l'API Wagonlits (gestion des demandes). Les endpoints /api/demandes parlent XML (GET liste, GET par id, POST, DELETE).",
    },
    servers: [{ url: `http://localhost:${PORT}`, description: 'Dév local' }],
    components: {
      schemas: {
        DemandeXML: {
          type: 'object',
          xml: { name: 'demande' },
          properties: {
            id: { type: 'string', description: 'UUID' },
            code: { type: 'string', nullable: true },
            state: { type: 'integer' },
            createdat: { type: 'string', format: 'date' },
            type: { type: 'string', nullable: true },
            comment: { type: 'string', nullable: true },
            inspection: { type: 'object' },
            rapport: { type: 'object' },
            devis: { type: 'array' },
            interventions: { type: 'array' },
          },
        },
        ErrorXML: {
          type: 'object',
          xml: { name: 'error' },
          properties: { message: { type: 'string' } },
        },
      },
    },
  },
  apis: ['./src/server.js'],
};
const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ---------------- Routes ----------------

// Health
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: OK
 */
app.get('/health', (_req, res) => res.status(200).send({ ok: true }));

/**
 * @swagger
 * /api/demandes:
 *   get:
 *     summary: Liste paginée des demandes en XML (avec inspection, rapport, devis, interventions)
 *     tags: [Demandes]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, minimum: 1, maximum: 200 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0, minimum: 0 }
 *       - in: query
 *         name: order
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *         description: Tri sur createdAt
 *     responses:
 *       200:
 *         description: OK (XML)
 *         content:
 *           application/xml:
 *             schema: { type: string }
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 */
app.get('/api/demandes', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10), 1), 200);
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10), 0);
    const order = (req.query.order ?? 'desc').toString().toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Total
    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS total FROM demandes`);
    const total = countRows[0]?.total ?? 0;

    // Page de demandes
    const { rows: demandes } = await pool.query(
      `
      SELECT
        d.id,
        d.code,
        d.state,
        to_char(d.createdAt, 'YYYY-MM-DD') AS createdat,
        d.type,
        d.comment
      FROM demandes d
      ORDER BY d.createdAt ${order}, d.id
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    if (demandes.length === 0) {
      const xmlEmpty =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<demandes>` +
        `<pagination><total>${total}</total><limit>${limit}</limit><offset>${offset}</offset><order>${order.toLowerCase()}</order></pagination>` +
        `<items></items>` +
        `</demandes>`;
      return res.status(200).type('application/xml').send(xmlEmpty);
    }

    const ids = demandes.map((d) => d.id);

    // Lier les tables
    const { rows: inspections } = await pool.query(
      `
      SELECT ins.id, to_char(ins.inspectedAt,'YYYY-MM-DD') AS inspectedat,
             ins.defectiveComponent, ins.comment, ins.demande_id
      FROM inspection ins
      WHERE ins.demande_id = ANY($1::uuid[])
      `,
      [ids]
    );
    const { rows: rapports } = await pool.query(
      `
      SELECT rap.id, rap.endIntervention, rap.comment, rap.demande_id
      FROM rapport rap
      WHERE rap.demande_id = ANY($1::uuid[])
      `,
      [ids]
    );
    const { rows: devis } = await pool.query(
      `
      SELECT dv.id, dv.priceComponent, dv.priceHour, dv.estimatedTime::text AS estimatedtime, dv.demande_id
      FROM devis dv
      WHERE dv.demande_id = ANY($1::uuid[])
      ORDER BY dv.id
      `,
      [ids]
    );
    const { rows: interventions } = await pool.query(
      `
      SELECT it.id, to_char(it.interventionDate,'YYYY-MM-DD') AS interventiondate,
             it.localisation, it.realTime::text AS realtime, it.comment, it.demande_id
      FROM intervention it
      WHERE it.demande_id = ANY($1::uuid[])
      ORDER BY it.id
      `,
      [ids]
    );

    const mapOne = (rows, key = 'demande_id') =>
      rows.reduce((acc, r) => acc.set(r[key], r), new Map());
    const mapMany = (rows, key = 'demande_id') =>
      rows.reduce((acc, r) => {
        const k = r[key];
        if (!acc.has(k)) acc.set(k, []);
        acc.get(k).push(r);
        return acc;
      }, new Map());

    const inspByDem = mapOne(inspections);
    const rapByDem = mapOne(rapports);
    const devisByDem = mapMany(devis);
    const interByDem = mapMany(interventions);

    const itemsXml = demandes
      .map((d) => {
        const ins = inspByDem.get(d.id);
        const rap = rapByDem.get(d.id);
        const dv = devisByDem.get(d.id) ?? [];
        const it = interByDem.get(d.id) ?? [];

        const inspectionXml = ins
          ? `<inspection>` +
            `<id>${xmlEscape(ins.id)}</id>` +
            `<inspectedat>${xmlEscape(ins.inspectedat)}</inspectedat>` +
            `<defectivecomponent>${xmlEscape(ins.defectivecomponent ?? '')}</defectivecomponent>` +
            `<comment>${xmlEscape(ins.comment ?? '')}</comment>` +
            `</inspection>`
          : '';

        const rapportXml = rap
          ? `<rapport>` +
            `<id>${xmlEscape(rap.id)}</id>` +
            `<endintervention>${xmlEscape(rap.endintervention)}</endintervention>` +
            `<comment>${xmlEscape(rap.comment ?? '')}</comment>` +
            `</rapport>`
          : '';

        const devisXml =
          `<devis>` +
          dv
            .map(
              (x) =>
                `<item>` +
                `<id>${xmlEscape(x.id)}</id>` +
                `<pricecomponent>${xmlEscape(x.pricecomponent)}</pricecomponent>` +
                `<pricehour>${xmlEscape(x.pricehour)}</pricehour>` +
                `<estimatedtime>${xmlEscape(x.estimatedtime)}</estimatedtime>` +
                `</item>`
            )
            .join('') +
          `</devis>`;

        const interventionsXml =
          `<interventions>` +
          it
            .map(
              (x) =>
                `<item>` +
                `<id>${xmlEscape(x.id)}</id>` +
                `<interventiondate>${xmlEscape(x.interventiondate)}</interventiondate>` +
                `<localisation>${xmlEscape(x.localisation ?? '')}</localisation>` +
                `<realtime>${xmlEscape(x.realtime ?? '')}</realtime>` +
                `<comment>${xmlEscape(x.comment ?? '')}</comment>` +
                `</item>`
            )
            .join('') +
          `</interventions>`;

        return (
          `<demande>` +
          `<id>${xmlEscape(d.id)}</id>` +
          `<code>${xmlEscape(d.code ?? '')}</code>` +
          `<state>${xmlEscape(d.state)}</state>` +
          `<createdat>${xmlEscape(d.createdat)}</createdat>` +
          `<type>${xmlEscape(d.type ?? '')}</type>` +
          `<comment>${xmlEscape(d.comment ?? '')}</comment>` +
          inspectionXml +
          rapportXml +
          devisXml +
          interventionsXml +
          `</demande>`
        );
      })
      .join('');

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<demandes>` +
      `<pagination><total>${total}</total><limit>${limit}</limit><offset>${offset}</offset><order>${order.toLowerCase()}</order></pagination>` +
      `<items>${itemsXml}</items>` +
      `</demandes>`;

    res.status(200).type('application/xml').send(xml);
  } catch (err) {
    console.error('GET /api/demandes error:', err);
    res
      .status(500)
      .type('application/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to list demandes</error>`);
  }
});

/**
 * @swagger
 * /api/demandes/{id}:
 *   get:
 *     summary: Récupère une demande par id (XML) avec tables liées
 *     tags: [Demandes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: OK (XML)
 *         content:
 *           application/xml:
 *             schema: { type: string }
 *       400:
 *         description: Invalid id
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 *       404:
 *         description: Not found
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 */
app.get('/api/demandes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) {
      return res
        .status(400)
        .type('application/xml')
        .send(`<?xml version="1.0" encoding="UTF-8"?><error>Invalid id</error>`);
    }

    // Demande
    const { rows: dRows } = await pool.query(
      `
      SELECT id, code, state, to_char(createdAt,'YYYY-MM-DD') AS createdat, type, comment
      FROM demandes
      WHERE id = $1
      `,
      [id]
    );
    if (dRows.length === 0) {
      return res
        .status(404)
        .type('application/xml')
        .send(`<?xml version="1.0" encoding="UTF-8"?><error>Demande not found</error>`);
    }
    const d = dRows[0];

    // Liés (0..1)
    const { rows: insRows } = await pool.query(
      `SELECT id, to_char(inspectedAt,'YYYY-MM-DD') AS inspectedat, defectiveComponent, comment
       FROM inspection WHERE demande_id = $1`,
      [id]
    );
    const { rows: rapRows } = await pool.query(
      `SELECT id, endIntervention, comment
       FROM rapport WHERE demande_id = $1`,
      [id]
    );

    // Liés (0..n)
    const { rows: devisRows } = await pool.query(
      `SELECT id, priceComponent, priceHour, estimatedTime::text AS estimatedtime
       FROM devis WHERE demande_id = $1 ORDER BY id`,
      [id]
    );
    const { rows: interRows } = await pool.query(
      `SELECT id, to_char(interventionDate,'YYYY-MM-DD') AS interventiondate, localisation, realTime::text AS realtime, comment
       FROM intervention WHERE demande_id = $1 ORDER BY id`,
      [id]
    );

    const inspectionXml = insRows[0]
      ? `<inspection>` +
        `<id>${xmlEscape(insRows[0].id)}</id>` +
        `<inspectedat>${xmlEscape(insRows[0].inspectedat)}</inspectedat>` +
        `<defectivecomponent>${xmlEscape(insRows[0].defectivecomponent ?? '')}</defectivecomponent>` +
        `<comment>${xmlEscape(insRows[0].comment ?? '')}</comment>` +
        `</inspection>`
      : '';

    const rapportXml = rapRows[0]
      ? `<rapport>` +
        `<id>${xmlEscape(rapRows[0].id)}</id>` +
        `<endintervention>${xmlEscape(rapRows[0].endintervention)}</endintervention>` +
        `<comment>${xmlEscape(rapRows[0].comment ?? '')}</comment>` +
        `</rapport>`
      : '';

    const devisXml =
      `<devis>` +
      devisRows
        .map(
          (x) =>
            `<item>` +
            `<id>${xmlEscape(x.id)}</id>` +
            `<pricecomponent>${xmlEscape(x.pricecomponent)}</pricecomponent>` +
            `<pricehour>${xmlEscape(x.pricehour)}</pricehour>` +
            `<estimatedtime>${xmlEscape(x.estimatedtime)}</estimatedtime>` +
            `</item>`
        )
        .join('') +
      `</devis>`;

    const interventionsXml =
      `<interventions>` +
      interRows
        .map(
          (x) =>
            `<item>` +
            `<id>${xmlEscape(x.id)}</id>` +
            `<interventiondate>${xmlEscape(x.interventiondate)}</interventiondate>` +
            `<localisation>${xmlEscape(x.localisation ?? '')}</localisation>` +
            `<realtime>${xmlEscape(x.realtime ?? '')}</realtime>` +
            `<comment>${xmlEscape(x.comment ?? '')}</comment>` +
            `</item>`
        )
        .join('') +
      `</interventions>`;

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<demande>` +
      `<id>${xmlEscape(d.id)}</id>` +
      `<code>${xmlEscape(d.code ?? '')}</code>` +
      `<state>${xmlEscape(d.state)}</state>` +
      `<createdat>${xmlEscape(d.createdat)}</createdat>` +
      `<type>${xmlEscape(d.type ?? '')}</type>` +
      `<comment>${xmlEscape(d.comment ?? '')}</comment>` +
      inspectionXml +
      rapportXml +
      devisXml +
      interventionsXml +
      `</demande>`;

    res.status(200).type('application/xml').send(xml);
  } catch (err) {
    console.error('GET /api/demandes/:id error:', err);
    res
      .status(500)
      .type('application/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to fetch demande</error>`);
  }
});

/**
 * @swagger
 * /api/demandes:
 *   post:
 *     summary: Crée une nouvelle demande (XML only)
 *     description: |
 *       Reçoit du **XML** avec éventuellement `<type>`, `<comment>` et `<code>`.
 *
 *       Valeurs appliquées côté API :
 *       - `state = 0`
 *       - `createdat = CURRENT_DATE`
 *
 *       Les champs `code`, `type`, `comment` non fournis ou vides sont enregistrés à `NULL`.
 *     tags: [Demandes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/xml:
 *           schema:
 *             type: string
 *           example: |
 *             <demande>
 *               <type>Inspection</type>
 *               <comment>Test XML</comment>
 *               <code>REQ-0001</code>
 *             </demande>
 *     responses:
 *       201:
 *         description: Demande créée (XML)
 *         content:
 *           application/xml:
 *             schema: { type: string }
 *       415:
 *         description: Mauvais Content-Type
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 */
app.post(
  '/api/demandes',
  express.text({ type: 'application/xml' }),
  async (req, res) => {
    if (!req.is('application/xml')) {
      return res
        .status(415)
        .type('application/xml')
        .send(`<?xml version="1.0" encoding="UTF-8"?><error>Unsupported Media Type: use application/xml</error>`);
    }

    const client = await pool.connect();
    try {
      const xml = req.body || '';

      const getTag = (name) => {
        const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'));
        return m ? m[1].trim() : undefined;
      };
      const nn = (v) => (v === undefined || v === '' ? null : v);
      const isUUIDLocal = (v) => isUUID(v);

      const idVal = getTag('id'); // id optionnel
      const typeVal = getTag('type');
      const commentVal = getTag('comment');
      const codeVal = getTag('code');

      if (idVal && !isUUIDLocal(idVal)) {
        return res
          .status(400)
          .type('application/xml')
          .send(`<?xml version="1.0" encoding="UTF-8"?><error>Invalid UUID for &lt;id&gt;</error>`);
      }

      await client.query('BEGIN');

      // Insert DEMANDE (state=0, createdat=CURRENT_DATE)
      let d;
      if (idVal) {
        const { rows } = await client.query(
          `
          INSERT INTO demandes (id, code, state, createdat, type, comment)
          VALUES ($1, $2, 0, CURRENT_DATE, $3, $4)
          RETURNING id, code, state, to_char(createdat, 'YYYY-MM-DD') AS createdat, type, comment
        `,
          [idVal, nn(codeVal), nn(typeVal), nn(commentVal)]
        );
        d = rows[0];
      } else {
        const { rows } = await client.query(
          `
          INSERT INTO demandes (code, state, createdat, type, comment)
          VALUES ($1, 0, CURRENT_DATE, $2, $3)
          RETURNING id, code, state, to_char(createdat, 'YYYY-MM-DD') AS createdat, type, comment
        `,
          [nn(codeVal), nn(typeVal), nn(commentVal)]
        );
        d = rows[0];
      }

      await client.query('COMMIT');

      return res
        .status(201)
        .type('application/xml')
        .send(
          `<?xml version="1.0" encoding="UTF-8"?>` +
            `<demande>` +
            `<id>${xmlEscape(d.id)}</id>` +
            `<code>${xmlEscape(d.code ?? '')}</code>` +
            `<state>${xmlEscape(d.state)}</state>` +
            `<createdat>${xmlEscape(d.createdat)}</createdat>` +
            `<type>${xmlEscape(d.type ?? '')}</type>` +
            `<comment>${xmlEscape(d.comment ?? '')}</comment>` +
            `</demande>`
        );
    } catch (err) {
      if (err && err.code === '23505') {
        try { await client.query('ROLLBACK'); } catch {}
        return res
          .status(409)
          .type('application/xml')
          .send(`<?xml version="1.0" encoding="UTF-8"?><error>Conflict: id already exists</error>`);
      }
      console.error('POST /api/demandes (XML) error:', err);
      try { await client.query('ROLLBACK'); } catch {}
      return res
        .status(500)
        .type('application/xml')
        .send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to create demande</error>`);
    } finally {
      client.release();
    }
  }
);

/**
 * @swagger
 * /api/demandes/{id}:
 *   delete:
 *     summary: Supprime une demande (cascade via FK) et renvoie XML de confirmation
 *     tags: [Demandes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Supprimé (XML)
 *         content:
 *           application/xml:
 *             schema: { type: string }
 *             example: |
 *               <deleted><id>3e3f8b44-2f1e-4d7c-9e3b-2f6a9e9e2b1a</id></deleted>
 *       400:
 *         description: Invalid id
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 *       404:
 *         description: Not found
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 */
app.delete('/api/demandes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) {
      return res
        .status(400)
        .type('application/xml')
        .send(`<?xml version="1.0" encoding="UTF-8"?><error>Invalid id</error>`);
    }

    const { rowCount } = await pool.query(`DELETE FROM demandes WHERE id = $1`, [id]);

    if (rowCount === 0) {
      return res
        .status(404)
        .type('application/xml')
        .send(`<?xml version="1.0" encoding="UTF-8"?><error>Demande not found</error>`);
    }

    // ON DELETE CASCADE sur les tables liées supprimera automatiquement les enfants
    return res
      .status(200)
      .type('application/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?><deleted><id>${xmlEscape(id)}</id></deleted>`);
  } catch (err) {
    console.error('DELETE /api/demandes/:id error:', err);
    res
      .status(500)
      .type('application/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to delete demande</error>`);
  }
});

// --- webhook (exemple simple, JSON)
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-signature'];
  const payload = JSON.stringify(req.body);
  console.log('📩 Webhook reçu :', payload);
  console.log('🔐 Signature :', signature);
  res.status(200).send({ message: 'Event received' });
});

async function subscribeToWebhook() {
  const subscribeUrl = process.env.WEBHOOK_SUBSCRIBE_URL;
  const callbackUrl = process.env.CALLBACK_URL || `http://localhost:${PORT}/webhook`;

  if (!subscribeUrl) {
    console.warn('⚠️ WEBHOOK_SUBSCRIBE_URL is not defined — skipping webhook subscription');
    return;
  }

  try {
    const who = process.env.WEBHOOK_WHO || 'erp-wagonlits';
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

app.listen(PORT, () => {
  console.log(`✅ back-wagonlits on http://0.0.0.0:${PORT}`);
  console.log(`📄 Swagger UI on http://localhost:${PORT}/api-docs`);

  // Connexion au webhook (optionnel)
  setTimeout(async () => {
    console.log('⏳ Tentative de connexion au webhook...');
    await subscribeToWebhook();
  }, 10000);
});
