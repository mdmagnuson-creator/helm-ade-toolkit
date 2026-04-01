import { mkdirSync, appendFileSync, readFileSync } from "fs"
import { join } from "path"
import { homedir, cpus } from "os"

const MAX_OUTPUT_LENGTH = 10000
const HISTORY_DIR = join(homedir(), ".tmp", "history")
const DEFAULT_MAX_LOAD_PCT = 82
const LOAD_POLL_INTERVAL_MS = 5000
const LOAD_MAX_WAIT_MS = 300000

/** Commands that agents are not allowed to run. Maps pattern to help message. */
const BLOCKED_COMMANDS = {
  "go test": "Use 'make test' instead.",
}

/**
 * Get the log file path for a session.
 */
function getLogPath(sessionID) {
  const safeID = sessionID.replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(HISTORY_DIR, `${safeID}.log`)
}

/**
 * Ensure the history directory exists.
 */
function ensureHistoryDir() {
  mkdirSync(HISTORY_DIR, { recursive: true })
}

/**
 * Format a command log entry.
 */
function formatCommandEntry(command, workdir, timestamp) {
  const ts = `[${timestamp.toISOString()}]`
  if (workdir) {
    return `${ts} (${workdir}) $ ${command}\n`
  }
  return `${ts} $ ${command}\n`
}

/**
 * Format an output log entry.
 */
function formatOutputEntry(output) {
  if (!output || output.trim() === "") {
    return "(no output)\n\n"
  }
  
  let text = output
  if (text.length > MAX_OUTPUT_LENGTH) {
    text = text.slice(0, MAX_OUTPUT_LENGTH) + "... (truncated)"
  }
  
  return `${text}\n\n`
}

/**
 * Read the 1-minute load average from /proc/loadavg and return it as a
 * percentage of total CPU count. Returns null if the load cannot be read.
 */
function getLoadPercent() {
  try {
    const raw = readFileSync("/proc/loadavg", "utf8")
    const load1m = parseFloat(raw.split(" ")[0])
    const numCPUs = cpus().length
    if (!numCPUs || isNaN(load1m)) return null
    return (load1m / numCPUs) * 100
  } catch {
    return null
  }
}

function getMaxLoadThreshold() {
  const env = process.env.OPENCODE_MAX_LOAD
  if (env) {
    const val = parseFloat(env)
    if (!isNaN(val) && val > 0 && val <= 100) return val
  }
  return DEFAULT_MAX_LOAD_PCT
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Wait until system load drops below the configured threshold.
 * Polls every 5s, gives up after 5 minutes.
 */
async function waitForLoad() {
  const threshold = getMaxLoadThreshold()
  const deadline = Date.now() + LOAD_MAX_WAIT_MS

  let load = getLoadPercent()
  while (load !== null && load > threshold && Date.now() < deadline) {
    await sleep(LOAD_POLL_INTERVAL_MS)
    load = getLoadPercent()
  }
}

/**
 * Shell history logger plugin for OpenCode.
 * Logs bash commands and output to ~/.tmp/history/<sessionID>.log
 */
export default async function shellHistoryPlugin() {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return
      
      const { command } = output.args || {}
      if (command) {
        const blocked = Object.keys(BLOCKED_COMMANDS).find((b) => command.includes(b))
        if (blocked) {
          throw new Error(`Command not allowed: "${blocked}". ${BLOCKED_COMMANDS[blocked]}`)
        }
      }

      await waitForLoad()
      
      try {
        const { sessionID } = input
        const { workdir } = output.args || {}
        
        if (!command || !sessionID) return
        
        ensureHistoryDir()
        const logPath = getLogPath(sessionID)
        const entry = formatCommandEntry(command, workdir, new Date())
        appendFileSync(logPath, entry)
      } catch {
        // Never break bash execution
      }
    },
    
    "tool.execute.after": async (input, output) => {
      try {
        if (input.tool !== "bash") return
        
        const { sessionID } = input
        if (!sessionID) return
        
        ensureHistoryDir()
        const logPath = getLogPath(sessionID)
        const entry = formatOutputEntry(output.output)
        appendFileSync(logPath, entry)
      } catch {
        // Never break bash execution
      }
    }
  }
}
