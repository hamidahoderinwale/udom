#!/bin/bash
# Startup script for uDOM Figma Plugin development

echo "Starting uDOM Development Servers..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if a port is in use
check_port() {
    lsof -ti:$1 >/dev/null 2>&1
    return $?
}

# Check if ports are already in use
if check_port 3000; then
    echo -e "${RED}WARNING: Port 3000 is already in use (udom-server)${NC}"
    echo "   Please stop the existing process or use a different port"
else
    echo -e "${BLUE}Starting uDOM Server on port 3000...${NC}"
    cd ../udom-server && npm start &
    UDOM_PID=$!
    echo -e "${GREEN}uDOM Server started (PID: $UDOM_PID)${NC}"
fi

sleep 2

if check_port 8080; then
    echo -e "${RED}WARNING: Port 8080 is already in use (mcp-server)${NC}"
    echo "   Please stop the existing process or use a different port"
else
    echo -e "${BLUE}Starting MCP Server on port 8080...${NC}"
    cd ../mcp-server && npm start &
    MCP_PID=$!
    echo -e "${GREEN}MCP Server started (PID: $MCP_PID)${NC}"
fi

echo ""
echo "========================================"
echo "All servers are running"
echo "========================================"
echo ""
echo "uDOM Server:  http://localhost:3000"
echo "MCP Server:   ws://localhost:8080"
echo ""
echo "Next steps:"
echo "1. Open Figma Desktop"
echo "2. Go to Plugins > Development > Import plugin from manifest..."
echo "3. Select the figma-plugin folder"
echo "4. Run the plugin from Plugins > Development > uDOM Capture"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for interrupt
trap "echo ''; echo 'Stopping servers...'; kill $UDOM_PID $MCP_PID 2>/dev/null; exit" INT TERM

wait
