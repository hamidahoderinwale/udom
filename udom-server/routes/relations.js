const express = require('express');
const router = express.Router();

function createRelationRoutes(db) {
  // POST endpoint for storing relations
  router.post('/', (req, res) => {
    const relation = req.body;

    if (!relation.type || !relation.from_snapshot || !relation.to_snapshot) {
      return res.status(400).json({ error: 'Invalid relation format: type, from_snapshot, and to_snapshot required' });
    }

    const relation_id = relation.relation_id || `rel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    db.run(
      'INSERT INTO relations (relation_id, type, from_snapshot, to_snapshot, properties) VALUES (?, ?, ?, ?, ?)',
      [
        relation_id,
        relation.type,
        relation.from_snapshot,
        relation.to_snapshot,
        JSON.stringify(relation.properties || {}),
      ],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ 
          success: true, 
          relation_id: relation_id,
          id: this.lastID 
        });
      }
    );
  });

  // GET endpoint for querying relations
  router.get('/', (req, res) => {
    const { type, from_snapshot, to_snapshot } = req.query;

    let query = 'SELECT * FROM relations WHERE 1=1';
    const params = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (from_snapshot) {
      query += ' AND from_snapshot = ?';
      params.push(from_snapshot);
    }

    if (to_snapshot) {
      query += ' AND to_snapshot = ?';
      params.push(to_snapshot);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    db.all(query, params, (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows.map(r => ({
        relation_id: r.relation_id,
        type: r.type,
        from_snapshot: r.from_snapshot,
        to_snapshot: r.to_snapshot,
        properties: r.properties ? JSON.parse(r.properties) : {},
        created_at: r.created_at,
      })));
    });
  });

  return router;
}

module.exports = createRelationRoutes;

