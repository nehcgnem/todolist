#!/usr/bin/env bash
set -e

# Install dependencies if needed
if [ ! -d "backend/node_modules" ]; then
  echo "Installing backend dependencies..."
  (cd backend && npm install)
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  (cd frontend && npm install)
fi

# Start both servers
echo "Starting backend on http://localhost:3001 ..."
echo "Starting frontend on http://localhost:5173 ..."
echo "Press Ctrl+C to stop both."
echo ""

(cd backend && npm run dev) &
BACKEND_PID=$!

(cd frontend && npm run dev) &
FRONTEND_PID=$!

# Trap Ctrl+C to kill both processes
trap 'echo ""; echo "Shutting down..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' INT TERM

wait
