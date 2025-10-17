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
function getTag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].trim() : undefined;
}
function getAll(xml, tag) {
  return Array.from(xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi'))).map(m => m[1]);
}
const nn = (v) => (v === undefined || v === '' ? null : v);
const toBool = (v) => /^true$/i.test(String(v || '').trim());

const app = express();
app.use(cors());
app.use(express.json()); // on garde pour le webhook JSON, les endpoints métier parlent XML

// ---------------- Swagger ----------------
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Wagonlits',
      version: '1.5.0',
      description:
        "Gestion des demandes en **XML** : GET liste, GET par id, POST, PUT, DELETE. Les réponses sont en `application/xml`. Le POST/PUT attend aussi du XML.",
    },
    servers: [{ url: `http://localhost:${PORT}`, description: 'Dév local' }],
    components: {
      schemas: {
        // Schémas indicatifs (les réponses sont construites en XML manuel)
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
        DemandesXML: {
          type: 'object',
          xml: { name: 'demandes' },
          properties: {
            pagination: { type: 'object' },
            items: { type: 'array', items: { $ref: '#/components/schemas/DemandeXML' } },
          },
        },
        CreateOrUpdateDemandeXML: {
          type: 'object',
          xml: { name: 'demande' },
          properties: {
            code: { type: 'string', nullable: true },
            state: { type: 'integer', nullable: true },
            type: { type: 'string', nullable: true },
            comment: { type: 'string', nullable: true },
            inspection: {
              type: 'object',
              properties: {
                _delete: { type: 'boolean', nullable: true },
                inspectedat: { type: 'string', format: 'date', nullable: true },
                defectivecomponent: { type: 'string', nullable: true },
                comment: { type: 'string', nullable: true },
              },
            },
            rapport: {
              type: 'object',
              properties: {
                _delete: { type: 'boolean', nullable: true },
                endintervention: { type: 'boolean', nullable: true },
                comment: { type: 'string', nullable: true },
              },
            },
            devis: {
              type: 'object',
              properties: {
                item: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid', nullable: true },
                      _delete: { type: 'boolean', nullable: true },
                      pricecomponent: { type: 'number', nullable: true },
                      pricehour: { type: 'number', nullable: true },
                      estimatedtime: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
            interventions: {
              type: 'object',
              properties: {
                item: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid', nullable: true },
                      _delete: { type: 'boolean', nullable: true },
                      interventiondate: { type: 'string', format: 'date', nullable: true },
                      localisation: { type: 'string', nullable: true },
                      realtime: { type: 'string', nullable: true },
                      comment: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
        ErrorXML: {
          type: 'object',
          xml: { name: 'error' },
          properties: { message: { type: 'string' } },
        },
        DeletedXML: {
          type: 'object',
          xml: { name: 'deleted' },
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
  },
  apis: ['./src/server.js'],
};
const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ---------------- Routes ----------------

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200: { description: OK }
 */
app.get('/health', (_req, res) => res.status(200).send({ ok: true }));

/**
 * @swagger
 * /api/demandes:
 *   get:
 *     summary: Liste paginée des demandes (XML) avec inspection, rapport, devis, interventions
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
 *         description: Tri sur createdat
 *     responses:
 *       200:
 *         description: OK (XML)
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/DemandesXML' }
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

    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS total FROM demandes`);
    const total = countRows[0]?.total ?? 0;

    const { rows: demandes } = await pool.query(
      `
      SELECT d.id, d.code, d.state,
             to_char(d.createdAt,'YYYY-MM-DD') AS createdat,
             d.type, d.comment
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

    const ids = demandes.map(d => d.id);

    const { rows: inspections } = await pool.query(
      `SELECT ins.id, to_char(ins.inspectedAt,'YYYY-MM-DD') AS inspectedat,
              ins.defectiveComponent, ins.comment, ins.demande_id
       FROM inspection ins WHERE ins.demande_id = ANY($1::uuid[])`, [ids]
    );
    const { rows: rapports } = await pool.query(
      `SELECT rap.id, rap.endIntervention, rap.comment, rap.demande_id
       FROM rapport rap WHERE rap.demande_id = ANY($1::uuid[])`, [ids]
    );
    const { rows: devis } = await pool.query(
      `SELECT dv.id, dv.priceComponent, dv.priceHour,
              dv.estimatedTime::text AS estimatedtime, dv.demande_id
       FROM devis dv WHERE dv.demande_id = ANY($1::uuid[]) ORDER BY dv.id`, [ids]
    );
    const { rows: interventions } = await pool.query(
      `SELECT it.id, to_char(it.interventionDate,'YYYY-MM-DD') AS interventiondate,
              it.localisation, it.realTime::text AS realtime, it.comment, it.demande_id
       FROM intervention it WHERE it.demande_id = ANY($1::uuid[]) ORDER BY it.id`, [ids]
    );

    const mapOne = (rows, key = 'demande_id') => rows.reduce((m, r) => m.set(r[key], r), new Map());
    const mapMany = (rows, key = 'demande_id') =>
      rows.reduce((m, r) => { (m.get(r[key]) ?? m.set(r[key], []).get(r[key])).push(r); return m; }, new Map());

    const inspBy = mapOne(inspections);
    const rapBy = mapOne(rapports);
    const devisBy = mapMany(devis);
    const interBy = mapMany(interventions);

    const itemsXml = demandes.map(d => {
      const ins = inspBy.get(d.id);
      const rap = rapBy.get(d.id);
      const dv = devisBy.get(d.id) ?? [];
      const it = interBy.get(d.id) ?? [];

      const inspectionXml = ins ? (
        `<inspection>` +
          `<id>${xmlEscape(ins.id)}</id>` +
          `<inspectedat>${xmlEscape(ins.inspectedat)}</inspectedat>` +
          `<defectivecomponent>${xmlEscape(ins.defectivecomponent ?? '')}</defectivecomponent>` +
          `<comment>${xmlEscape(ins.comment ?? '')}</comment>` +
        `</inspection>`
      ) : '';

      const rapportXml = rap ? (
        `<rapport>` +
          `<id>${xmlEscape(rap.id)}</id>` +
          `<endintervention>${xmlEscape(rap.endintervention)}</endintervention>` +
          `<comment>${xmlEscape(rap.comment ?? '')}</comment>` +
        `</rapport>`
      ) : '';

      const devisXml =
        `<devis>` + dv.map(x =>
          `<item>` +
            `<id>${xmlEscape(x.id)}</id>` +
            `<pricecomponent>${xmlEscape(x.pricecomponent)}</pricecomponent>` +
            `<pricehour>${xmlEscape(x.pricehour)}</pricehour>` +
            `<estimatedtime>${xmlEscape(x.estimatedtime)}</estimatedtime>` +
          `</item>`
        ).join('') + `</devis>`;

      const interventionsXml =
        `<interventions>` + it.map(x =>
          `<item>` +
            `<id>${xmlEscape(x.id)}</id>` +
            `<interventiondate>${xmlEscape(x.interventiondate)}</interventiondate>` +
            `<localisation>${xmlEscape(x.localisation ?? '')}</localisation>` +
            `<realtime>${xmlEscape(x.realtime ?? '')}</realtime>` +
            `<comment>${xmlEscape(x.comment ?? '')}</comment>` +
          `</item>`
        ).join('') + `</interventions>`;

      return (
        `<demande>` +
          `<id>${xmlEscape(d.id)}</id>` +
          `<code>${xmlEscape(d.code ?? '')}</code>` +
          `<state>${xmlEscape(d.state)}</state>` +
          `<createdat>${xmlEscape(d.createdat)}</createdat>` +
          `<type>${xmlEscape(d.type ?? '')}</type>` +
          `<comment>${xmlEscape(d.comment ?? '')}</comment>` +
          inspectionXml + rapportXml + devisXml + interventionsXml +
        `</demande>`
      );
    }).join('');

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<demandes>` +
      `<pagination><total>${total}</total><limit>${limit}</limit><offset>${offset}</offset><order>${order.toLowerCase()}</order></pagination>` +
      `<items>${itemsXml}</items>` +
      `</demandes>`;

    res.status(200).type('application/xml').send(xml);
  } catch (err) {
    console.error('GET /api/demandes error:', err);
    res.status(500).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to list demandes</error>`);
  }
});

/**
 * @swagger
 * /api/demandes/{id}:
 *   get:
 *     summary: Récupère une demande (XML) avec toutes ses données liées
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
 *             schema: { $ref: '#/components/schemas/DemandeXML' }
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
      return res.status(400).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Invalid id</error>`);
    }
    const { rows: dRows } = await pool.query(
      `SELECT id, code, state, to_char(createdAt,'YYYY-MM-DD') AS createdat, type, comment FROM demandes WHERE id = $1`, [id]
    );
    if (dRows.length === 0) {
      return res.status(404).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Demande not found</error>`);
    }
    const d = dRows[0];

    const { rows: insRows } = await pool.query(
      `SELECT id, to_char(inspectedAt,'YYYY-MM-DD') AS inspectedat, defectiveComponent, comment FROM inspection WHERE demande_id = $1`, [id]
    );
    const { rows: rapRows } = await pool.query(
      `SELECT id, endIntervention, comment FROM rapport WHERE demande_id = $1`, [id]
    );
    const { rows: devisRows } = await pool.query(
      `SELECT id, priceComponent, priceHour, estimatedTime::text AS estimatedtime FROM devis WHERE demande_id = $1 ORDER BY id`, [id]
    );
    const { rows: interRows } = await pool.query(
      `SELECT id, to_char(interventionDate,'YYYY-MM-DD') AS interventiondate, localisation, realTime::text AS realtime, comment FROM intervention WHERE demande_id = $1 ORDER BY id`, [id]
    );

    const inspectionXml = insRows[0] ? (
      `<inspection>` +
        `<id>${xmlEscape(insRows[0].id)}</id>` +
        `<inspectedat>${xmlEscape(insRows[0].inspectedat)}</inspectedat>` +
        `<defectivecomponent>${xmlEscape(insRows[0].defectivecomponent ?? '')}</defectivecomponent>` +
        `<comment>${xmlEscape(insRows[0].comment ?? '')}</comment>` +
      `</inspection>`
    ) : '';

    const rapportXml = rapRows[0] ? (
      `<rapport>` +
        `<id>${xmlEscape(rapRows[0].id)}</id>` +
        `<endintervention>${xmlEscape(rapRows[0].endintervention)}</endintervention>` +
        `<comment>${xmlEscape(rapRows[0].comment ?? '')}</comment>` +
      `</rapport>`
    ) : '';

    const devisXml =
      `<devis>` + devisRows.map(x =>
        `<item>` +
          `<id>${xmlEscape(x.id)}</id>` +
          `<pricecomponent>${xmlEscape(x.pricecomponent)}</pricecomponent>` +
          `<pricehour>${xmlEscape(x.pricehour)}</pricehour>` +
          `<estimatedtime>${xmlEscape(x.estimatedtime)}</estimatedtime>` +
        `</item>`
      ).join('') + `</devis>`;

    const interventionsXml =
      `<interventions>` + interRows.map(x =>
        `<item>` +
          `<id>${xmlEscape(x.id)}</id>` +
          `<interventiondate>${xmlEscape(x.interventiondate)}</interventiondate>` +
          `<localisation>${xmlEscape(x.localisation ?? '')}</localisation>` +
          `<realtime>${xmlEscape(x.realtime ?? '')}</realtime>` +
          `<comment>${xmlEscape(x.comment ?? '')}</comment>` +
        `</item>`
      ).join('') + `</interventions>`;

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<demande>` +
        `<id>${xmlEscape(d.id)}</id>` +
        `<code>${xmlEscape(d.code ?? '')}</code>` +
        `<state>${xmlEscape(d.state)}</state>` +
        `<createdat>${xmlEscape(d.createdat)}</createdat>` +
        `<type>${xmlEscape(d.type ?? '')}</type>` +
        `<comment>${xmlEscape(d.comment ?? '')}</comment>` +
        inspectionXml + rapportXml + devisXml + interventionsXml +
      `</demande>`;

    res.status(200).type('application/xml').send(xml);
  } catch (err) {
    console.error('GET /api/demandes/:id error:', err);
    res.status(500).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to fetch demande</error>`);
  }
});

/**
 * @swagger
 * /api/demandes:
 *   post:
 *     summary: Crée une nouvelle demande (XML only)
 *     tags: [Demandes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/xml:
 *           schema: { $ref: '#/components/schemas/CreateOrUpdateDemandeXML' }
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
 *             schema: { $ref: '#/components/schemas/DemandeXML' }
 *       415:
 *         description: Mauvais Content-Type
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 *       409:
 *         description: Conflit (id déjà existant)
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/ErrorXML' }
 */
app.post('/api/demandes', express.text({ type: 'application/xml' }), async (req, res) => {
  if (!req.is('application/xml')) {
    return res.status(415).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Unsupported Media Type: use application/xml</error>`);
  }
  const client = await pool.connect();
  try {
    const xml = req.body || '';
    const idVal = getTag(xml, 'id');
    const typeVal = getTag(xml, 'type');
    const commentVal = getTag(xml, 'comment');
    const codeVal = getTag(xml, 'code');
    if (idVal && !isUUID(idVal)) {
      return res.status(400).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Invalid UUID for &lt;id&gt;</error>`);
    }
    await client.query('BEGIN');
    let d;
    if (idVal) {
      const { rows } = await client.query(
        `INSERT INTO demandes (id, code, state, createdat, type, comment)
         VALUES ($1, $2, 0, CURRENT_DATE, $3, $4)
         RETURNING id, code, state, to_char(createdat,'YYYY-MM-DD') AS createdat, type, comment`,
        [idVal, nn(codeVal), nn(typeVal), nn(commentVal)]
      );
      d = rows[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO demandes (code, state, createdat, type, comment)
         VALUES ($1, 0, CURRENT_DATE, $2, $3)
         RETURNING id, code, state, to_char(createdat,'YYYY-MM-DD') AS createdat, type, comment`,
        [nn(codeVal), nn(typeVal), nn(commentVal)]
      );
      d = rows[0];
    }
    await client.query('COMMIT');
    return res.status(201).type('application/xml').send(
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
      return res.status(409).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Conflict: id already exists</error>`);
    }
    console.error('POST /api/demandes (XML) error:', err);
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to create demande</error>`);
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /api/demandes/{id}:
 *   put:
 *     summary: Met à jour une demande et toutes ses tables liées (XML)
 *     tags: [Demandes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/xml:
 *           schema: { $ref: '#/components/schemas/CreateOrUpdateDemandeXML' }
 *           example: |
 *             <demande>
 *               <code>REQ-1001</code>
 *               <state>2</state>
 *               <type>Inspection</type>
 *               <comment>MàJ complète</comment>
 *               <inspection>
 *                 <inspectedat>2025-10-18</inspectedat>
 *                 <defectivecomponent>Door latch</defectivecomponent>
 *                 <comment>Contrôle OK</comment>
 *               </inspection>
 *               <rapport>
 *                 <endintervention>true</endintervention>
 *                 <comment>Intervention clôturée</comment>
 *               </rapport>
 *               <devis>
 *                 <item>
 *                   <pricecomponent>150.00</pricecomponent>
 *                   <pricehour>85.00</pricehour>
 *                   <estimatedtime>2 hours 30 minutes</estimatedtime>
 *                 </item>
 *               </devis>
 *               <interventions>
 *                 <item>
 *                   <interventiondate>2025-10-19</interventiondate>
 *                   <localisation>Atelier A</localisation>
 *                   <realtime>1 hour 45 minutes</realtime>
 *                   <comment>Remplacement effectué</comment>
 *                 </item>
 *               </interventions>
 *             </demande>
 *     responses:
 *       200:
 *         description: Demande mise à jour (XML)
 *         content:
 *           application/xml:
 *             schema: { $ref: '#/components/schemas/DemandeXML' }
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
app.put('/api/demandes/:id', express.text({ type: 'application/xml' }), async (req, res) => {
  const { id } = req.params;
  if (!isUUID(id)) {
    return res.status(400).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Invalid id</error>`);
  }
  if (!req.is('application/xml')) {
    return res.status(415).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Unsupported Media Type: use application/xml</error>`);
  }

  const client = await pool.connect();
  try {
    const xml = req.body || '';

    const { rowCount: exists } = await client.query(`SELECT 1 FROM demandes WHERE id = $1`, [id]);
    if (exists === 0) {
      return res.status(404).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Demande not found</error>`);
    }

    await client.query('BEGIN');

    // Demande
    const codeVal = getTag(xml, 'code');
    const stateVal = getTag(xml, 'state');
    const typeVal = getTag(xml, 'type');
    const commentVal = getTag(xml, 'comment');

    const sets = [];
    const vals = [];
    let idx = 1;
    if (codeVal !== undefined) { sets.push(`code = $${idx++}`); vals.push(nn(codeVal)); }
    if (stateVal !== undefined) { sets.push(`state = $${idx++}`); vals.push(Number.isFinite(Number(stateVal)) ? Number(stateVal) : 0); }
    if (typeVal !== undefined) { sets.push(`type = $${idx++}`); vals.push(nn(typeVal)); }
    if (commentVal !== undefined) { sets.push(`comment = $${idx++}`); vals.push(nn(commentVal)); }
    if (sets.length > 0) {
      vals.push(id);
      await client.query(`UPDATE demandes SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    }

    // Inspection (0..1)
    const inspectionXml = getTag(xml, 'inspection');
    if (inspectionXml !== undefined) {
      const del = getTag(inspectionXml, '_delete');
      if (toBool(del)) {
        await client.query(`DELETE FROM inspection WHERE demande_id = $1`, [id]);
      } else {
        const inspectedAt = getTag(inspectionXml, 'inspectedat');
        const defectiveComponent = getTag(inspectionXml, 'defectivecomponent');
        const commentI = getTag(inspectionXml, 'comment');

        const { rowCount: has } = await client.query(`SELECT 1 FROM inspection WHERE demande_id = $1`, [id]);
        if (has > 0) {
          const s2 = []; const v2 = []; let j = 1;
          if (inspectedAt !== undefined) { s2.push(`inspectedAt = $${j++}`); v2.push(nn(inspectedAt)); }
          if (defectiveComponent !== undefined) { s2.push(`defectiveComponent = $${j++}`); v2.push(nn(defectiveComponent)); }
          if (commentI !== undefined) { s2.push(`comment = $${j++}`); v2.push(nn(commentI)); }
          if (s2.length > 0) {
            v2.push(id);
            await client.query(`UPDATE inspection SET ${s2.join(', ')} WHERE demande_id = $${j}`, v2);
          }
        } else {
          await client.query(
            `INSERT INTO inspection (inspectedAt, defectiveComponent, comment, demande_id)
             VALUES ($1, $2, $3, $4)`,
            [nn(inspectedAt), nn(defectiveComponent), nn(commentI), id]
          );
        }
      }
    }

    // Rapport (0..1)
    const rapportXml = getTag(xml, 'rapport');
    if (rapportXml !== undefined) {
      const del = getTag(rapportXml, '_delete');
      if (toBool(del)) {
        await client.query(`DELETE FROM rapport WHERE demande_id = $1`, [id]);
      } else {
        const endIntervention = getTag(rapportXml, 'endintervention');
        const commentR = getTag(rapportXml, 'comment');

        const { rowCount: has } = await client.query(`SELECT 1 FROM rapport WHERE demande_id = $1`, [id]);
        if (has > 0) {
          const s2 = []; const v2 = []; let j = 1;
          if (endIntervention !== undefined) { s2.push(`endIntervention = $${j++}`); v2.push(toBool(endIntervention)); }
          if (commentR !== undefined) { s2.push(`comment = $${j++}`); v2.push(nn(commentR)); }
          if (s2.length > 0) {
            v2.push(id);
            await client.query(`UPDATE rapport SET ${s2.join(', ')} WHERE demande_id = $${j}`, v2);
          }
        } else {
          await client.query(
            `INSERT INTO rapport (endIntervention, comment, demande_id)
             VALUES ($1, $2, $3)`,
            [endIntervention !== undefined ? toBool(endIntervention) : null, nn(commentR), id]
          );
        }
      }
    }

    // Devis (0..n)
    const devisSection = getTag(xml, 'devis');
    if (devisSection !== undefined) {
      const items = getAll(devisSection, 'item');
      for (const item of items) {
        const dvId = getTag(item, 'id');
        const del = getTag(item, '_delete');
        const priceComponent = getTag(item, 'pricecomponent');
        const priceHour = getTag(item, 'pricehour');
        const estimatedTime = getTag(item, 'estimatedtime');

        if (dvId && isUUID(dvId)) {
          if (toBool(del)) {
            await client.query(`DELETE FROM devis WHERE id = $1 AND demande_id = $2`, [dvId, id]);
          } else {
            const s = []; const v = []; let k = 1;
            if (priceComponent !== undefined) { s.push(`priceComponent = $${k++}`); v.push(priceComponent !== null ? Number(priceComponent) : null); }
            if (priceHour !== undefined) { s.push(`priceHour = $${k++}`); v.push(priceHour !== null ? Number(priceHour) : null); }
            if (estimatedTime !== undefined) { s.push(`estimatedTime = $${k++}`); v.push(nn(estimatedTime)); }
            if (s.length > 0) {
              v.push(dvId, id);
              await client.query(`UPDATE devis SET ${s.join(', ')} WHERE id = $${k++} AND demande_id = $${k}`, v);
            }
          }
        } else {
          if (!toBool(del)) {
            await client.query(
              `INSERT INTO devis (priceComponent, priceHour, estimatedTime, demande_id)
               VALUES ($1, $2, $3, $4)`,
              [
                priceComponent !== undefined ? Number(priceComponent) : null,
                priceHour !== undefined ? Number(priceHour) : null,
                nn(estimatedTime),
                id,
              ]
            );
          }
        }
      }
    }

    // Interventions (0..n)
    const interventionsSection = getTag(xml, 'interventions');
    if (interventionsSection !== undefined) {
      const items = getAll(interventionsSection, 'item');
      for (const item of items) {
        const itId = getTag(item, 'id');
        const del = getTag(item, '_delete');
        const interventionDate = getTag(item, 'interventiondate');
        const localisation = getTag(item, 'localisation');
        const realTime = getTag(item, 'realtime');
        const commentI = getTag(item, 'comment');

        if (itId && isUUID(itId)) {
          if (toBool(del)) {
            await client.query(`DELETE FROM intervention WHERE id = $1 AND demande_id = $2`, [itId, id]);
          } else {
            const s = []; const v = []; let k = 1;
            if (interventionDate !== undefined) { s.push(`interventionDate = $${k++}`); v.push(nn(interventionDate)); }
            if (localisation !== undefined) { s.push(`localisation = $${k++}`); v.push(nn(localisation)); }
            if (realTime !== undefined) { s.push(`realTime = $${k++}`); v.push(nn(realTime)); }
            if (commentI !== undefined) { s.push(`comment = $${k++}`); v.push(nn(commentI)); }
            if (s.length > 0) {
              v.push(itId, id);
              await client.query(`UPDATE intervention SET ${s.join(', ')} WHERE id = $${k++} AND demande_id = $${k}`, v);
            }
          }
        } else {
          if (!toBool(del)) {
            await client.query(
              `INSERT INTO intervention (interventionDate, localisation, realTime, comment, demande_id)
               VALUES ($1, $2, $3, $4, $5)`,
              [nn(interventionDate), nn(localisation), nn(realTime), nn(commentI), id]
            );
          }
        }
      }
    }

    await client.query('COMMIT');

    // Réponse identique au GET by id
    const { rows: one } = await pool.query(
      `SELECT id, code, state, to_char(createdAt,'YYYY-MM-DD') AS createdat, type, comment FROM demandes WHERE id = $1`, [id]
    );
    const d = one[0];
    const { rows: insRows } = await pool.query(
      `SELECT id, to_char(inspectedAt,'YYYY-MM-DD') AS inspectedat, defectiveComponent, comment FROM inspection WHERE demande_id = $1`, [id]
    );
    const { rows: rapRows } = await pool.query(
      `SELECT id, endIntervention, comment FROM rapport WHERE demande_id = $1`, [id]
    );
    const { rows: devisRows } = await pool.query(
      `SELECT id, priceComponent, priceHour, estimatedTime::text AS estimatedtime FROM devis WHERE demande_id = $1 ORDER BY id`, [id]
    );
    const { rows: interRows } = await pool.query(
      `SELECT id, to_char(interventionDate,'YYYY-MM-DD') AS interventiondate, localisation, realTime::text AS realtime, comment FROM intervention WHERE demande_id = $1 ORDER BY id`, [id]
    );

    const inspectionXml2 = insRows[0] ? (
      `<inspection>` +
        `<id>${xmlEscape(insRows[0].id)}</id>` +
        `<inspectedat>${xmlEscape(insRows[0].inspectedat)}</inspectedat>` +
        `<defectivecomponent>${xmlEscape(insRows[0].defectivecomponent ?? '')}</defectivecomponent>` +
        `<comment>${xmlEscape(insRows[0].comment ?? '')}</comment>` +
      `</inspection>`
    ) : '';

    const rapportXml2 = rapRows[0] ? (
      `<rapport>` +
        `<id>${xmlEscape(rapRows[0].id)}</id>` +
        `<endintervention>${xmlEscape(rapRows[0].endintervention)}</endintervention>` +
        `<comment>${xmlEscape(rapRows[0].comment ?? '')}</comment>` +
      `</rapport>`
    ) : '';

    const devisXml2 =
      `<devis>` + devisRows.map(x =>
        `<item>` +
          `<id>${xmlEscape(x.id)}</id>` +
          `<pricecomponent>${xmlEscape(x.pricecomponent)}</pricecomponent>` +
          `<pricehour>${xmlEscape(x.pricehour)}</pricehour>` +
          `<estimatedtime>${xmlEscape(x.estimatedtime)}</estimatedtime>` +
        `</item>`
      ).join('') + `</devis>`;

    const interventionsXml2 =
      `<interventions>` + interRows.map(x =>
        `<item>` +
          `<id>${xmlEscape(x.id)}</id>` +
          `<interventiondate>${xmlEscape(x.interventiondate)}</interventiondate>` +
          `<localisation>${xmlEscape(x.localisation ?? '')}</localisation>` +
          `<realtime>${xmlEscape(x.realtime ?? '')}</realtime>` +
          `<comment>${xmlEscape(x.comment ?? '')}</comment>` +
        `</item>`
      ).join('') + `</interventions>`;

    const xmlOut =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<demande>` +
        `<id>${xmlEscape(d.id)}</id>` +
        `<code>${xmlEscape(d.code ?? '')}</code>` +
        `<state>${xmlEscape(d.state)}</state>` +
        `<createdat>${xmlEscape(d.createdat)}</createdat>` +
        `<type>${xmlEscape(d.type ?? '')}</type>` +
        `<comment>${xmlEscape(d.comment ?? '')}</comment>` +
        inspectionXml2 + rapportXml2 + devisXml2 + interventionsXml2 +
      `</demande>`;

    return res.status(200).type('application/xml').send(xmlOut);
  } catch (err) {
    console.error('PUT /api/demandes/:id error:', err);
    try { await client.query('ROLLBACK'); } catch {}
    return res.status(500).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to update demande</error>`);
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /api/demandes/{id}:
 *   delete:
 *     summary: Supprime une demande (cascade via FK) et renvoie un XML de confirmation
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
 *             schema: { $ref: '#/components/schemas/DeletedXML' }
 *             example: "<deleted><id>3e3f8b44-2f1e-4d7c-9e3b-2f6a9e9e2b1a</id></deleted>"
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
      return res.status(400).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Invalid id</error>`);
    }
    const { rowCount } = await pool.query(`DELETE FROM demandes WHERE id = $1`, [id]);
    if (rowCount === 0) {
      return res.status(404).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Demande not found</error>`);
    }
    return res.status(200).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><deleted><id>${xmlEscape(id)}</id></deleted>`);
  } catch (err) {
    console.error('DELETE /api/demandes/:id error:', err);
    res.status(500).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><error>Failed to delete demande</error>`);
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
  setTimeout(async () => {
    console.log('⏳ Tentative de connexion au webhook...');
    await subscribeToWebhook();
  }, 10000);
});
