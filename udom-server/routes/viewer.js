const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

function createViewerRoutes() {
  // Root workspace path
  const rootPath = path.resolve(__dirname, '..', '..');

  // Favicon route (prevents 404 errors)
  router.get('/favicon.ico', (req, res) => {
    res.status(204).end();
  });

  // Serve design system CSS
  router.get('/design-system.css', (req, res) => {
    const cssPath = path.join(rootPath, 'design-system.css');
    res.setHeader('Content-Type', 'text/css');
    
    if (fs.existsSync(cssPath)) {
      res.sendFile(cssPath, (err) => {
        if (err) {
          res.status(500).setHeader('Content-Type', 'text/css').send('/* Error loading design system CSS */');
        }
      });
    } else {
      res.send('/* Design system CSS - styles are inline in viewer.html */');
    }
  });

  // Serve RL docs static files
  router.get('/rl/docs/styles.css', (req, res) => {
    const cssPath = path.join(rootPath, 'rl', 'docs', 'styles.css');
    res.setHeader('Content-Type', 'text/css');
    if (fs.existsSync(cssPath)) {
      res.sendFile(cssPath);
    } else {
      res.status(404).send('/* Not found */');
    }
  });

  router.get('/rl/docs/script.js', (req, res) => {
    const jsPath = path.join(rootPath, 'rl', 'docs', 'script.js');
    res.setHeader('Content-Type', 'application/javascript');
    if (fs.existsSync(jsPath)) {
      res.sendFile(jsPath);
    } else {
      res.status(404).send('// Not found');
    }
  });

  // Serve main documentation assets (CSS and JS)
  router.get('/assets/css/styles.css', (req, res) => {
    const cssPath = path.join(rootPath, 'assets', 'css', 'styles.css');
    res.setHeader('Content-Type', 'text/css');
    if (fs.existsSync(cssPath)) {
      res.sendFile(cssPath);
    } else {
      res.status(404).send('/* Not found */');
    }
  });

  router.get('/assets/js/script.js', (req, res) => {
    const jsPath = path.join(rootPath, 'assets', 'js', 'script.js');
    res.setHeader('Content-Type', 'application/javascript');
    if (fs.existsSync(jsPath)) {
      res.sendFile(jsPath);
    } else {
      res.status(404).send('// Not found');
    }
  });

  // Serve main documentation page (root index.html)
  router.get('/docs', (req, res) => {
    const htmlPath = path.join(rootPath, 'index.html');
    res.setHeader('Content-Type', 'text/html');
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send('<h1>Documentation not found</h1>');
    }
  });

  // Also serve at root for convenience
  router.get('/', (req, res) => {
    const htmlPath = path.join(rootPath, 'index.html');
    res.setHeader('Content-Type', 'text/html');
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send('<h1>Documentation not found</h1>');
    }
  });

  // Serve RL docs index
  router.get('/rl/docs', (req, res) => {
    res.redirect('/rl/docs/index.html');
  });

  router.get('/rl/docs/index.html', (req, res) => {
    const htmlPath = path.join(rootPath, 'rl', 'docs', 'index.html');
    res.setHeader('Content-Type', 'text/html');
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send('<h1>Documentation not found</h1>');
    }
  });

  // Serve RL docs constitution
  router.get('/rl/docs/constitution.html', (req, res) => {
    const htmlPath = path.join(rootPath, 'rl', 'docs', 'constitution.html');
    res.setHeader('Content-Type', 'text/html');
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(404).send('<h1>Documentation not found</h1>');
    }
  });

  // Viewer page
  router.get('/viewer', (req, res) => {
    res.setHeader('Content-Security-Policy', 
      "default-src 'self' http://localhost:* ws://localhost:* https://fonts.googleapis.com https://fonts.gstatic.com https://fonts.vercel.sh data: blob:; " +
      "img-src 'self' http://localhost:* data: blob:; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; " +
      "style-src 'self' 'unsafe-inline' http://localhost:* https://fonts.googleapis.com https://fonts.vercel.sh; " +
      "style-src-elem 'self' 'unsafe-inline' http://localhost:* https://fonts.vercel.sh; " +
      "font-src 'self' data: http://localhost:* https://fonts.gstatic.com https://fonts.vercel.sh; " +
      "connect-src 'self' http://localhost:* ws://localhost:* https://fonts.googleapis.com https://fonts.vercel.sh;"
    );
    res.sendFile(path.join(__dirname, '..', 'viewer.html'));
  });

  return router;
}

module.exports = createViewerRoutes;

