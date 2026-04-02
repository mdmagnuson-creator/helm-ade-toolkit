import { createClient } from "@supabase/supabase-js";
import { tool } from "@opencode-ai/plugin";

const z = tool.schema;

// Read environment variables at module load
const HELM_SUPABASE_URL = process.env.HELM_SUPABASE_URL;
const HELM_SUPABASE_ANON_KEY = process.env.HELM_SUPABASE_ANON_KEY;
const HELM_SUPABASE_ACCESS_TOKEN = process.env.HELM_SUPABASE_ACCESS_TOKEN;
const HELM_SESSION_ID = process.env.HELM_SESSION_ID;
const HELM_DEVICE_ID = process.env.HELM_DEVICE_ID;
const HELM_ORG_ID = process.env.HELM_ORG_ID;

// TSK-012: Extract user ID from Supabase JWT access token
function getUserIdFromToken() {
  if (!HELM_SUPABASE_ACCESS_TOKEN) return null;
  try {
    const payload = HELM_SUPABASE_ACCESS_TOKEN.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    return decoded.sub || null; // sub claim is the user UUID
  } catch (e) {
    console.warn('[helm-bridge] Failed to decode access token:', e.message);
    return null;
  }
}

// Plugin state for task context injection
const pluginState = {
  sessionTasks: null,
  sessionTaskRoles: {},
  lastFetchTime: 0,
  currentSessionId: null,
  heartbeatInterval: null, // US-029: Activity pulse heartbeat
};

// Stale threshold for re-fetching task context (60 seconds)
const TASK_CONTEXT_STALE_THRESHOLD = 60000;

// ========================================
// Activity Log Capture (US-028)
// ========================================

// Helper: Log activity to a single task (best-effort, non-blocking)
async function logTaskActivity(taskId, activityType, metadata = {}) {
  if (!supabase) return;
  try {
    const sessionId = pluginState.currentSessionId || process.env.HELM_SESSION_ID;
    await supabase.from("task_activity").insert({
      task_id: taskId,
      actor_id: null, // system event
      activity_type: activityType,
      metadata: {
        ...metadata,
        session_id: sessionId,
        automated: true,
        trigger: "plugin_hook",
      },
    });
  } catch (err) {
    console.error(`[helm-bridge] Failed to log activity for task ${taskId}:`, err.message);
  }
}

// Helper: Log activity to ALL linked tasks
async function logToAllTasks(activityType, metadata = {}) {
  if (!pluginState.sessionTasks?.length) return;
  for (const task of pluginState.sessionTasks) {
    await logTaskActivity(task.id, activityType, metadata);
  }
}

// File change tracker: batches file modifications into periodic summaries
const fileChangeTracker = {
  changes: new Map(), // dir -> { count, types: Set }
  lastFlush: Date.now(),
  FLUSH_INTERVAL: 30000, // 30 seconds — batch file changes

  track(filePath, changeType) {
    const dir = filePath.split("/").slice(0, -1).join("/") || "/";
    if (!this.changes.has(dir)) {
      this.changes.set(dir, { count: 0, types: new Set() });
    }
    const entry = this.changes.get(dir);
    entry.count++;
    entry.types.add(changeType);
  },

  async flush() {
    if (this.changes.size === 0) return;

    const summary = [];
    const directories = {};
    let totalFiles = 0;

    for (const [dir, info] of this.changes) {
      summary.push(`${info.count} file(s) in ${dir}`);
      directories[dir] = { count: info.count, types: Array.from(info.types) };
      totalFiles += info.count;
    }

    if (summary.length > 0) {
      await logToAllTasks("files_modified", {
        display_message: `Modified ${summary.join(", ")}`,
        directories,
        total_files: totalFiles,
      });
    }

    this.changes.clear();
    this.lastFlush = Date.now();
  },
};

// Create Supabase client if credentials are available
let supabase = null;

if (HELM_SUPABASE_URL && HELM_SUPABASE_ANON_KEY) {
  supabase = createClient(HELM_SUPABASE_URL, HELM_SUPABASE_ANON_KEY, {
    global: {
      headers: HELM_SUPABASE_ACCESS_TOKEN
        ? { Authorization: `Bearer ${HELM_SUPABASE_ACCESS_TOKEN}` }
        : {},
    },
  });
  console.log(
    `[helm-bridge] Initialized — Supabase connected, session=${HELM_SESSION_ID || "not set"}, device=${HELM_DEVICE_ID || "not set"}, org=${HELM_ORG_ID || "not set"}, authenticated=${!!HELM_SUPABASE_ACCESS_TOKEN}`
  );
} else {
  console.log(
    "[helm-bridge] WARNING: Missing required env vars: HELM_SUPABASE_URL, HELM_SUPABASE_ANON_KEY — event tools will return errors"
  );
}

// Helper: Look up PRD UUID from text prd_id
async function lookupPrdUuid(prdIdText) {
  const { data, error } = await supabase
    .from("prds")
    .select("id")
    .eq("prd_id", prdIdText)
    .limit(1)
    .single();
  if (error) return { error: `PRD not found: ${prdIdText}` };
  return { uuid: data.id };
}

// Helper: Fetch session tasks and enrich with story/PRD context
async function fetchSessionTasks(sessionId) {
  if (!supabase || !sessionId) return null;

  try {
    // Fetch linked tasks for this session
    const { data: sessionTasks, error: sessionTasksError } = await supabase
      .from("session_tasks")
      .select("task_id")
      .eq("session_id", sessionId);

    if (sessionTasksError || !sessionTasks?.length) {
      return null;
    }

    // Fetch full task details
    const taskIds = sessionTasks.map((st) => st.task_id);
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("*")
      .in("id", taskIds);

    if (tasksError || !tasks?.length) {
      return null;
    }

    // Enrich tasks with story/PRD context and attachments
    for (const task of tasks) {
      if (task.story_id) {
        try {
          const { data: story } = await supabase
            .from("prd_stories")
            .select("*, prds(*)")
            .eq("id", task.story_id)
            .single();

          if (story) {
            task._storyContext = {
              storyTitle: story.title,
              storyDescription: story.description,
              prdTitle: story.prds?.title,
              prdGoals: story.prds?.goals,
            };
          }
        } catch (e) {
          // Ignore story fetch errors
        }
      }

      // Fetch attachments for this task
      try {
        const { data: attachmentsData, error: attachmentsError } = await supabase
          .from("task_attachments")
          .select("id, file_name, content_type, file_size, storage_path, is_image, created_at")
          .eq("task_id", task.id)
          .order("created_at", { ascending: true });

        if (!attachmentsError && attachmentsData?.length) {
          // Generate signed URLs for each attachment (1 hour expiry)
          task._attachments = await Promise.all(
            attachmentsData.map(async (attachment) => {
              let signedUrl = null;
              try {
                const { data: urlData, error: urlError } = await supabase.storage
                  .from("task-attachments")
                  .createSignedUrl(attachment.storage_path, 3600);
                if (!urlError && urlData?.signedUrl) {
                  signedUrl = urlData.signedUrl;
                }
              } catch (e) {
                // Ignore URL generation errors
              }
              return {
                ...attachment,
                signed_url: signedUrl,
              };
            })
          );
        }
      } catch (e) {
        console.error(`[helm-bridge] Failed to fetch attachments for task ${task.id}:`, e.message);
      }
    }

    // Note: role column doesn't exist in session_tasks table
    // Return empty taskRoles for backward compatibility
    const taskRoles = {};

    return { tasks, taskRoles };
  } catch (e) {
    console.error("[helm-bridge] Failed to fetch session tasks:", e.message);
    return null;
  }
}

// Helper: Format task context for system prompt injection
function formatTaskContext(task, sessionMode) {
  let ctx = `### Task: ${task.title}\n`;
  ctx += `- **ID**: ${task.id}\n`;
  ctx += `- **Status**: ${task.status}\n`;
  ctx += `- **Priority**: ${task.priority}\n`;

  if (task.description_markdown) {
    ctx += `- **Description**: ${task.description_markdown}\n`;
  }

  // Mode-specific emphasis
  if (sessionMode === "qa" || sessionMode === "testing") {
    // QA sessions: emphasize testing fields
    if (task.testing_notes) ctx += `\n**Testing Notes:**\n${task.testing_notes}\n`;
  } else if (sessionMode === "planner" || sessionMode === "prdRefine") {
    // Planner sessions: emphasize scoping
    if (task.scope_markdown) ctx += `\n**Scope Notes:**\n${task.scope_markdown}\n`;
    if (task.description_markdown) ctx += `\n**Full Description:**\n${task.description_markdown}\n`;
  } else {
    // Builder/ad-hoc: implementation focus
    if (task.scope_markdown) ctx += `\n**Scope Notes:**\n${task.scope_markdown}\n`;
  }

  // Include story/PRD context if available
  if (task._storyContext) {
    const sc = task._storyContext;
    ctx += `\n**Linked Story:** ${sc.storyTitle || "Unknown"}\n`;
    if (sc.storyDescription) {
      ctx += `- ${sc.storyDescription}\n`;
    }
    if (sc.prdTitle) {
      ctx += `- **Parent PRD:** ${sc.prdTitle}\n`;
    }
    if (sc.prdGoals) {
      ctx += `- **PRD Goals:** ${sc.prdGoals}\n`;
    }
  }

  // Include attachments if available
  if (task._attachments && task._attachments.length > 0) {
    ctx += `\n**Attachments** (${task._attachments.length} file${task._attachments.length > 1 ? "s" : ""}):\n`;
    for (const attachment of task._attachments) {
      const sizeKB = Math.round(attachment.file_size / 1024);
      const sizeStr = sizeKB >= 1024 ? `${Math.round(sizeKB / 1024)} MB` : `${sizeKB} KB`;
      const typeStr = attachment.is_image ? "image" : attachment.content_type?.split("/")[1] || "file";
      ctx += `- ${attachment.file_name} (${sizeStr}, ${typeStr})`;
      if (attachment.signed_url) {
        ctx += ` - [Download](${attachment.signed_url})`;
      }
      ctx += `\n`;
    }
  }

  ctx += "\n";
  return ctx;
}

// Helper: Format services context for system prompt injection
function formatServicesContext() {
  const services = [];
  if (HELM_SUPABASE_URL) services.push("Supabase");
  // Additional services could be read from project config in the future

  if (!services.length) return "";

  return `\n### Project Services\n` + `This project uses: ${services.join(", ")}\n\n`;
}

// Helper: Emit event to helm_events table (best effort, non-blocking)
async function emitEvent(eventType, payload) {
  if (!supabase || !HELM_ORG_ID) return; // Best effort
  try {
    await supabase.from("helm_events").insert({
      session_id: HELM_SESSION_ID || null,
      device_id: HELM_DEVICE_ID || null,
      org_id: HELM_ORG_ID,
      event_type: eventType,
      payload: payload,
    });
  } catch (e) {
    console.error(`[helm-bridge] Failed to emit event ${eventType}:`, e.message);
  }
}

// Helper: Record QA pass (does NOT auto-transition — status changes are manual)
async function handleQAPass(taskId) {
  if (!supabase) return false;

  try {
    await supabase.from("task_activity").insert({
      task_id: taskId,
      actor_id: null,
      activity_type: "test_passed",
      metadata: {
        automated: true,
        trigger: "qa_session",
        note: "QA tests passed — update task status via dropdown",
      },
    });
    console.log(`[helm-bridge] Task ${taskId}: test passed recorded`);
    return true;
  } catch (e) {
    console.error(`[helm-bridge] Error recording QA pass for ${taskId}:`, e.message);
    return false;
  }
}

// Helper: Record QA failure (does NOT auto-transition — status changes are manual)
async function handleQAFail(taskId, reason) {
  if (!supabase) return false;

  try {
    await supabase.from("task_activity").insert({
      task_id: taskId,
      actor_id: null,
      activity_type: "test_failed",
      metadata: {
        automated: true,
        trigger: "qa_session",
        reason: reason || "QA tests failed",
        note: "Update task status via dropdown",
      },
    });
    console.log(`[helm-bridge] Task ${taskId}: test failed recorded`);
    return true;
  } catch (e) {
    console.error(`[helm-bridge] Error recording QA fail for ${taskId}:`, e.message);
    return false;
  }
}

// Zod schemas for reuse
const acceptanceCriteriaSchema = z.array(
  z.object({
    text: z.string(),
    met: z.boolean().optional(),
  })
).optional();

const storySchema = z.object({
  story_id: z.string().describe("Unique identifier (e.g., 'US-001')"),
  title: z.string().describe("Story title"),
  description: z.string().optional().describe("Story description"),
  acceptance_criteria: acceptanceCriteriaSchema.describe("Acceptance criteria array"),
  story_points: z.number().int().optional().describe("Story point estimate"),
  status: z.string().optional().describe("Status (default: pending)"),
  phase: z.number().int().optional().describe("Phase number"),
  sort_order: z.number().int().describe("Sort order"),
});

/**
 * Helm Bridge Plugin - Modern SDK Format
 * Provides tools for agent-to-app communication via Supabase events
 * and PRD management capabilities.
 */
export default async function helmBridgePlugin(ctx) {
  return {
    // Tool definitions
    tool: {
      helm_event: tool({
        description:
          "Emit an event to the Helm ADE native app via Supabase. Events are delivered in real-time to the desktop and iOS apps. Use this for agent-to-app communication.",
        args: {
          type: z.string().describe(
            "Event type identifier (e.g., 'prd.created', 'prd.updated', 'session.status'). Use dot notation for namespacing."
          ),
          payload: z.record(z.string(), z.any()).describe(
            "Event payload data. Structure depends on event type."
          ),
        },
        async execute({ type, payload }) {
          if (!supabase) {
            return JSON.stringify({
              error:
                "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY",
            });
          }

          if (!HELM_ORG_ID) {
            return JSON.stringify({
              error:
                "Helm bridge not configured: missing HELM_ORG_ID environment variable",
            });
          }

          try {
            const { data, error } = await supabase
              .from("helm_events")
              .insert({
                session_id: HELM_SESSION_ID || null,
                device_id: HELM_DEVICE_ID || null,
                org_id: HELM_ORG_ID,
                event_type: type,
                payload: payload,
              })
              .select("id")
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to emit event: ${error.message}` });
            }

            return JSON.stringify({
              success: true,
              eventId: data.id,
              eventType: type,
            });
          } catch (err) {
            return JSON.stringify({ error: `Failed to emit event: ${err.message}` });
          }
        },
      }),

      helm_prd_create: tool({
        description:
          "Create a new PRD (Product Requirements Document) in the Helm system. Use this when starting a new feature or project that needs tracking.",
        args: {
          prd_id: z.string().describe("Unique text identifier for the PRD (e.g., 'prd-user-auth')"),
          title: z.string().describe("Human-readable title for the PRD"),
          status: z.string().optional().describe("PRD status: draft, ready, in_progress, completed, or abandoned. Defaults to 'draft'"),
          content_markdown: z.string().optional().describe("Full PRD content in markdown format"),
          notes: z.string().optional().describe("Additional notes about the PRD"),
          phases: z.number().int().optional().describe("Number of phases in this PRD"),
          estimated_weeks: z.number().int().optional().describe("Estimated weeks to complete"),
          repo_id: z.string().optional().describe("UUID of the associated repository"),
          org_id: z.string().optional().describe("UUID of the organization. Falls back to HELM_ORG_ID env var if not provided"),
        },
        async execute({ prd_id, title, status, content_markdown, notes, phases, estimated_weeks, repo_id, org_id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          const effectiveOrgId = org_id || HELM_ORG_ID;
          if (!effectiveOrgId) {
            return JSON.stringify({ error: "org_id is required: provide it as argument or set HELM_ORG_ID env var" });
          }

          if (!prd_id || !title) {
            return JSON.stringify({ error: "prd_id and title are required" });
          }

          try {
            const insertData = {
              prd_id,
              title,
              status: status || "draft",
              org_id: effectiveOrgId,
            };
            if (content_markdown) insertData.content_markdown = content_markdown;
            if (notes) insertData.notes = notes;
            if (phases) insertData.phases = phases;
            if (estimated_weeks) insertData.estimated_weeks = estimated_weeks;
            if (repo_id) insertData.repo_id = repo_id;

            const { data, error } = await supabase
              .from("prds")
              .insert(insertData)
              .select("id, prd_id")
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to create PRD: ${error.message}` });
            }

            await emitEvent("prd.created", { id: data.id, prd_id: data.prd_id, title });

            return JSON.stringify({ success: true, id: data.id, prd_id: data.prd_id });
          } catch (err) {
            return JSON.stringify({ error: `Failed to create PRD: ${err.message}` });
          }
        },
      }),

      helm_prd_update: tool({
        description:
          "Update an existing PRD. Identify the PRD by either 'id' (UUID) or 'prd_id' (text identifier). Use this to change status, update content, or modify metadata.",
        args: {
          id: z.string().optional().describe("UUID of the PRD to update"),
          prd_id: z.string().optional().describe("Text identifier of the PRD to update (e.g., 'prd-user-auth')"),
          title: z.string().optional().describe("New title"),
          status: z.string().optional().describe("New status: draft, ready, in_progress, completed, or abandoned"),
          content_markdown: z.string().optional().describe("Updated markdown content"),
          notes: z.string().optional().describe("Updated notes"),
          phases: z.number().int().optional().describe("Number of phases"),
          current_story: z.string().optional().describe("Current story being worked on"),
          estimated_weeks: z.number().int().optional().describe("Estimated weeks to complete"),
          stories_completed: z.number().int().optional().describe("Number of stories completed"),
          total_stories: z.number().int().optional().describe("Total number of stories"),
          completed_stories: z.number().int().optional().describe("Count of completed stories"),
          started_at: z.string().optional().describe("ISO timestamp when work started"),
          completed_at: z.string().optional().describe("ISO timestamp when completed"),
        },
        async execute({ id, prd_id, title, status, content_markdown, notes, phases, current_story, estimated_weeks, stories_completed, total_stories, completed_stories, started_at, completed_at }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!id && !prd_id) {
            return JSON.stringify({ error: "Either 'id' (UUID) or 'prd_id' (text) must be provided" });
          }

          try {
            const updateData = { updated_at: new Date().toISOString() };
            if (title !== undefined) updateData.title = title;
            if (status !== undefined) updateData.status = status;
            if (content_markdown !== undefined) updateData.content_markdown = content_markdown;
            if (notes !== undefined) updateData.notes = notes;
            if (phases !== undefined) updateData.phases = phases;
            if (current_story !== undefined) updateData.current_story = current_story;
            if (estimated_weeks !== undefined) updateData.estimated_weeks = estimated_weeks;
            if (stories_completed !== undefined) updateData.stories_completed = stories_completed;
            if (total_stories !== undefined) updateData.total_stories = total_stories;
            if (completed_stories !== undefined) updateData.completed_stories = completed_stories;
            if (started_at !== undefined) updateData.started_at = started_at;
            if (completed_at !== undefined) updateData.completed_at = completed_at;

            let query = supabase.from("prds").update(updateData);
            if (id) {
              query = query.eq("id", id);
            } else {
              query = query.eq("prd_id", prd_id);
            }

            const { data, error } = await query.select().single();

            if (error) {
              return JSON.stringify({ error: `Failed to update PRD: ${error.message}` });
            }

            await emitEvent("prd.updated", { id: data.id, prd_id: data.prd_id, updated_fields: Object.keys(updateData) });

            return JSON.stringify({ success: true, updated: data });
          } catch (err) {
            return JSON.stringify({ error: `Failed to update PRD: ${err.message}` });
          }
        },
      }),

      helm_prd_set_content: tool({
        description:
          "Update only the markdown content of a PRD. Use this for large content updates without changing other metadata.",
        args: {
          id: z.string().optional().describe("UUID of the PRD"),
          prd_id: z.string().optional().describe("Text identifier of the PRD (e.g., 'prd-user-auth')"),
          content_markdown: z.string().describe("New markdown content for the PRD"),
        },
        async execute({ id, prd_id, content_markdown }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!id && !prd_id) {
            return JSON.stringify({ error: "Either 'id' (UUID) or 'prd_id' (text) must be provided" });
          }

          if (!content_markdown) {
            return JSON.stringify({ error: "content_markdown is required" });
          }

          try {
            let query = supabase.from("prds").update({
              content_markdown,
              updated_at: new Date().toISOString(),
            });
            if (id) {
              query = query.eq("id", id);
            } else {
              query = query.eq("prd_id", prd_id);
            }

            const { data, error } = await query.select("id, prd_id").single();

            if (error) {
              return JSON.stringify({ error: `Failed to update PRD content: ${error.message}` });
            }

            await emitEvent("prd.content_updated", { id: data.id, prd_id: data.prd_id });

            return JSON.stringify({ success: true });
          } catch (err) {
            return JSON.stringify({ error: `Failed to update PRD content: ${err.message}` });
          }
        },
      }),

      helm_prd_delete: tool({
        description:
          "Soft-delete a PRD by setting its status to 'abandoned'. The PRD remains in the database for historical purposes.",
        args: {
          id: z.string().optional().describe("UUID of the PRD to delete"),
          prd_id: z.string().optional().describe("Text identifier of the PRD to delete (e.g., 'prd-user-auth')"),
        },
        async execute({ id, prd_id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!id && !prd_id) {
            return JSON.stringify({ error: "Either 'id' (UUID) or 'prd_id' (text) must be provided" });
          }

          try {
            let query = supabase.from("prds").update({
              status: "abandoned",
              updated_at: new Date().toISOString(),
            });
            if (id) {
              query = query.eq("id", id);
            } else {
              query = query.eq("prd_id", prd_id);
            }

            const { data, error } = await query.select("id, prd_id").single();

            if (error) {
              return JSON.stringify({ error: `Failed to delete PRD: ${error.message}` });
            }

            await emitEvent("prd.deleted", { id: data.id, prd_id: data.prd_id });

            return JSON.stringify({ success: true });
          } catch (err) {
            return JSON.stringify({ error: `Failed to delete PRD: ${err.message}` });
          }
        },
      }),

      helm_prd_list: tool({
        description:
          "List PRDs for an organization. Returns metadata only (excludes full content_markdown). Filter by status or repo_id.",
        args: {
          status: z.string().optional().describe("Filter by status: draft, ready, in_progress, completed, or abandoned"),
          repo_id: z.string().optional().describe("Filter by repository UUID"),
          org_id: z.string().optional().describe("Organization UUID. Falls back to HELM_ORG_ID env var"),
        },
        async execute({ status, repo_id, org_id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          const effectiveOrgId = org_id || HELM_ORG_ID;
          if (!effectiveOrgId) {
            return JSON.stringify({ error: "org_id is required: provide it as argument or set HELM_ORG_ID env var" });
          }

          try {
            let query = supabase
              .from("prds")
              .select("id, prd_id, title, status, phases, current_story, estimated_weeks, stories_completed, total_stories, completed_stories, started_at, completed_at, created_at, updated_at, repo_id, notes")
              .eq("org_id", effectiveOrgId)
              .order("created_at", { ascending: false });

            if (status) {
              query = query.eq("status", status);
            }
            if (repo_id) {
              query = query.eq("repo_id", repo_id);
            }

            const { data, error } = await query;

            if (error) {
              return JSON.stringify({ error: `Failed to list PRDs: ${error.message}` });
            }

            return JSON.stringify({ prds: data });
          } catch (err) {
            return JSON.stringify({ error: `Failed to list PRDs: ${err.message}` });
          }
        },
      }),

      helm_prd_get: tool({
        description:
          "Get full details of a PRD including content_markdown and all associated stories. Use this when you need to read or work with a PRD.",
        args: {
          id: z.string().optional().describe("UUID of the PRD"),
          prd_id: z.string().optional().describe("Text identifier of the PRD (e.g., 'prd-user-auth')"),
        },
        async execute({ id, prd_id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!id && !prd_id) {
            return JSON.stringify({ error: "Either 'id' (UUID) or 'prd_id' (text) must be provided" });
          }

          try {
            // Fetch the PRD
            let prdQuery = supabase.from("prds").select("*");
            if (id) {
              prdQuery = prdQuery.eq("id", id);
            } else {
              prdQuery = prdQuery.eq("prd_id", prd_id);
            }

            const { data: prdData, error: prdError } = await prdQuery.single();

            if (prdError) {
              return JSON.stringify({ error: `Failed to get PRD: ${prdError.message}` });
            }

            // Fetch associated stories
            const { data: storiesData, error: storiesError } = await supabase
              .from("prd_stories")
              .select("*")
              .eq("prd_id", prdData.id)
              .order("sort_order", { ascending: true });

            if (storiesError) {
              return JSON.stringify({ error: `Failed to get PRD stories: ${storiesError.message}` });
            }

            return JSON.stringify({ prd: prdData, stories: storiesData });
          } catch (err) {
            return JSON.stringify({ error: `Failed to get PRD: ${err.message}` });
          }
        },
      }),

      helm_prd_stories_get: tool({
        description:
          "Get all stories for a PRD. This is a convenience alias that returns just the stories array.",
        args: {
          id: z.string().optional().describe("UUID of the PRD"),
          prd_id: z.string().optional().describe("Text identifier of the PRD (e.g., 'prd-user-auth')"),
        },
        async execute({ id, prd_id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!id && !prd_id) {
            return JSON.stringify({ error: "Either 'id' (UUID) or 'prd_id' (text) must be provided" });
          }

          try {
            // First get the PRD UUID if we only have prd_id
            let prdUuid = id;
            if (!prdUuid) {
              const prdLookup = await lookupPrdUuid(prd_id);
              if (prdLookup.error) {
                return JSON.stringify({ error: prdLookup.error });
              }
              prdUuid = prdLookup.uuid;
            }

            // Fetch stories
            const { data: storiesData, error: storiesError } = await supabase
              .from("prd_stories")
              .select("*")
              .eq("prd_id", prdUuid)
              .order("sort_order", { ascending: true });

            if (storiesError) {
              return JSON.stringify({ error: `Failed to get PRD stories: ${storiesError.message}` });
            }

            return JSON.stringify({ stories: storiesData });
          } catch (err) {
            return JSON.stringify({ error: `Failed to get PRD stories: ${err.message}` });
          }
        },
      }),

      helm_prd_story_bulk_create: tool({
        description:
          "Create multiple stories for a PRD in a single operation. Efficient for initializing a PRD with all its stories at once.",
        args: {
          prd_id: z.string().describe("Text identifier of the parent PRD (e.g., 'prd-user-auth')"),
          stories: z.array(storySchema).describe("Array of story objects to create"),
        },
        async execute({ prd_id, stories }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!prd_id || !stories || !Array.isArray(stories) || stories.length === 0) {
            return JSON.stringify({ error: "prd_id and non-empty stories array are required" });
          }

          try {
            // Look up the PRD UUID from text prd_id
            const prdLookup = await lookupPrdUuid(prd_id);
            if (prdLookup.error) {
              return JSON.stringify({ error: prdLookup.error });
            }

            // Prepare all stories for insertion
            const insertRows = stories.map((story) => ({
              prd_id: prdLookup.uuid,
              story_id: story.story_id,
              title: story.title,
              description: story.description || null,
              acceptance_criteria: story.acceptance_criteria || null,
              story_points: story.story_points || null,
              status: story.status || "pending",
              phase: story.phase || 1,
              sort_order: story.sort_order,
            }));

            const { data, error } = await supabase
              .from("prd_stories")
              .insert(insertRows)
              .select("id, story_id");

            if (error) {
              return JSON.stringify({ error: `Failed to bulk create stories: ${error.message}` });
            }

            await emitEvent("prd.story.bulk_created", {
              prd_id,
              created_count: data.length,
              story_ids: data.map((s) => s.story_id),
            });

            return JSON.stringify({ success: true, created: data.length, ids: data.map((s) => s.id) });
          } catch (err) {
            return JSON.stringify({ error: `Failed to bulk create stories: ${err.message}` });
          }
        },
      }),

      helm_prd_story_update: tool({
        description:
          "Update an existing story. Identify by 'id' (UUID) or by combination of 'prd_id' + 'story_id'. Use this to update status, notes, or other story metadata.",
        args: {
          id: z.string().optional().describe("UUID of the story to update"),
          prd_id: z.string().optional().describe("Text identifier of the parent PRD (required if using story_id instead of id)"),
          story_id: z.string().optional().describe("Text identifier of the story (e.g., 'US-001'). Requires prd_id."),
          title: z.string().optional().describe("Updated title"),
          description: z.string().optional().describe("Updated description"),
          acceptance_criteria: acceptanceCriteriaSchema.describe("Updated acceptance criteria"),
          story_points: z.number().int().optional().describe("Updated story points"),
          status: z.string().optional().describe("Updated status: pending, in_progress, completed, or skipped"),
          phase: z.number().int().optional().describe("Updated phase number"),
          sort_order: z.number().int().optional().describe("Updated sort order"),
          notes: z.string().optional().describe("Updated notes"),
          started_at: z.string().optional().describe("ISO timestamp when work started"),
          completed_at: z.string().optional().describe("ISO timestamp when completed"),
          session_id: z.string().optional().describe("UUID of the session working on this story"),
        },
        async execute({ id, prd_id, story_id, title, description, acceptance_criteria, story_points, status, phase, sort_order, notes, started_at, completed_at, session_id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!id && !(prd_id && story_id)) {
            return JSON.stringify({ error: "Either 'id' (UUID) or both 'prd_id' and 'story_id' must be provided" });
          }

          try {
            const updateData = { updated_at: new Date().toISOString() };
            if (title !== undefined) updateData.title = title;
            if (description !== undefined) updateData.description = description;
            if (acceptance_criteria !== undefined) updateData.acceptance_criteria = acceptance_criteria;
            if (story_points !== undefined) updateData.story_points = story_points;
            if (status !== undefined) updateData.status = status;
            if (phase !== undefined) updateData.phase = phase;
            if (sort_order !== undefined) updateData.sort_order = sort_order;
            if (notes !== undefined) updateData.notes = notes;
            if (started_at !== undefined) updateData.started_at = started_at;
            if (completed_at !== undefined) updateData.completed_at = completed_at;
            if (session_id !== undefined) updateData.session_id = session_id;

            let query = supabase.from("prd_stories").update(updateData);

            if (id) {
              query = query.eq("id", id);
            } else {
              // Look up PRD UUID first
              const prdLookup = await lookupPrdUuid(prd_id);
              if (prdLookup.error) {
                return JSON.stringify({ error: prdLookup.error });
              }
              query = query.eq("prd_id", prdLookup.uuid).eq("story_id", story_id);
            }

            const { data, error } = await query.select().single();

            if (error) {
              return JSON.stringify({ error: `Failed to update story: ${error.message}` });
            }

            await emitEvent("prd.story.updated", { id: data.id, story_id: data.story_id, updated_fields: Object.keys(updateData) });

            return JSON.stringify({ success: true, updated: data });
          } catch (err) {
            return JSON.stringify({ error: `Failed to update story: ${err.message}` });
          }
        },
      }),

      // ========================================
      // Task Management Tools
      // ========================================

      helm_task_create: tool({
        description:
          "Create a new task in the Helm system. Tasks are work items that can be assigned to users, linked to PRDs and stories, and organized hierarchically with parent tasks.",
        args: {
          title: z.string().describe("Task title"),
          description: z.string().optional().describe("Task description"),
          status: z.enum(["new", "in_progress_development", "ready_for_dev_test", "ready_for_staging_test", "failed_staging_test", "passed_staging_test", "ready_for_end_user_test", "failed_end_user_test", "passed_end_user_test", "ready_for_prod_test", "failed_prod_test", "passed_prod_test", "completed", "canceled"]).optional().describe("Task status (default: 'new')"),
          priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Task priority (default: 'medium')"),
          parent_task_id: z.string().optional().describe("UUID of parent task for subtasks"),
          parent_story_id: z.string().optional().describe("Story ID (e.g., 'US-001') to link this task to"),
          parent_prd_id: z.string().optional().describe("UUID of associated PRD"),
          assignee_ids: z.array(z.string()).optional().describe("Array of user UUIDs to assign the task to"),
          repo_id: z.string().optional().describe("UUID of associated repository"),
          org_id: z.string().optional().describe("Organization UUID. Falls back to HELM_ORG_ID env var"),
        },
        async execute({ title, description, status, priority, parent_task_id, parent_story_id, parent_prd_id, assignee_ids, repo_id, org_id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          const effectiveOrgId = org_id || HELM_ORG_ID;
          if (!effectiveOrgId) {
            return JSON.stringify({ error: "org_id is required: provide it as argument or set HELM_ORG_ID env var" });
          }

          if (!title) {
            return JSON.stringify({ error: "title is required" });
          }

          try {
            const insertData = {
              org_id: effectiveOrgId,
              title,
              status: status || "new",
              priority: priority || "medium",
            };
            if (description) insertData.description_markdown = description;
            if (parent_task_id) insertData.parent_task_id = parent_task_id;
            if (parent_story_id) insertData.story_id = parent_story_id;
            if (parent_prd_id) insertData.prd_id = parent_prd_id;
            // Note: assignee_ids is in task_assignees junction table, not tasks table
            if (repo_id) insertData.repo_id = repo_id;

            const { data, error } = await supabase
              .from("tasks")
              .insert(insertData)
              .select("id, task_id, title")
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to create task: ${error.message}` });
            }

            await emitEvent("task.created", { id: data.id, task_id: data.task_id, title: data.title });

            return JSON.stringify({ success: true, id: data.id, task_id: data.task_id, title: data.title });
          } catch (err) {
            return JSON.stringify({ error: `Failed to create task: ${err.message}` });
          }
        },
      }),

      helm_task_update: tool({
        description:
          "Update an existing task. Use this to change status, reassign, update priority, or modify other task metadata.",
        args: {
          id: z.string().describe("UUID of the task to update"),
          title: z.string().optional().describe("Updated title"),
          description: z.string().optional().describe("Updated description"),
          priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Updated priority"),
          status: z.enum(["new", "in_progress_development", "ready_for_dev_test", "ready_for_staging_test", "failed_staging_test", "passed_staging_test", "ready_for_end_user_test", "failed_end_user_test", "passed_end_user_test", "ready_for_prod_test", "failed_prod_test", "passed_prod_test", "completed", "canceled"]).optional().describe("Updated status"),
          assignee_ids: z.array(z.string()).optional().describe("Updated array of assignee user UUIDs"),
          testing_notes_markdown: z.string().optional().describe("Structured testing notes: what to test, how to verify, edge cases"),
        },
        async execute({ id, title, description, priority, status, assignee_ids, testing_notes_markdown }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!id) {
            return JSON.stringify({ error: "id is required" });
          }

          try {
            const updateData = { updated_at: new Date().toISOString() };
            if (title !== undefined) updateData.title = title;
            if (description !== undefined) updateData.description_markdown = description;
            if (priority !== undefined) updateData.priority = priority;
            // TSK-011: Status updates are disabled — status transitions are managed by human reviewers
            if (status !== undefined) {
              console.warn('[helm-bridge] helm_task_update: status field ignored — agent status updates are disabled');
            }
            if (testing_notes_markdown !== undefined) updateData.testing_notes_markdown = testing_notes_markdown;
            // Note: assignee_ids is in task_assignees junction table, not tasks table

            const { data, error } = await supabase
              .from("tasks")
              .update(updateData)
              .eq("id", id)
              .select()
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to update task: ${error.message}` });
            }

            await emitEvent("task.updated", { id: data.id, updated_fields: Object.keys(updateData) });

            return JSON.stringify({ success: true, updated: data });
          } catch (err) {
            return JSON.stringify({ error: `Failed to update task: ${err.message}` });
          }
        },
      }),

      helm_task_list: tool({
        description:
          "List tasks with optional filters. Returns task metadata for matching tasks. Use filters to narrow results by status, assignee, PRD, or priority.",
        args: {
          repo_id: z.string().optional().describe("Filter by repository UUID"),
          status: z.enum(["new", "in_progress_development", "ready_for_dev_test", "ready_for_staging_test", "failed_staging_test", "passed_staging_test", "ready_for_end_user_test", "failed_end_user_test", "passed_end_user_test", "ready_for_prod_test", "failed_prod_test", "passed_prod_test", "completed", "canceled"]).optional().describe("Filter by status"),
          assignee_ids: z.array(z.string()).optional().describe("Filter by assignee UUIDs (matches tasks with ANY of these assignees)"),
          prd_id: z.string().optional().describe("Filter by PRD UUID"),
          priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Filter by priority"),
          org_id: z.string().optional().describe("Organization UUID. Falls back to HELM_ORG_ID env var"),
        },
        async execute({ repo_id, status, assignee_ids, prd_id, priority, org_id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          const effectiveOrgId = org_id || HELM_ORG_ID;
          if (!effectiveOrgId) {
            return JSON.stringify({ error: "org_id is required: provide it as argument or set HELM_ORG_ID env var" });
          }

          try {
            let query = supabase
              .from("tasks")
              .select("id, title, description_markdown, priority, status, parent_task_id, prd_id, repo_id, created_at, updated_at")
              .eq("org_id", effectiveOrgId)
              .order("created_at", { ascending: false });

            if (repo_id) {
              query = query.eq("repo_id", repo_id);
            }
            if (status) {
              query = query.eq("status", status);
            }
            if (prd_id) {
              query = query.eq("prd_id", prd_id);
            }
            if (priority) {
              query = query.eq("priority", priority);
            }
            // Note: assignee_ids filter not implemented - assignees are in task_assignees junction table

            const { data, error } = await query;

            if (error) {
              return JSON.stringify({ error: `Failed to list tasks: ${error.message}` });
            }

            return JSON.stringify({ tasks: data });
          } catch (err) {
            return JSON.stringify({ error: `Failed to list tasks: ${err.message}` });
          }
        },
      }),

      helm_task_get: tool({
        description:
          "Get full details of a task including comments, activity log, and linked sessions. Use this when you need complete task context.",
        args: {
          id: z.string().describe("UUID of the task to retrieve"),
        },
        async execute({ id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!id) {
            return JSON.stringify({ error: "id is required" });
          }

          try {
            // Fetch the task
            const { data: taskData, error: taskError } = await supabase
              .from("tasks")
              .select("*")
              .eq("id", id)
              .single();

            if (taskError) {
              return JSON.stringify({ error: `Failed to get task: ${taskError.message}` });
            }

            // Fetch comments
            const { data: commentsData, error: commentsError } = await supabase
              .from("task_comments")
              .select("*")
              .eq("task_id", id)
              .order("created_at", { ascending: true });

            if (commentsError) {
              return JSON.stringify({ error: `Failed to get task comments: ${commentsError.message}` });
            }

            // Fetch activity log
            const { data: activityData, error: activityError } = await supabase
              .from("task_activity")
              .select("*")
              .eq("task_id", id)
              .order("created_at", { ascending: false });

            if (activityError) {
              return JSON.stringify({ error: `Failed to get task activity: ${activityError.message}` });
            }

            // Fetch linked sessions via junction table
            const { data: sessionTasksData, error: sessionTasksError } = await supabase
              .from("session_tasks")
              .select("session_id")
              .eq("task_id", id);

            let sessions = [];
            if (!sessionTasksError && sessionTasksData?.length) {
              const sessionIds = sessionTasksData.map((st) => st.session_id);
              const { data: sessionsData, error: sessionsError } = await supabase
                .from("sessions")
                .select("id, status, started_at, ended_at")
                .in("id", sessionIds)
                .order("started_at", { ascending: false });
              sessions = sessionsError ? [] : sessionsData;
            }

            // Fetch attachments from task_attachments table
            const { data: attachmentsData, error: attachmentsError } = await supabase
              .from("task_attachments")
              .select("id, file_name, content_type, file_size, storage_path, is_image, created_at")
              .eq("task_id", id)
              .order("created_at", { ascending: true });

            let attachments = [];
            if (!attachmentsError && attachmentsData?.length) {
              // Generate signed URLs for each attachment (1 hour expiry)
              attachments = await Promise.all(
                attachmentsData.map(async (attachment) => {
                  let signedUrl = null;
                  try {
                    const { data: urlData, error: urlError } = await supabase.storage
                      .from("task-attachments")
                      .createSignedUrl(attachment.storage_path, 3600);
                    if (!urlError && urlData?.signedUrl) {
                      signedUrl = urlData.signedUrl;
                    }
                  } catch (e) {
                    console.error(`[helm-bridge] Failed to generate signed URL for ${attachment.file_name}:`, e.message);
                  }
                  return {
                    ...attachment,
                    signed_url: signedUrl,
                  };
                })
              );
            }

            return JSON.stringify({
              task: taskData,
              comments: commentsData,
              activity: activityData,
              sessions: sessions,
              attachments: attachments,
            });
          } catch (err) {
            return JSON.stringify({ error: `Failed to get task: ${err.message}` });
          }
        },
      }),

      helm_task_add_comment: tool({
        description:
          "Add a comment to a task. Supports threaded replies via parent_comment_id. Comments are attributed to the session user and tagged with the agent source.",
        args: {
          task_id: z.string().describe("UUID of the task to comment on"),
          body: z.string().describe("Comment body text"),
          parent_comment_id: z.string().optional().describe("UUID of parent comment for threaded replies"),
          author_source: z.string().optional().describe("Source of the comment: 'agent:builder', 'agent:planner', etc. Defaults to 'agent:builder'"),
        },
        async execute({ task_id, body, parent_comment_id, author_source }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!task_id || !body) {
            return JSON.stringify({ error: "task_id and body are required" });
          }

          try {
            // TSK-012: Include author attribution
            const resolvedSessionId = HELM_SESSION_ID || null;
            const insertData = {
              task_id,
              body_markdown: body,
              author_id: getUserIdFromToken(), // user who launched the session
              author_source: author_source || 'agent:builder',
              session_id: resolvedSessionId,
            };
            if (parent_comment_id) insertData.parent_comment_id = parent_comment_id;

            const { data, error } = await supabase
              .from("task_comments")
              .insert(insertData)
              .select("id, task_id, created_at")
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to add comment: ${error.message}` });
            }

            await emitEvent("task.comment.added", {
              task_id,
              comment_id: data.id,
              is_reply: !!parent_comment_id,
              author_source: insertData.author_source,
            });

            return JSON.stringify({ success: true, id: data.id, task_id: data.task_id });
          } catch (err) {
            return JSON.stringify({ error: `Failed to add comment: ${err.message}` });
          }
        },
      }),

      helm_task_add_activity: tool({
        description:
          "Add an activity log entry to a task. Use this to record significant events, status changes, or other trackable actions.",
        args: {
          task_id: z.string().describe("UUID of the task"),
          activity_type: z.string().describe("Type of activity (e.g., 'status_change', 'assignment', 'comment', 'linked')"),
          description: z.string().describe("Human-readable description of the activity"),
          metadata: z.record(z.string(), z.any()).optional().describe("Additional structured data about the activity"),
        },
        async execute({ task_id, activity_type, description, metadata }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!task_id || !activity_type || !description) {
            return JSON.stringify({ error: "task_id, activity_type, and description are required" });
          }

          try {
            const insertData = {
              task_id,
              activity_type,
              description,
            };
            if (metadata) insertData.metadata = metadata;

            const { data, error } = await supabase
              .from("task_activity")
              .insert(insertData)
              .select("id, task_id, activity_type, created_at")
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to add activity: ${error.message}` });
            }

            return JSON.stringify({ success: true, id: data.id, activity_type: data.activity_type });
          } catch (err) {
            return JSON.stringify({ error: `Failed to add activity: ${err.message}` });
          }
        },
      }),

      qa_signal: tool({
        description:
          "Signal QA test result for a task (pass or fail). On pass, records test_passed activity (does NOT auto-merge — Helm app handles merge decisions). On fail, transitions task from 'testing' to 'fix_required'.",
        args: {
          task_id: z.string().describe("UUID of the task"),
          result: z.enum(["pass", "fail"]).describe("Test result: 'pass' or 'fail'"),
          reason: z.string().optional().describe("Failure reason (recommended for fail results)"),
        },
        async execute({ task_id, result, reason }) {
          if (!supabase) {
            return JSON.stringify({
              error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY",
            });
          }

          if (!task_id || !result) {
            return JSON.stringify({ error: "task_id and result are required" });
          }

          try {
            if (result === "pass") {
              const recorded = await handleQAPass(task_id);
              return JSON.stringify({
                success: recorded,
                message: recorded ? "Test pass recorded" : "Failed to record test pass",
              });
            } else {
              const transitioned = await handleQAFail(task_id, reason);
              return JSON.stringify({
                success: true,
                message: transitioned
                  ? "Task moved to fix_required"
                  : "Task status unchanged (not in testing state)",
              });
            }
          } catch (err) {
            return JSON.stringify({ error: `Failed to signal QA result: ${err.message}` });
          }
        },
      }),

      // ========================================
      // Session State Tools
      // ========================================

      helm_session_state_save: tool({
        description:
          "Save agent-managed state to the current session's agent_state column. Use this to persist state that should survive across tool calls or be accessible to other agents.",
        args: {
          session_id: z.string().optional().describe("UUID of the session. Falls back to HELM_SESSION_ID env var"),
          state: z.record(z.string(), z.any()).describe("JSON state object to save. Replaces any existing state."),
        },
        async execute({ session_id, state }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          const effectiveSessionId = session_id || HELM_SESSION_ID;
          if (!effectiveSessionId) {
            return JSON.stringify({ error: "session_id is required: provide it as argument or set HELM_SESSION_ID env var" });
          }

          if (!state || typeof state !== "object") {
            return JSON.stringify({ error: "state must be a JSON object" });
          }

          try {
            const { data, error } = await supabase
              .from("sessions")
              .update({
                agent_state: state,
              })
              .eq("id", effectiveSessionId)
              .select("id")
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to save session state: ${error.message}` });
            }

            return JSON.stringify({ success: true, session_id: data.id });
          } catch (err) {
            return JSON.stringify({ error: `Failed to save session state: ${err.message}` });
          }
        },
      }),

      helm_session_state_get: tool({
        description:
          "Retrieve the agent_state from a session. Use this to read previously saved state or check what state another session has stored.",
        args: {
          session_id: z.string().optional().describe("UUID of the session. Falls back to HELM_SESSION_ID env var"),
        },
        async execute({ session_id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          const effectiveSessionId = session_id || HELM_SESSION_ID;
          if (!effectiveSessionId) {
            return JSON.stringify({ error: "session_id is required: provide it as argument or set HELM_SESSION_ID env var" });
          }

          try {
            const { data, error } = await supabase
              .from("sessions")
              .select("id, agent_state")
              .eq("id", effectiveSessionId)
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to get session state: ${error.message}` });
            }

            return JSON.stringify({ session_id: data.id, state: data.agent_state });
          } catch (err) {
            return JSON.stringify({ error: `Failed to get session state: ${err.message}` });
          }
        },
      }),

      helm_session_task_list: tool({
        description:
          "List tasks linked to a session via the session_tasks junction table. Returns full task details including story/PRD context. More efficient than helm_task_list when you only need tasks for the current session.",
        args: {
          session_id: z.string().optional().describe("UUID of the session. Falls back to HELM_SESSION_ID env var"),
        },
        async execute({ session_id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          const effectiveSessionId = session_id || HELM_SESSION_ID;
          if (!effectiveSessionId) {
            return JSON.stringify({ error: "session_id is required: provide it as argument or set HELM_SESSION_ID env var" });
          }

          try {
            const result = await fetchSessionTasks(effectiveSessionId);
            if (!result || !result.tasks?.length) {
              return JSON.stringify({ tasks: [], message: "No tasks linked to this session" });
            }
            return JSON.stringify({ tasks: result.tasks, count: result.tasks.length });
          } catch (err) {
            return JSON.stringify({ error: `Failed to list session tasks: ${err.message}` });
          }
        },
      }),

      // TSK-014: Session metadata update tool
      helm_session_update: tool({
        description: "Update session metadata. Use this to set session name, update progress, or save summary stats. Cannot update session status (managed by the app).",
        args: {
          session_id: z.string().optional().describe("UUID of the session. Falls back to HELM_SESSION_ID env var"),
          session_name: z.string().optional().describe("Display name for the session"),
          total_chunks: z.number().optional().describe("Total number of tasks/chunks in this session"),
          completed_chunks: z.number().optional().describe("Number of completed tasks/chunks"),
          current_chunk_id: z.string().optional().describe("ID of the currently active chunk/task"),
          current_action: z.object({
            description: z.string(),
            contextAnchor: z.string().optional(),
            lastAction: z.string().optional(),
          }).optional().describe("Current action being performed"),
          summary_stats: z.record(z.string(), z.any()).optional().describe("Arbitrary summary statistics JSON"),
        },
        async execute({ session_id, session_name, total_chunks, completed_chunks, current_chunk_id, current_action, summary_stats }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured" });
          }

          const resolvedSessionId = session_id || HELM_SESSION_ID;
          if (!resolvedSessionId) {
            return JSON.stringify({ error: "No session_id provided and HELM_SESSION_ID not set" });
          }

          try {
            const updateData = { updated_at: new Date().toISOString() };
            if (session_name !== undefined) updateData.session_name = session_name;
            if (total_chunks !== undefined) updateData.total_chunks = total_chunks;
            if (completed_chunks !== undefined) updateData.completed_chunks = completed_chunks;
            if (current_chunk_id !== undefined) updateData.current_chunk_id = current_chunk_id;
            if (current_action !== undefined) updateData.current_action = current_action;
            if (summary_stats !== undefined) updateData.summary_stats = summary_stats;
            // Note: last_heartbeat is updated automatically
            updateData.last_heartbeat = new Date().toISOString();

            const { data, error } = await supabase
              .from("sessions")
              .update(updateData)
              .eq("id", resolvedSessionId)
              .select("id, session_name, total_chunks, completed_chunks")
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to update session: ${error.message}` });
            }

            return JSON.stringify({ success: true, updated: data });
          } catch (err) {
            return JSON.stringify({ error: `Failed to update session: ${err.message}` });
          }
        },
      }),

      // TSK-014: Session task agent status update tool
      helm_session_task_update: tool({
        description: "Update the agent's work status on a specific task within this session. Use this to signal when you start working on a task or complete it.",
        args: {
          session_id: z.string().optional().describe("UUID of the session. Falls back to HELM_SESSION_ID env var"),
          task_id: z.string().describe("UUID of the task"),
          agent_status: z.enum(["working", "done", "blocked"]).describe("Agent's work status on this task"),
        },
        async execute({ session_id, task_id, agent_status }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured" });
          }

          const resolvedSessionId = session_id || HELM_SESSION_ID;
          if (!resolvedSessionId) {
            return JSON.stringify({ error: "No session_id provided and HELM_SESSION_ID not set" });
          }

          if (!task_id) {
            return JSON.stringify({ error: "task_id is required" });
          }

          try {
            const updateData = {
              agent_status,
            };
            if (agent_status === "done") {
              updateData.agent_completed_at = new Date().toISOString();
            }

            const { data, error } = await supabase
              .from("session_tasks")
              .update(updateData)
              .eq("session_id", resolvedSessionId)
              .eq("task_id", task_id)
              .select("session_id, task_id, agent_status, agent_completed_at")
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to update session task: ${error.message}` });
            }

            await emitEvent("session.task.updated", { session_id: resolvedSessionId, task_id, agent_status });

            return JSON.stringify({ success: true, updated: data });
          } catch (err) {
            return JSON.stringify({ error: `Failed to update session task: ${err.message}` });
          }
        },
      }),

      // ========================================
      // Reminder Tools
      // ========================================

      helm_reminder_create: tool({
        description:
          "Create a reminder that can be triggered by time, event, or both. Reminders can be linked to entities like tasks or PRDs.",
        args: {
          title: z.string().describe("Reminder title"),
          note: z.string().optional().describe("Additional notes for the reminder"),
          entity_type: z.string().optional().describe("Type of linked entity (e.g., 'task', 'prd', 'session')"),
          entity_id: z.string().optional().describe("UUID of the linked entity"),
          trigger_type: z.enum(["time", "event", "both"]).describe("How the reminder should be triggered"),
          trigger_at: z.string().optional().describe("ISO 8601 timestamp for time-based triggers"),
          trigger_event: z.string().optional().describe("Event type that triggers the reminder (e.g., 'prd.completed', 'task.status_change')"),
          org_id: z.string().optional().describe("Organization UUID. Falls back to HELM_ORG_ID env var"),
        },
        async execute({ title, note, entity_type, entity_id, trigger_type, trigger_at, trigger_event, org_id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          const effectiveOrgId = org_id || HELM_ORG_ID;
          if (!effectiveOrgId) {
            return JSON.stringify({ error: "org_id is required: provide it as argument or set HELM_ORG_ID env var" });
          }

          if (!title || !trigger_type) {
            return JSON.stringify({ error: "title and trigger_type are required" });
          }

          // Validate trigger configuration
          if (trigger_type === "time" && !trigger_at) {
            return JSON.stringify({ error: "trigger_at is required for time-based triggers" });
          }
          if (trigger_type === "event" && !trigger_event) {
            return JSON.stringify({ error: "trigger_event is required for event-based triggers" });
          }
          if (trigger_type === "both" && (!trigger_at || !trigger_event)) {
            return JSON.stringify({ error: "both trigger_at and trigger_event are required when trigger_type is 'both'" });
          }

          try {
            const insertData = {
              org_id: effectiveOrgId,
              title,
              trigger_type,
              status: "active",
            };
            if (note) insertData.note = note;
            if (entity_type) insertData.entity_type = entity_type;
            if (entity_id) insertData.entity_id = entity_id;
            if (trigger_at) insertData.trigger_at = trigger_at;
            if (trigger_event) insertData.trigger_event = trigger_event;

            const { data, error } = await supabase
              .from("reminders")
              .insert(insertData)
              .select("id, title, trigger_type, trigger_at, trigger_event")
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to create reminder: ${error.message}` });
            }

            await emitEvent("reminder.created", {
              id: data.id,
              title: data.title,
              trigger_type: data.trigger_type,
              entity_type,
              entity_id,
            });

            return JSON.stringify({ success: true, id: data.id, title: data.title });
          } catch (err) {
            return JSON.stringify({ error: `Failed to create reminder: ${err.message}` });
          }
        },
      }),

      // ========================================
      // Automated Test Tools (US-NEW-A)
      // ========================================

      register_test: tool({
        description:
          "Register a test file written for a task. Stores metadata in the task_tests table. Use this after writing a test file to track it.",
        args: {
          task_id: z.string().describe("UUID of the task this test belongs to"),
          test_type: z.enum(["unit", "integration", "e2e", "visual", "ui"]).describe("Type of test"),
          file_path: z.string().describe("Path to the test file (relative to repo root)"),
          framework: z.string().describe("Test framework (jest, playwright, xcuitest, pytest, etc.)"),
          description: z.string().describe("What the test covers"),
          command: z.string().optional().describe("Custom command to run this test (optional - will be inferred from framework if not provided)"),
        },
        async execute({ task_id, test_type, file_path, framework, description, command }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!task_id || !test_type || !file_path || !framework || !description) {
            return JSON.stringify({ error: "task_id, test_type, file_path, framework, and description are required" });
          }

          try {
            const insertData = {
              task_id,
              test_type,
              file_path,
              framework,
              description,
            };
            if (command) insertData.command = command;

            const { data, error } = await supabase
              .from("task_tests")
              .insert(insertData)
              .select("id, test_type, file_path, framework")
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to register test: ${error.message}` });
            }

            // Log activity
            await logTaskActivity(task_id, "test_registered", {
              display_message: `Registered ${test_type} test: ${file_path}`,
              test_id: data.id,
              test_type,
              file_path,
              framework,
            });

            await emitEvent("task.test.registered", {
              task_id,
              test_id: data.id,
              test_type,
              file_path,
              framework,
            });

            return JSON.stringify({
              success: true,
              test_id: data.id,
              test_type: data.test_type,
              file_path: data.file_path,
              framework: data.framework,
            });
          } catch (err) {
            return JSON.stringify({ error: `Failed to register test: ${err.message}` });
          }
        },
      }),

      record_test_run: tool({
        description:
          "Record the result of running a test. Stores in task_test_runs table. Use this after executing a test to track its result.",
        args: {
          test_id: z.string().describe("UUID of the test (from register_test)"),
          task_id: z.string().describe("UUID of the task"),
          status: z.enum(["passed", "failed", "error", "skipped"]).describe("Test result status"),
          output: z.string().optional().describe("Test output/logs (truncate if very long)"),
          duration_ms: z.number().optional().describe("Duration in milliseconds"),
        },
        async execute({ test_id, task_id, status, output, duration_ms }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!test_id || !task_id || !status) {
            return JSON.stringify({ error: "test_id, task_id, and status are required" });
          }

          try {
            // Insert run record
            const insertData = {
              task_test_id: test_id,
              session_id: pluginState.currentSessionId || HELM_SESSION_ID || null,
              status,
            };
            if (output) insertData.output = output.slice(0, 50000); // Truncate to 50KB
            if (duration_ms !== undefined) insertData.duration_ms = duration_ms;

            const { data: runData, error: runError } = await supabase
              .from("task_test_runs")
              .insert(insertData)
              .select("id, status, duration_ms")
              .single();

            if (runError) {
              return JSON.stringify({ error: `Failed to record test run: ${runError.message}` });
            }

            // Log activity
            const statusEmoji = status === "passed" ? "✓" : status === "failed" ? "✗" : "⚠";
            const durationStr = duration_ms ? ` (${duration_ms}ms)` : "";
            await logTaskActivity(task_id, "test_run_recorded", {
              display_message: `${statusEmoji} Test ${status}${durationStr}`,
              run_id: runData.id,
              test_id,
              status,
              duration_ms,
            });

            return JSON.stringify({
              success: true,
              run_id: runData.id,
              status: runData.status,
              duration_ms: runData.duration_ms,
            });
          } catch (err) {
            return JSON.stringify({ error: `Failed to record test run: ${err.message}` });
          }
        },
      }),

      get_test_summary: tool({
        description:
          "Get test summary for a task. Returns counts by status: total tests, passing, failing, pending.",
        args: {
          task_id: z.string().describe("UUID of the task"),
        },
        async execute({ task_id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!task_id) {
            return JSON.stringify({ error: "task_id is required" });
          }

          try {
            // Fetch all tests for the task
            const { data: tests, error: testsError } = await supabase
              .from("task_tests")
              .select("id, test_type, file_path, framework")
              .eq("task_id", task_id);

            if (testsError) {
              return JSON.stringify({ error: `Failed to fetch tests: ${testsError.message}` });
            }

            if (!tests || tests.length === 0) {
              return JSON.stringify({
                task_id,
                total: 0,
                passing: 0,
                failing: 0,
                pending: 0,
                tests: [],
              });
            }

            // For each test, get the latest run status
            const testIds = tests.map((t) => t.id);
            const { data: latestRuns, error: runsError } = await supabase
              .from("task_test_runs")
              .select("task_test_id, status, created_at")
              .in("task_test_id", testIds)
              .order("created_at", { ascending: false });

            if (runsError) {
              return JSON.stringify({ error: `Failed to fetch test runs: ${runsError.message}` });
            }

            // Build map of latest status per test
            const latestStatusMap = {};
            for (const run of latestRuns || []) {
              if (!latestStatusMap[run.task_test_id]) {
                latestStatusMap[run.task_test_id] = run.status;
              }
            }

            // Count by status
            let passing = 0;
            let failing = 0;
            let pending = 0;

            const testsWithStatus = tests.map((test) => {
              const latestStatus = latestStatusMap[test.id] || "pending";
              if (latestStatus === "passed") passing++;
              else if (latestStatus === "failed" || latestStatus === "error") failing++;
              else pending++;

              return {
                id: test.id,
                test_type: test.test_type,
                file_path: test.file_path,
                framework: test.framework,
                latest_status: latestStatus,
              };
            });

            return JSON.stringify({
              task_id,
              total: tests.length,
              passing,
              failing,
              pending,
              all_passing: failing === 0 && pending === 0 && passing > 0,
              tests: testsWithStatus,
            });
          } catch (err) {
            return JSON.stringify({ error: `Failed to get test summary: ${err.message}` });
          }
        },
      }),

      // ========================================
      // Context Search Tools (US-034)
      // ========================================

      helm_search_context: tool({
        description:
          "Search Helm project artifacts (tasks, stories, PRDs, comments, session summaries) by semantic similarity. Use this to find related context, past decisions, similar tasks, and patterns. Returns top-N most relevant results.",
        args: {
          query: z.string().describe("Natural language search query — describe what you're looking for"),
          match_count: z.number().min(1).max(20).default(5).optional().describe("Number of results to return (default 5, max 20)"),
          source_types: z.array(z.enum(["task", "story", "prd", "comment", "session_summary"])).optional().describe("Filter by source types (omit for all types)"),
        },
        async execute({ query, match_count, source_types }) {
          const orgId = HELM_ORG_ID;
          if (!orgId) {
            return JSON.stringify({ error: "HELM_ORG_ID not set — cannot search without org context" });
          }

          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          try {
            // Call the search-embeddings Edge Function
            const { data, error } = await supabase.functions.invoke("search-embeddings", {
              body: {
                query: query,
                org_id: orgId,
                match_count: match_count || 5,
                source_types: source_types || null,
              },
            });

            if (error) {
              return JSON.stringify({ error: `Search failed: ${error.message}` });
            }

            // Format results for the agent
            const results = (data?.results || []).map((r) => ({
              source_type: r.source_type,
              source_id: r.source_id,
              title: r.metadata?.title || r.metadata?.preview || "Untitled",
              preview: r.metadata?.preview || "",
              similarity: Math.round(r.similarity * 100) / 100,
              metadata: r.metadata,
            }));

            return JSON.stringify({
              query: query,
              result_count: results.length,
              results,
            });
          } catch (err) {
            return JSON.stringify({ error: `Search error: ${err.message}` });
          }
        },
      }),

      // ========================================
      // Settings/Preferences Tools (US-NEW-W)
      // ========================================

      helm_project_settings_get: tool({
        description:
          "Get project/repo settings including merge method, merge timing, default branch, assistant model, and services configuration.",
        args: {
          repo_id: z.string().describe("Repository UUID"),
        },
        async execute({ repo_id }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!repo_id) {
            return JSON.stringify({ error: "repo_id is required" });
          }

          try {
            const { data, error } = await supabase
              .from("repos")
              .select("*")
              .eq("id", repo_id)
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to get project settings: ${error.message}` });
            }

            return JSON.stringify({
              settings: {
                name: data.name,
                full_name: data.full_name,
                default_branch: data.default_branch,
                merge_timing: data.merge_timing,
                merge_method: data.merge_method,
                assistant_model: data.assistant_model,
                services: data.services,
                is_private: data.is_private,
              },
            });
          } catch (err) {
            return JSON.stringify({ error: `Failed to get project settings: ${err.message}` });
          }
        },
      }),

      helm_project_settings_update: tool({
        description:
          "Update project/repo settings. Only provided fields are changed. Requires user confirmation before calling.",
        args: {
          repo_id: z.string().describe("Repository UUID"),
          settings: z.object({
            default_branch: z.string().optional().describe("Default branch name (e.g., 'main')"),
            merge_timing: z.enum(["test_before_merge", "merge_then_test"]).optional().describe("When to run tests relative to merge"),
            merge_method: z.enum(["squash", "rebase", "merge_commit"]).optional().describe("Git merge strategy"),
            assistant_model: z.string().optional().describe("Default LLM model for assistant mode"),
            services: z.array(z.any()).optional().describe("Array of service configurations"),
          }).describe("Settings fields to update"),
        },
        async execute({ repo_id, settings }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          if (!repo_id) {
            return JSON.stringify({ error: "repo_id is required" });
          }

          const updateData = {};
          for (const [key, value] of Object.entries(settings)) {
            if (value !== undefined) updateData[key] = value;
          }

          if (Object.keys(updateData).length === 0) {
            return JSON.stringify({ error: "No settings provided to update" });
          }

          try {
            const { error } = await supabase
              .from("repos")
              .update(updateData)
              .eq("id", repo_id);

            if (error) {
              return JSON.stringify({ error: `Failed to update project settings: ${error.message}` });
            }

            await emitEvent("project.settings.updated", {
              repo_id,
              updated_fields: Object.keys(updateData),
            });

            return JSON.stringify({ status: "updated", fields: Object.keys(updateData) });
          } catch (err) {
            return JSON.stringify({ error: `Failed to update project settings: ${err.message}` });
          }
        },
      }),

      helm_notification_prefs_get: tool({
        description:
          "Get the current user's notification preferences including enabled event types and sound settings.",
        args: {},
        async execute() {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          const deviceId = HELM_DEVICE_ID;
          if (!deviceId) {
            return JSON.stringify({ error: "HELM_DEVICE_ID not set" });
          }

          try {
            const { data, error } = await supabase
              .from("devices")
              .select("notification_preferences, notification_sound_enabled")
              .eq("id", deviceId)
              .single();

            if (error) {
              return JSON.stringify({ error: `Failed to get notification preferences: ${error.message}` });
            }

            return JSON.stringify({
              preferences: {
                enabled_events: data.notification_preferences || [],
                sound_enabled: data.notification_sound_enabled ?? true,
              },
            });
          } catch (err) {
            return JSON.stringify({ error: `Failed to get notification preferences: ${err.message}` });
          }
        },
      }),

      helm_notification_prefs_set: tool({
        description:
          "Update the current user's notification preferences. Requires user confirmation before calling.",
        args: {
          enabled_events: z.array(z.string()).optional().describe("Array of enabled notification event types (e.g., ['session_completed', 'session_needs_input', 'prd_moved_to_ready'])"),
          sound_enabled: z.boolean().optional().describe("Whether push notifications should play sound"),
        },
        async execute({ enabled_events, sound_enabled }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          const deviceId = HELM_DEVICE_ID;
          if (!deviceId) {
            return JSON.stringify({ error: "HELM_DEVICE_ID not set" });
          }

          const updateData = {};
          if (enabled_events !== undefined) {
            updateData.notification_preferences = enabled_events;
          }
          if (sound_enabled !== undefined) {
            updateData.notification_sound_enabled = sound_enabled;
          }

          if (Object.keys(updateData).length === 0) {
            return JSON.stringify({ error: "No preferences provided to update" });
          }

          try {
            const { error } = await supabase
              .from("devices")
              .update(updateData)
              .eq("id", deviceId);

            if (error) {
              return JSON.stringify({ error: `Failed to update notification preferences: ${error.message}` });
            }

            await emitEvent("notification.prefs.updated", {
              device_id: deviceId,
              updated_fields: Object.keys(updateData),
            });

            return JSON.stringify({ status: "updated", fields: Object.keys(updateData) });
          } catch (err) {
            return JSON.stringify({ error: `Failed to update notification preferences: ${err.message}` });
          }
        },
      }),

      helm_dashboard_widgets_get: tool({
        description:
          "Get the current user's dashboard widget layout and configuration.",
        args: {},
        async execute() {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          const deviceId = HELM_DEVICE_ID;
          if (!deviceId) {
            return JSON.stringify({ error: "HELM_DEVICE_ID not set" });
          }

          try {
            // First get user_id from device
            const { data: deviceData, error: deviceError } = await supabase
              .from("devices")
              .select("user_id")
              .eq("id", deviceId)
              .single();

            if (deviceError) {
              return JSON.stringify({ error: `Failed to get device info: ${deviceError.message}` });
            }

            const userId = deviceData.user_id;
            if (!userId) {
              return JSON.stringify({ error: "Device has no associated user" });
            }

            // Fetch user's dashboard widgets
            const { data: widgets, error: widgetsError } = await supabase
              .from("user_dashboard_widgets")
              .select("id, widget_type, position, col_span, row_height_pct, view_id")
              .eq("user_id", userId)
              .order("position", { ascending: true });

            if (widgetsError) {
              return JSON.stringify({ error: `Failed to get dashboard widgets: ${widgetsError.message}` });
            }

            return JSON.stringify({
              layout: {
                user_id: userId,
                widgets: widgets || [],
              },
            });
          } catch (err) {
            return JSON.stringify({ error: `Failed to get dashboard widgets: ${err.message}` });
          }
        },
      }),

      helm_dashboard_widgets_set: tool({
        description:
          "Update the current user's dashboard widget layout. Replaces existing widget configuration. Requires user confirmation.",
        args: {
          widgets: z.array(z.object({
            widget_type: z.enum(["needs_attention", "prd_progress", "pinned_task_view", "my_reminders"]).describe("Widget type"),
            position: z.number().describe("Widget position in layout (0-indexed)"),
            col_span: z.number().optional().describe("Number of columns widget spans (default 1)"),
            row_height_pct: z.number().optional().describe("Row height percentage (default 25)"),
            view_id: z.string().optional().describe("UUID of associated user_view (for pinned_task_view)"),
          })).describe("Widget configuration array"),
        },
        async execute({ widgets }) {
          if (!supabase) {
            return JSON.stringify({ error: "Helm bridge not configured: missing HELM_SUPABASE_URL or HELM_SUPABASE_ANON_KEY" });
          }

          const deviceId = HELM_DEVICE_ID;
          if (!deviceId) {
            return JSON.stringify({ error: "HELM_DEVICE_ID not set" });
          }

          if (!widgets || !Array.isArray(widgets)) {
            return JSON.stringify({ error: "widgets array is required" });
          }

          try {
            // First get user_id from device
            const { data: deviceData, error: deviceError } = await supabase
              .from("devices")
              .select("user_id")
              .eq("id", deviceId)
              .single();

            if (deviceError) {
              return JSON.stringify({ error: `Failed to get device info: ${deviceError.message}` });
            }

            const userId = deviceData.user_id;
            if (!userId) {
              return JSON.stringify({ error: "Device has no associated user" });
            }

            // Delete existing widgets for this user
            const { error: deleteError } = await supabase
              .from("user_dashboard_widgets")
              .delete()
              .eq("user_id", userId);

            if (deleteError) {
              return JSON.stringify({ error: `Failed to clear existing widgets: ${deleteError.message}` });
            }

            // Insert new widgets
            if (widgets.length > 0) {
              const insertData = widgets.map((w) => ({
                user_id: userId,
                widget_type: w.widget_type,
                position: w.position,
                col_span: w.col_span ?? 1,
                row_height_pct: w.row_height_pct ?? 25,
                view_id: w.view_id || null,
              }));

              const { error: insertError } = await supabase
                .from("user_dashboard_widgets")
                .insert(insertData);

              if (insertError) {
                return JSON.stringify({ error: `Failed to insert widgets: ${insertError.message}` });
              }
            }

            await emitEvent("dashboard.widgets.updated", {
              user_id: userId,
              widget_count: widgets.length,
            });

            return JSON.stringify({ status: "updated", widget_count: widgets.length });
          } catch (err) {
            return JSON.stringify({ error: `Failed to update dashboard widgets: ${err.message}` });
          }
        },
      }),
    },

    // Event hooks (no-op placeholders for future activation)
    "tool.execute.before": async (input, output) => {
      // No-op: Future hook for intercepting tool calls
      // Will be activated in later phases for automation
    },

    "tool.execute.after": async (input, output) => {
      // Track file modifications (US-028)
      const toolName = input?.name || input?.toolName;
      const params = input?.params || input?.arguments || {};
      const result = output?.result || output;

      // Track write-related tools for file change batching
      if (["write", "edit", "create_file", "patch", "Write", "Edit"].includes(toolName)) {
        const filePath = result?.path || params?.path || params?.filePath;
        if (filePath) {
          fileChangeTracker.track(filePath, toolName);
          // Flush periodically
          if (Date.now() - fileChangeTracker.lastFlush > fileChangeTracker.FLUSH_INTERVAL) {
            await fileChangeTracker.flush();
          }
        }
      }

      // Track test results from test-related tools (US-028)
      if (["test", "run_tests", "bash", "Bash"].includes(toolName)) {
        const outputText = result?.output || result?.stdout || (typeof result === "string" ? result : "");
        // Match patterns like "5 passed", "3 tests passed", "2 failed"
        const testMatch = outputText.match(/(\d+)\s+(?:tests?\s+)?passed|(\d+)\s+(?:tests?\s+)?failed/gi);
        if (testMatch && testMatch.length > 0) {
          await logToAllTasks("test_results", {
            display_message: `Tests: ${testMatch.join(", ")}`,
            raw_summary: testMatch.join(", "),
          });
        }
      }
    },

    "chat.message": async (input, output) => {
      // No-op: Future hook for message processing
      // Will be activated in later phases for session tracking
    },

    // Session complete hook: Log activity (no automatic status transitions)
    "session.complete": async ({ sessionId, result }) => {
      // US-029: Clear heartbeat interval
      if (pluginState.heartbeatInterval) {
        clearInterval(pluginState.heartbeatInterval);
        pluginState.heartbeatInterval = null;
      }

      // Flush any pending file changes before logging completion (US-028)
      await fileChangeTracker.flush();

      if (!pluginState.sessionTasks?.length) return;

      try {
        const sessionMode = process.env.HELM_SESSION_TYPE || "builder";

        if (sessionMode === "builder" || sessionMode === "build" || sessionMode === "adHoc") {
          // Log test summary for builder sessions (no status transition)
          for (const task of pluginState.sessionTasks) {
            // US-NEW-A: Get test summary for this task
            let testSummary = null;
            if (supabase) {
              try {
                const { data: tests } = await supabase
                  .from("task_tests")
                  .select("id")
                  .eq("task_id", task.id);

                if (tests && tests.length > 0) {
                  const testIds = tests.map((t) => t.id);
                  const { data: latestRuns } = await supabase
                    .from("task_test_runs")
                    .select("task_test_id, status")
                    .in("task_test_id", testIds)
                    .order("created_at", { ascending: false });

                  // Build status map
                  const statusMap = {};
                  for (const run of latestRuns || []) {
                    if (!statusMap[run.task_test_id]) {
                      statusMap[run.task_test_id] = run.status;
                    }
                  }

                  // Count results
                  let passing = 0, failing = 0, pending = 0;
                  for (const test of tests) {
                    const status = statusMap[test.id] || "pending";
                    if (status === "passed") passing++;
                    else if (status === "failed" || status === "error") failing++;
                    else pending++;
                  }

                  testSummary = { total: tests.length, passing, failing, pending };
                }
              } catch (e) {
                console.error(`[helm-bridge] Error fetching test summary for task ${task.id}:`, e.message);
              }
            }

            // Note: Automatic status transition removed — status changes are now manual via dropdown

            // US-NEW-A: Log tests_completed activity with summary
            if (testSummary && testSummary.total > 0) {
              const allPassing = testSummary.failing === 0 && testSummary.pending === 0;
              const summaryText = allPassing
                ? `All ${testSummary.passing} tests passing`
                : `${testSummary.passing} passed, ${testSummary.failing} failed, ${testSummary.pending} pending`;

              await logTaskActivity(task.id, "tests_completed", {
                display_message: summaryText,
                ...testSummary,
                all_passing: allPassing,
              });
            }
          }
        }
        // QA sessions: do NOT auto-transition on complete
        // Status changes are now manual via dropdown

        // Log session_completed activity to all linked tasks (US-028)
        const completionMetadata = {
          session_mode: sessionMode,
          display_message: "Session completed",
        };

        // Include stats from result if available
        if (result?.stats) {
          if (result.stats.filesChanged !== undefined) {
            completionMetadata.files_changed = result.stats.filesChanged;
          }
          if (result.stats.additions !== undefined) {
            completionMetadata.additions = result.stats.additions;
          }
          if (result.stats.deletions !== undefined) {
            completionMetadata.deletions = result.stats.deletions;
          }
        }

        await logToAllTasks("session_completed", completionMetadata);
      } catch (e) {
        console.error("[helm-bridge] Error in session.complete hook:", e.message);
      }
    },

    // Session start hook: Fetch linked tasks and perform automatic status transitions
    "session.start": async ({ sessionId }) => {
      const effectiveSessionId = sessionId || HELM_SESSION_ID;
      if (!effectiveSessionId) return;

      pluginState.currentSessionId = effectiveSessionId;

      try {
        const result = await fetchSessionTasks(effectiveSessionId);
        if (result) {
          pluginState.sessionTasks = result.tasks;
          pluginState.sessionTaskRoles = result.taskRoles;
          pluginState.lastFetchTime = Date.now();
          console.log(
            `[helm-bridge] Loaded ${result.tasks.length} task(s) for session ${effectiveSessionId}`
          );

          // Note: Automatic status transitions removed — status changes are now manual via dropdown
          const sessionMode = process.env.HELM_SESSION_TYPE || "builder";

          // Log session_started activity to all linked tasks (US-028)
          const modeLabel = {
            builder: "Builder",
            build: "Builder",
            adHoc: "Ad-hoc",
            qa: "QA",
            testing: "QA",
            planner: "Planner",
            prdRefine: "Planner",
          }[sessionMode] || sessionMode;

          await logToAllTasks("session_started", {
            session_mode: sessionMode,
            display_message: `${modeLabel} session started`,
          });

          // US-029: Start heartbeat interval (~30s) for activity pulse
          if (pluginState.heartbeatInterval) {
            clearInterval(pluginState.heartbeatInterval);
          }
          pluginState.heartbeatInterval = setInterval(async () => {
            if (pluginState.sessionTasks?.length) {
              await logToAllTasks("heartbeat", {
                display_message: "Agent working",
              });
            }
          }, 30000); // 30 seconds
        } else {
          pluginState.sessionTasks = null;
          pluginState.sessionTaskRoles = {};
        }
      } catch (e) {
        console.error("[helm-bridge] Error in session.start hook:", e.message);
        pluginState.sessionTasks = null;
        pluginState.sessionTaskRoles = {};
      }
    },

    // System prompt transform hook: Inject task context into agent system prompts
    systemPromptTransform: async ({ prompt, sessionType, sessionId }) => {
      // Determine session ID and type
      const effectiveSessionId = sessionId || pluginState.currentSessionId || HELM_SESSION_ID;
      const sessionMode = sessionType || process.env.HELM_SESSION_TYPE || "builder";

      // Check if we need to refresh task data (stale after 60 seconds)
      if (effectiveSessionId) {
        const isStale = Date.now() - pluginState.lastFetchTime > TASK_CONTEXT_STALE_THRESHOLD;
        const sessionChanged = effectiveSessionId !== pluginState.currentSessionId;
        const noTasksLoaded = !pluginState.sessionTasks?.length;

        if (isStale || sessionChanged || noTasksLoaded) {
          try {
            const result = await fetchSessionTasks(effectiveSessionId);
            if (result) {
              pluginState.sessionTasks = result.tasks;
              pluginState.sessionTaskRoles = result.taskRoles;
              pluginState.lastFetchTime = Date.now();
              pluginState.currentSessionId = effectiveSessionId;
            }
          } catch (e) {
            // Continue with existing state on fetch failure
            console.error("[helm-bridge] Failed to refresh task context:", e.message);
          }
        }
      }

      // If no tasks, return prompt unchanged
      if (!pluginState.sessionTasks?.length) {
        return prompt;
      }

      const tasks = pluginState.sessionTasks;

      let context = "\n\n---\n## 🎯 Active Task Context\n\n";

      for (const task of tasks) {
        // Add role indicator if available
        const role = pluginState.sessionTaskRoles[task.id];
        if (role && role !== "primary") {
          context += `*[Role: ${role}]*\n`;
        }
        context += formatTaskContext(task, sessionMode);
      }

      // Add project services context
      context += formatServicesContext();

      // Add Helm Context Search instructions (US-034)
      context += formatHelmContextSearchInstructions();

      // US-NEW-A: Add automated testing instructions for builder sessions
      if (sessionMode === "builder" || sessionMode === "build" || sessionMode === "adHoc") {
        context += formatAutomatedTestingInstructions();
      }

      return prompt + context;
    },
  };
}

// ========================================
// Helm Context Search Instructions (US-034)
// ========================================

/**
 * Format Helm context search instructions for all session types.
 * Informs agents about the helm_search_context tool availability.
 */
function formatHelmContextSearchInstructions() {
  return `
### Helm Context Search

Use the \`helm_search_context\` tool to find related project artifacts:
- Search for similar tasks, past decisions, and patterns
- Find related PRD stories and comments for context
- Discover session summaries with relevant implementation details

This searches Helm-managed artifacts only (not project source code).

`;
}

// ========================================
// Automated Testing Instructions (US-NEW-A)
// ========================================

/**
 * Format automated testing instructions for builder sessions.
 * These instructions guide the Builder on how to write and track tests.
 */
function formatAutomatedTestingInstructions() {
  return `
### Automated Testing

After implementing the feature, write tests to verify correctness:

1. **Write test files** appropriate for the feature:
   - Use the project's existing test framework (playwright, jest, xcuitest, etc.)
   - Place tests in the standard test directory structure
   - Cover the main acceptance criteria with targeted tests

2. **Register each test** with the \`register_test\` tool:
   \`\`\`
   register_test({
     task_id: "<task-uuid>",
     test_type: "e2e" | "unit" | "integration" | "visual" | "ui",
     file_path: "tests/path/to/test.spec.ts",
     framework: "playwright" | "jest" | "xcuitest" | etc,
     description: "What this test verifies"
   })
   \`\`\`

3. **Run the tests** using the appropriate test command for the framework

4. **Record each test result** with the \`record_test_run\` tool:
   \`\`\`
   record_test_run({
     test_id: "<test-uuid-from-register>",
     task_id: "<task-uuid>",
     status: "passed" | "failed" | "error" | "skipped",
     output: "<test output if failed>",
     duration_ms: <execution time>
   })
   \`\`\`

5. **Auto-fix loop** (max 3 attempts):
   - If tests fail, analyze the failure and fix the code
   - Re-run the failing tests
   - Record the new result
   - Repeat until passing or max attempts reached

6. **Report final status** with the \`get_test_summary\` tool:
   \`\`\`
   get_test_summary({ task_id: "<task-uuid>" })
   \`\`\`

**Important**: Tests should be written BEFORE marking the task complete. The task will transition to \`agent_build_complete\` status with test results attached.

`;
}
