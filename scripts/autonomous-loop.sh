#!/bin/bash
# autonomous-loop.sh — Run graph-loop every 30 minutes for 48 hours.
# Usage: ./scripts/autonomous-loop.sh

# Node 22 is required — Node 26 deadlocks vite module transforms.
export PATH="/opt/homebrew/Cellar/node@22/22.23.2/bin:$PATH"
echo "Node: $(node --version)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$ROOT/test-results/e2e/reports"
PID_FILE="$ROOT/.autonomous-loop.pid"
INTERVAL=1800  # 30 minutes
MAX_DURATION=172800  # 48 hours

mkdir -p "$LOG_DIR"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Autonomous loop already running (PID: $OLD_PID)"
        echo "To stop: kill $OLD_PID"
        exit 1
    fi
    rm "$PID_FILE"
fi

# Save PID for stopping
echo $$ > "$PID_FILE"
echo "Autonomous loop started (PID: $$)"
echo "Interval: ${INTERVAL}s (30 min)"
echo "Max duration: ${MAX_DURATION}s (48h)"
echo "Log dir: $LOG_DIR"
echo ""

cleanup() {
    echo ""
    echo "Autonomous loop stopping..."
    rm -f "$PID_FILE"
    exit 0
}
trap cleanup SIGINT SIGTERM

START_TIME=$(date +%s)
CYCLE_COUNT=0

while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))

    if [ "$ELAPSED" -ge "$MAX_DURATION" ]; then
        echo "Max duration reached (${MAX_DURATION}s). Stopping."
        break
    fi

    CYCLE_COUNT=$((CYCLE_COUNT + 1))
    TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S")
    LOG_FILE="$LOG_DIR/autonomous-cycle-$CYCLE_COUNT-$TIMESTAMP.log"

    echo "═══════════════════════════════════════════════════════"
    echo "CYCLE #$CYCLE_COUNT at $TIMESTAMP"
    echo "Elapsed: ${ELAPSED}s / ${MAX_DURATION}s"
    echo "Log: $LOG_FILE"
    echo "═══════════════════════════════════════════════════════"

    # Start vite dev server (Node 22 required — Node 26 deadlocks vite)
    cd "$ROOT"
    node .opencode/harness/bug-harness/serve-target.mjs --target=dev --port=3000 &>/tmp/vite-autonomous.log &
    VITE_PID=$!

    # Wait for dev server
    for i in $(seq 1 30); do
        if curl -s http://localhost:3000 >/dev/null 2>&1; then
            echo "Dev server ready"
            break
        fi
        sleep 2
    done

    # Run graph-loop
    node .opencode/harness/graph-loop.mjs > "$LOG_FILE" 2>&1
    EXIT_CODE=$?

    # Kill vite
    kill $VITE_PID 2>/dev/null

    echo "Cycle #$CYCLE_COUNT complete (exit: $EXIT_CODE)"
    echo "Log: $LOG_FILE"
    echo ""

    # Sleep until next cycle
    REMAINING=$((MAX_DURATION - ELAPSED))
    if [ "$REMAINING" -lt "$INTERVAL" ]; then
        echo "Less than one interval remaining. Stopping."
        break
    fi

    echo "Sleeping ${INTERVAL}s until next cycle..."
    sleep "$INTERVAL"
done

rm -f "$PID_FILE"
echo "Autonomous loop finished after $CYCLE_COUNT cycles."
