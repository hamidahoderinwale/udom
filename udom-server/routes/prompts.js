const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

function createPromptRoutes() {
  const promptsDir = path.join(__dirname, '..', '..', 'rl', 'data', 'prompts');

  // GET endpoint for prompts
  router.get('/:name', (req, res) => {
    const { name } = req.params;
    const { version } = req.query;
    
    const filename = version ? `${name}-${version}.json` : `${name}.json`;
    const filePath = path.join(promptsDir, filename);
    
    if (!fs.existsSync(filePath) && !version) {
      const files = fs.readdirSync(promptsDir).filter(f => f.startsWith(`${name}-`) && f.endsWith('.json'));
      if (files.length > 0) {
        files.sort().reverse();
        const latestFile = path.join(promptsDir, files[0]);
        return res.sendFile(latestFile);
      }
    }
    
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: `Prompt ${name} not found` });
    }
  });

  // POST endpoint for storing/updating prompts
  router.post('/', (req, res) => {
    const promptData = req.body;
    
    if (!promptData.name) {
      return res.status(400).json({ error: 'Prompt name is required' });
    }
    
    const filename = promptData.version 
      ? `${promptData.name}-${promptData.version}.json`
      : `${promptData.name}.json`;
    const filePath = path.join(promptsDir, filename);
    
    if (!fs.existsSync(promptsDir)) {
      fs.mkdirSync(promptsDir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(promptData, null, 2), 'utf8');
    
    res.json({ success: true, prompt: promptData });
  });

  // GET endpoint for listing all prompts
  router.get('/', (req, res) => {
    if (!fs.existsSync(promptsDir)) {
      return res.json([]);
    }
    
    const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.json'));
    const prompts = files.map(file => {
      const filePath = path.join(promptsDir, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        name: content.name,
        version: content.version,
        component_type: content.component_type,
        role: content.role,
      };
    });
    
    res.json(prompts);
  });

  return router;
}

module.exports = createPromptRoutes;

