const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`MCP Server running on ws://localhost:${PORT}`);

wss.on('connection', (ws, req) => {
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle procedure event notifications
      if (message.method === 'notifications/procedure_event') {
        // Broadcast to all connected clients (agents)
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      }
    } catch (error) {
      // Silently handle parse errors
    }
  });

  ws.on('error', (error) => {
    // Silently handle WebSocket errors
  });
});


