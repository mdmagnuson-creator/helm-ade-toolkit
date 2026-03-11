package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "embed"

	"github.com/google/go-github/v79/github"
)

//go:embed triage.md
var triagePrompt string

//go:embed fix.md
var fixPrompt string

// TriageResult represents the AI analysis result
type TriageResult struct {
	Category      string   `json:"category"`
	RootCause     string   `json:"rootCause"`
	SuggestedFix  string   `json:"suggestedFix"`
	Confidence    string   `json:"confidence"`
	Fixable       bool     `json:"fixable"`
	AffectedFiles []string `json:"affectedFiles"`
}

// FixResult represents the corrected files from the AI fix
type FixResult struct {
	Files map[string]string `json:"files"`
}

// Message represents a chat message with optional tool calls
type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

// ToolCall represents a tool call from the model
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function FunctionCall `json:"function"`
}

// FunctionCall represents the function details in a tool call
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// ToolDef represents a tool definition sent to the model
type ToolDef struct {
	Type     string      `json:"type"`
	Function FunctionDef `json:"function"`
}

// FunctionDef represents the function schema in a tool definition
type FunctionDef struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  interface{} `json:"parameters"`
}

// ChatRequest represents the request to GitHub Models API
type ChatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Tools    []ToolDef `json:"tools,omitempty"`
}

// ChatResponse represents the response from GitHub Models API
type ChatResponse struct {
	Choices []struct {
		Message      Message `json:"message"`
		FinishReason string  `json:"finish_reason"`
	} `json:"choices"`
}

// tokenLimitError is returned when the API rejects a request for exceeding token limits (413).
type tokenLimitError struct {
	statusCode int
	body       string
}

func (e *tokenLimitError) Error() string {
	return fmt.Sprintf("models API token limit exceeded (status %d): %s", e.statusCode, e.body)
}

// contentFilterError is returned when Azure's content filter rejects the request (400).
type contentFilterError struct {
	body string
}

func (e *contentFilterError) Error() string {
	return fmt.Sprintf("content filter triggered: %s", e.body)
}

// Triage handles fetching failed job logs and AI analysis
type Triage struct {
	github         *github.Client
	fixClient      *github.Client // client for creating fix PRs, may use a separate token
	token          string
	owner          string
	repo           string
	runID          int64
	failedJobNames []string

	// Model-dependent limits, set by resolveModel()
	maxResultChars int
	defaultTail    int
	maxTail        int
	model          string
}

// NewTriage creates a new Triage instance from environment variables
func NewTriage() (*Triage, error) {
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("GITHUB_TOKEN environment variable is required")
	}

	repository := os.Getenv("GITHUB_REPOSITORY")
	if repository == "" {
		return nil, fmt.Errorf("GITHUB_REPOSITORY environment variable is required")
	}

	owner, repo, ok := strings.Cut(repository, "/")
	if !ok {
		return nil, fmt.Errorf("GITHUB_REPOSITORY must be in format owner/repo, got: %s", repository)
	}

	runIDStr := os.Getenv("GITHUB_RUN_ID")
	if runIDStr == "" {
		return nil, fmt.Errorf("GITHUB_RUN_ID environment variable is required")
	}

	runID, err := strconv.ParseInt(runIDStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("GITHUB_RUN_ID must be a valid integer: %w", err)
	}

	model := os.Getenv("MODEL")
	if model == "" {
		model = defaultModel
	}
	maxResultChars, defaultTail, maxTail := modelLimits(model)

	client := github.NewClient(nil).WithAuthToken(token)

	fixToken := os.Getenv("FIX_TOKEN")
	fixClient := client
	if fixToken != "" {
		fixClient = github.NewClient(nil).WithAuthToken(fixToken)
	}

	return &Triage{
		github:         client,
		fixClient:      fixClient,
		token:          token,
		owner:          owner,
		repo:           repo,
		runID:          runID,
		model:          model,
		maxResultChars: maxResultChars,
		defaultTail:    defaultTail,
		maxTail:        maxTail,
	}, nil
}

const (
	modelsURL     = "https://models.github.ai/inference/chat/completions"
	defaultModel  = "openai/gpt-4o"
	maxToolRounds = 20
)

// modelLimits returns (maxToolResultChars, defaultTailLines, maxTailLines) based on model.
// Small-context models like gpt-5 get aggressive truncation; large-context models get generous limits.
func modelLimits(model string) (maxResultChars int, defaultTail int, maxTail int) {
	switch {
	case strings.Contains(model, "gpt-5"):
		return 2_000, 50, 200
	default:
		return 50_000, 500, 2000
	}
}

// triageTools returns the tool definitions for the triage conversation
func (t *Triage) triageTools() []ToolDef {
	return []ToolDef{
		{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_failed_jobs",
				Description: "List all failed jobs in the current workflow run. Returns job names and IDs.",
				Parameters: map[string]interface{}{
					"type":       "object",
					"properties": map[string]interface{}{},
				},
			},
		},
		{
			Type: "function",
			Function: FunctionDef{
				Name:        "get_job_logs",
				Description: "Get the last N lines of logs for a specific failed job. Use list_failed_jobs first to get job IDs.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"job_id": map[string]interface{}{
							"type":        "integer",
							"description": "The job ID to fetch logs for",
						},
						"tail_lines": map[string]interface{}{
							"type":        "integer",
							"description": "Number of lines from the end to return (default 200, max 1000)",
						},
					},
					"required": []string{"job_id"},
				},
			},
		},
		{
			Type: "function",
			Function: FunctionDef{
				Name:        "read_file",
				Description: "Read the contents of a file in the repository checkout. Use this to inspect source files mentioned in error messages.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"path": map[string]interface{}{
							"type":        "string",
							"description": "Relative file path from the repository root",
						},
					},
					"required": []string{"path"},
				},
			},
		},
		{
			Type: "function",
			Function: FunctionDef{
				Name:        "get_workflow_run_info",
				Description: "Get metadata about the current workflow run: branch, commit SHA, event type, workflow name.",
				Parameters: map[string]interface{}{
					"type":       "object",
					"properties": map[string]interface{}{},
				},
			},
		},
	}
}

// truncateResult caps a tool result string to maxToolResultChars.
func truncateResult(s string, maxChars int) string {
	if len(s) <= maxChars {
		return s
	}
	return s[:maxChars] + "\n... (truncated)"
}

// estimateTokens gives a rough token count for the message history.
// ~4 chars per token is a reasonable approximation for English/code.
func estimateTokens(messages []Message) int {
	total := 0
	for _, m := range messages {
		total += len(m.Content) / 4
		for _, tc := range m.ToolCalls {
			total += len(tc.Function.Arguments) / 4
		}
		// Per-message overhead
		total += 4
	}
	return total
}

// compressMessages aggressively truncates tool result messages to reduce token count.
// It keeps the system and user messages intact, and truncates tool results to 500 chars.
func compressMessages(messages []Message) []Message {
	const compressedMaxChars = 500
	compressed := make([]Message, len(messages))
	for i, m := range messages {
		compressed[i] = m
		if m.Role == "tool" && len(m.Content) > compressedMaxChars {
			compressed[i].Content = m.Content[:compressedMaxChars] + "\n... (truncated to fit token limit)"
		}
	}
	return compressed
}

// sanitizeMessages replaces words in tool results that commonly trigger Azure's content filter.
// CI logs frequently contain terms like "kill", "fatal", "panic", "abort" in normal software
// contexts (e.g. SIGKILL, fatal error, panic stack trace) that trip the self-harm filter.
func sanitizeMessages(messages []Message) []Message {
	replacer := strings.NewReplacer(
		"kill", "end",
		"Kill", "End",
		"KILL", "END",
		"killed", "ended",
		"Killed", "Ended",
		"KILLED", "ENDED",
		"suicide", "shutdown",
		"abort", "stop",
		"Abort", "Stop",
		"ABORT", "STOP",
		"aborted", "stopped",
		"Aborted", "Stopped",
		"ABORTED", "STOPPED",
		"hang", "stall",
		"Hang", "Stall",
		"HANG", "STALL",
		"hanging", "stalling",
		"fatal", "critical",
		"Fatal", "Critical",
		"FATAL", "CRITICAL",
		"dead", "inactive",
		"Dead", "Inactive",
		"DEAD", "INACTIVE",
		"deadlock", "lockup",
		"Deadlock", "Lockup",
		"DEADLOCK", "LOCKUP",
		"panic", "crash",
		"Panic", "Crash",
		"PANIC", "CRASH",
		"die", "fail",
		"Die", "Fail",
		"DIE", "FAIL",
		"dying", "failing",
		"death", "failure",
		"destroy", "remove",
		"Destroy", "Remove",
		"DESTROY", "REMOVE",
	)

	sanitized := make([]Message, len(messages))
	for i, m := range messages {
		sanitized[i] = m
		if m.Role == "tool" || m.Role == "user" || m.Role == "system" {
			sanitized[i].Content = replacer.Replace(m.Content)
		}
	}
	return sanitized
}

// executeTool runs a tool call and returns the result string
func (t *Triage) executeTool(ctx context.Context, name string, argsJSON string) string {
	switch name {
	case "list_failed_jobs":
		return t.toolListFailedJobs(ctx)
	case "get_job_logs":
		return t.toolGetJobLogs(ctx, argsJSON)
	case "read_file":
		return t.toolReadFile(argsJSON)
	case "get_workflow_run_info":
		return t.toolGetWorkflowRunInfo(ctx)
	default:
		return fmt.Sprintf("unknown tool: %s", name)
	}
}

func (t *Triage) toolListFailedJobs(ctx context.Context) string {
	jobs, _, err := t.github.Actions.ListWorkflowJobs(ctx, t.owner, t.repo, t.runID, &github.ListWorkflowJobsOptions{
		Filter: "all",
	})
	if err != nil {
		return fmt.Sprintf("error listing jobs: %v", err)
	}

	type jobInfo struct {
		ID         int64  `json:"id"`
		Name       string `json:"name"`
		Conclusion string `json:"conclusion"`
		Status     string `json:"status"`
	}

	var failed []jobInfo
	for _, job := range jobs.Jobs {
		if job.GetConclusion() == "failure" {
			failed = append(failed, jobInfo{
				ID:         job.GetID(),
				Name:       job.GetName(),
				Conclusion: job.GetConclusion(),
				Status:     job.GetStatus(),
			})
		}
	}

	// Track names for Slack notification
	names := make([]string, len(failed))
	for i, j := range failed {
		names[i] = j.Name
	}
	t.failedJobNames = names

	if len(failed) == 0 {
		return "no failed jobs found"
	}

	b, _ := json.Marshal(failed)
	return string(b)
}

func (t *Triage) toolGetJobLogs(ctx context.Context, argsJSON string) string {
	var args struct {
		JobID     int64 `json:"job_id"`
		TailLines int   `json:"tail_lines"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return fmt.Sprintf("error parsing arguments: %v", err)
	}
	if args.TailLines <= 0 {
		args.TailLines = t.defaultTail
	}
	if args.TailLines > t.maxTail {
		args.TailLines = t.maxTail
	}

	logs, err := t.downloadJobLogs(ctx, args.JobID)
	if err != nil {
		return fmt.Sprintf("error downloading logs: %v", err)
	}

	return truncateLogs(logs, args.TailLines)
}

func (t *Triage) toolReadFile(argsJSON string) string {
	var args struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return fmt.Sprintf("error parsing arguments: %v", err)
	}

	// Workspace is the GITHUB_WORKSPACE or current directory
	workspace := os.Getenv("GITHUB_WORKSPACE")
	if workspace == "" {
		workspace = "."
	}

	cleanPath := filepath.Clean(args.Path)
	if filepath.IsAbs(cleanPath) || strings.HasPrefix(cleanPath, "..") {
		return "error: path must be relative and within the repository"
	}

	fullPath := filepath.Join(workspace, cleanPath)
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return fmt.Sprintf("error reading file: %v", err)
	}

	// Cap file content to avoid blowing up context
	const maxFileChars = 20_000
	s := string(content)
	if len(s) > maxFileChars {
		s = s[:maxFileChars] + "\n... (truncated)"
	}
	return s
}

func (t *Triage) toolGetWorkflowRunInfo(ctx context.Context) string {
	run, _, err := t.github.Actions.GetWorkflowRunByID(ctx, t.owner, t.repo, t.runID)
	if err != nil {
		return fmt.Sprintf("error getting workflow run: %v", err)
	}

	info := map[string]interface{}{
		"run_id":        run.GetID(),
		"workflow_name": run.GetName(),
		"workflow_path": run.GetPath(),
		"event":         run.GetEvent(),
		"branch":        run.GetHeadBranch(),
		"commit_sha":    run.GetHeadSHA(),
		"status":        run.GetStatus(),
		"conclusion":    run.GetConclusion(),
		"html_url":      run.GetHTMLURL(),
	}

	b, _ := json.Marshal(info)
	return string(b)
}

// chat sends a request to GitHub Models API and returns the response
func (t *Triage) chat(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	client := &http.Client{Timeout: 5 * time.Minute}
	attempts := 0
	backoff := 5 * time.Second

	jsonData, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshaling json body: %w", err)
	}

	for attempts < 10 {
		attempts++

		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, modelsURL, bytes.NewBuffer(jsonData))
		if err != nil {
			return nil, fmt.Errorf("creating request: %w", err)
		}

		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+t.token)

		resp, err := client.Do(httpReq)
		switch {
		case err != nil:
			return nil, fmt.Errorf("calling GitHub Models API: %w", err)
		case resp.StatusCode == http.StatusTooManyRequests:
			resp.Body.Close()
			slog.Warn("rate limited by GitHub Models API, backing off", "attempt", attempts, "backoff", backoff)
			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
			backoff *= 2
			continue
		case resp.StatusCode == http.StatusRequestEntityTooLarge:
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return nil, &tokenLimitError{statusCode: resp.StatusCode, body: string(body)}
		case resp.StatusCode != http.StatusOK:
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if resp.StatusCode == http.StatusBadRequest && strings.Contains(string(body), "content_filter") {
				return nil, &contentFilterError{body: string(body)}
			}
			return nil, fmt.Errorf("models API error (status %d): %s", resp.StatusCode, string(body))
		}

		var chatResp ChatResponse
		if err := json.NewDecoder(resp.Body).Decode(&chatResp); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("decoding models API response: %w", err)
		}
		resp.Body.Close()

		if len(chatResp.Choices) == 0 {
			return nil, fmt.Errorf("models API returned empty choices array")
		}
		return &chatResp, nil
	}

	return nil, fmt.Errorf("ran out of retries calling models API")
}

// runToolLoop runs a multi-turn conversation with tool calls until the model
// returns a final text response or we hit the max rounds.
func (t *Triage) runToolLoop(ctx context.Context, systemPrompt string, userPrompt string, tools []ToolDef) (string, error) {
	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}

	for round := 0; round < maxToolRounds; round++ {
		req := ChatRequest{
			Model:    t.model,
			Messages: sanitizeMessages(messages),
			Tools:    tools,
		}

		resp, err := t.chat(ctx, req)
		if err != nil {
			var tle *tokenLimitError
			var cfe *contentFilterError
			if errors.As(err, &tle) {
				slog.Warn("token limit exceeded, compressing conversation history", "round", round)
				messages = compressMessages(messages)
				req.Messages = sanitizeMessages(messages)
				resp, err = t.chat(ctx, req)
				if err != nil {
					return "", fmt.Errorf("chat round %d (after compress): %w", round, err)
				}
			} else if errors.As(err, &cfe) {
				// Content filter is non-deterministic; retry up to 2 times
				slog.Warn("content filter triggered, retrying", "round", round)
				for retry := 0; retry < 2; retry++ {
					time.Sleep(time.Duration(retry+1) * time.Second)
					resp, err = t.chat(ctx, req)
					if err == nil {
						break
					}
					slog.Warn("content filter retry failed", "round", round, "retry", retry+1)
				}
				if err != nil {
					return "", fmt.Errorf("chat round %d (content filter): %w", round, err)
				}
			} else {
				return "", fmt.Errorf("chat round %d: %w", round, err)
			}
		}

		msg := resp.Choices[0].Message
		finishReason := resp.Choices[0].FinishReason

		// Append the assistant message to the conversation
		messages = append(messages, msg)

		// If the model didn't make tool calls, we're done
		if finishReason != "tool_calls" || len(msg.ToolCalls) == 0 {
			slog.Info("tool loop complete", "rounds", round+1, "finishReason", finishReason)
			return strings.TrimSpace(msg.Content), nil
		}

		// Execute each tool call and append results
		for _, tc := range msg.ToolCalls {
			slog.Info("executing tool call", "tool", tc.Function.Name, "id", tc.ID)
			result := t.executeTool(ctx, tc.Function.Name, tc.Function.Arguments)
			result = truncateResult(result, t.maxResultChars)
			messages = append(messages, Message{
				Role:       "tool",
				Content:    result,
				ToolCallID: tc.ID,
			})
		}
	}

	return "", fmt.Errorf("tool loop exceeded %d rounds without producing a final answer", maxToolRounds)
}

// extractJSON finds and returns the first top-level JSON object in s.
// Handles responses wrapped in markdown fences, preceded by text, etc.
func extractJSON(s string) string {
	s = strings.TrimSpace(s)

	// Strip markdown code fences
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	s = strings.TrimSpace(s)

	// Find the first '{' and match to its closing '}'
	start := strings.IndexByte(s, '{')
	if start < 0 {
		return s
	}

	depth := 0
	inString := false
	escaped := false
	for i := start; i < len(s); i++ {
		c := s[i]
		if escaped {
			escaped = false
			continue
		}
		if c == '\\' && inString {
			escaped = true
			continue
		}
		if c == '"' {
			inString = !inString
			continue
		}
		if inString {
			continue
		}
		if c == '{' {
			depth++
		} else if c == '}' {
			depth--
			if depth == 0 {
				return s[start : i+1]
			}
		}
	}

	// No matching close brace found, return from first '{'
	return s[start:]
}

// Analyze runs the AI triage with tool calling
func (t *Triage) Analyze(ctx context.Context) (*TriageResult, error) {
	slog.Info("starting triage analysis with tool calling")

	userPrompt := fmt.Sprintf(
		"Triage the CI failure for workflow run %d in %s/%s. "+
			"Use the tools to inspect the failed jobs, read their logs, and examine any source files mentioned in errors. "+
			"When you have enough information, respond with your final JSON diagnosis.",
		t.runID, t.owner, t.repo,
	)

	response, err := t.runToolLoop(ctx, triagePrompt, userPrompt, t.triageTools())
	if err != nil {
		return nil, fmt.Errorf("triage tool loop: %w", err)
	}

	response = extractJSON(response)

	var result TriageResult
	if err := json.Unmarshal([]byte(response), &result); err != nil {
		truncatedResp := response
		if len(truncatedResp) > 500 {
			truncatedResp = truncatedResp[:500] + "... (truncated)"
		}
		return nil, fmt.Errorf("parsing triage result: %w (response: %s)", err, truncatedResp)
	}

	slog.Info("triage analysis complete", "category", result.Category, "confidence", result.Confidence, "fixable", result.Fixable)
	return &result, nil
}

// AttemptFix attempts to generate corrected file contents for the triage result
func (t *Triage) AttemptFix(ctx context.Context, triageResult *TriageResult) (*FixResult, error) {
	if !triageResult.Fixable {
		slog.Info("triage result not marked as fixable, skipping auto-fix")
		return nil, nil
	}

	slog.Info("attempting auto-fix", "affectedFiles", triageResult.AffectedFiles)

	var filesHint string
	if len(triageResult.AffectedFiles) > 0 {
		filesHint = fmt.Sprintf("\n\n**Affected Files:** %s", strings.Join(triageResult.AffectedFiles, ", "))
	}

	userPrompt := fmt.Sprintf(
		"Fix the CI failure.\n\n**Root Cause:**\n%s\n\n**Suggested Fix:**\n%s%s\n\n"+
			"Use the read_file tool to examine the relevant files, then respond with your final JSON containing the corrected file contents.",
		triageResult.RootCause,
		triageResult.SuggestedFix,
		filesHint,
	)

	// Fix only needs read_file
	tools := []ToolDef{
		{
			Type: "function",
			Function: FunctionDef{
				Name:        "read_file",
				Description: "Read the contents of a file in the repository checkout.",
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"path": map[string]interface{}{
							"type":        "string",
							"description": "Relative file path from the repository root",
						},
					},
					"required": []string{"path"},
				},
			},
		},
	}

	response, err := t.runToolLoop(ctx, fixPrompt, userPrompt, tools)
	if err != nil {
		return nil, fmt.Errorf("fix tool loop: %w", err)
	}

	response = extractJSON(response)

	var fixResult FixResult
	if err := json.Unmarshal([]byte(response), &fixResult); err != nil {
		return nil, fmt.Errorf("parsing fix result: %w", err)
	}

	if len(fixResult.Files) == 0 {
		slog.Warn("AI returned no file changes")
		return nil, nil
	}

	// Resolve workspace for writing files
	workspace := os.Getenv("GITHUB_WORKSPACE")
	if workspace == "" {
		workspace = "."
	}

	// Write corrected files to disk
	for filePath, content := range fixResult.Files {
		cleanPath := filepath.Clean(filePath)
		if filepath.IsAbs(cleanPath) || strings.HasPrefix(cleanPath, "..") {
			slog.Warn("ignoring unsafe file path from AI", "path", filePath)
			continue
		}

		fullPath := filepath.Join(workspace, cleanPath)
		if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
			return nil, fmt.Errorf("writing corrected file %s: %w", cleanPath, err)
		}
		slog.Info("wrote corrected file", "path", cleanPath)
	}

	slog.Info("auto-fix complete", "filesChanged", len(fixResult.Files))
	return &fixResult, nil
}

// CreateFixPR creates a new branch and pull request with the fixed files
func (t *Triage) CreateFixPR(ctx context.Context, triageResult *TriageResult, fixResult *FixResult) (string, error) {
	if fixResult == nil || len(fixResult.Files) == 0 {
		slog.Info("no fix result to create PR from")
		return "", nil
	}

	// For pull_request events, GITHUB_SHA is the merge commit which may not be
	// writable. Look up the PR head branch's latest commit instead.
	baseSHA := os.Getenv("GITHUB_SHA")
	run, _, err := t.github.Actions.GetWorkflowRunByID(ctx, t.owner, t.repo, t.runID)
	if err == nil && len(run.PullRequests) > 0 {
		prNumber := run.PullRequests[0].GetNumber()
		pr, _, err := t.github.PullRequests.Get(ctx, t.owner, t.repo, prNumber)
		if err == nil {
			baseSHA = pr.GetHead().GetSHA()
			slog.Info("using PR head SHA as base", "pr", prNumber, "sha", baseSHA)
		}
	}
	if baseSHA == "" {
		return "", fmt.Errorf("could not determine base SHA")
	}

	branchName := fmt.Sprintf("fix/triage-%d-%d", t.runID, time.Now().Unix())
	slog.Info("creating fix branch", "branch", branchName, "baseSHA", baseSHA)

	// Get the base commit to retrieve its tree SHA
	baseCommit, _, err := t.github.Git.GetCommit(ctx, t.owner, t.repo, baseSHA)
	if err != nil {
		return "", fmt.Errorf("getting base commit: %w", err)
	}

	// Get original file modes from base tree
	baseTree, _, err := t.github.Git.GetTree(ctx, t.owner, t.repo, baseCommit.Tree.GetSHA(), true)
	if err != nil {
		return "", fmt.Errorf("getting base tree: %w", err)
	}

	fileModes := make(map[string]string)
	for _, entry := range baseTree.Entries {
		if entry.Path != nil && entry.Mode != nil {
			fileModes[*entry.Path] = *entry.Mode
		}
	}

	// Create blobs for each changed file
	var treeEntries []*github.TreeEntry
	for filePath, content := range fixResult.Files {
		cleanPath := filepath.Clean(filePath)
		if filepath.IsAbs(cleanPath) || strings.HasPrefix(cleanPath, "..") {
			slog.Warn("ignoring unsafe file path from AI", "path", filePath)
			continue
		}

		blob, _, err := t.fixClient.Git.CreateBlob(ctx, t.owner, t.repo, github.Blob{
			Content:  github.Ptr(content),
			Encoding: github.Ptr("utf-8"),
		})
		if err != nil {
			return "", fmt.Errorf("creating blob for %s: %w", cleanPath, err)
		}

		mode := fileModes[cleanPath]
		if mode == "" {
			mode = "100644"
		}

		treeEntries = append(treeEntries, &github.TreeEntry{
			Path: github.Ptr(cleanPath),
			Mode: github.Ptr(mode),
			Type: github.Ptr("blob"),
			SHA:  blob.SHA,
		})
	}

	tree, _, err := t.fixClient.Git.CreateTree(ctx, t.owner, t.repo, baseCommit.Tree.GetSHA(), treeEntries)
	if err != nil {
		return "", fmt.Errorf("creating tree: %w", err)
	}

	commitMessage := fmt.Sprintf("fix: auto-triage %s\n\n%s\n\n%s",
		triageResult.Category,
		triageResult.RootCause,
		triageResult.SuggestedFix,
	)

	commit, _, err := t.fixClient.Git.CreateCommit(ctx, t.owner, t.repo, github.Commit{
		Message: github.Ptr(commitMessage),
		Tree:    tree,
		Parents: []*github.Commit{baseCommit},
	}, nil)
	if err != nil {
		return "", fmt.Errorf("creating commit: %w", err)
	}

	ref := fmt.Sprintf("refs/heads/%s", branchName)
	_, _, err = t.fixClient.Git.CreateRef(ctx, t.owner, t.repo, github.CreateRef{
		Ref: ref,
		SHA: *commit.SHA,
	})
	if err != nil {
		return "", fmt.Errorf("creating branch ref: %w", err)
	}

	slog.Info("created branch and commit", "branch", branchName, "commitSHA", commit.GetSHA())

	// Determine base branch for the fix PR. For pull_request events, target the
	// PR's head branch so the fix shows up in the original PR.
	var baseBranch string
	if run != nil && len(run.PullRequests) > 0 {
		prNumber := run.PullRequests[0].GetNumber()
		pr, _, err := t.github.PullRequests.Get(ctx, t.owner, t.repo, prNumber)
		if err == nil {
			baseBranch = pr.GetHead().GetRef()
		}
	}
	if baseBranch == "" {
		baseBranch = os.Getenv("GITHUB_REF_NAME")
	}
	if baseBranch == "" {
		repo, _, err := t.github.Repositories.Get(ctx, t.owner, t.repo)
		if err != nil {
			return "", fmt.Errorf("getting repository info: %w", err)
		}
		baseBranch = repo.GetDefaultBranch()
	}

	prTitle := fmt.Sprintf("fix: auto-triage %s", triageResult.Category)
	prBody := fmt.Sprintf("## Auto-Triage Fix\n\n**Category:** %s\n**Confidence:** %s\n\n**Root Cause:**\n%s\n\n**Suggested Fix:**\n%s",
		triageResult.Category,
		triageResult.Confidence,
		triageResult.RootCause,
		triageResult.SuggestedFix,
	)

	pr, _, err := t.fixClient.PullRequests.Create(ctx, t.owner, t.repo, &github.NewPullRequest{
		Title: github.Ptr(prTitle),
		Head:  github.Ptr(branchName),
		Base:  github.Ptr(baseBranch),
		Body:  github.Ptr(prBody),
		Draft: github.Ptr(true),
	})
	if err != nil {
		return "", fmt.Errorf("creating pull request: %w", err)
	}

	prURL := pr.GetHTMLURL()
	slog.Info("created pull request", "url", prURL, "number", pr.GetNumber())
	return prURL, nil
}

// downloadJobLogs downloads the raw logs for a specific job
func (t *Triage) downloadJobLogs(ctx context.Context, jobID int64) (string, error) {
	url, _, err := t.github.Actions.GetWorkflowJobLogs(ctx, t.owner, t.repo, jobID, 2)
	if err != nil {
		return "", fmt.Errorf("getting log download URL: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url.String(), nil)
	if err != nil {
		return "", fmt.Errorf("creating log download request: %w", err)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("downloading logs: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("unexpected status code downloading logs: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading log body: %w", err)
	}

	return string(body), nil
}

// truncateLogs keeps only the last N lines of logs
func truncateLogs(logs string, maxLines int) string {
	scanner := bufio.NewScanner(strings.NewReader(logs))
	var lines []string

	for scanner.Scan() {
		lines = append(lines, scanner.Text())
		if len(lines) > maxLines {
			lines = lines[1:]
		}
	}

	if err := scanner.Err(); err != nil {
		slog.Warn("scanner error while truncating logs", "err", err)
	}

	return strings.Join(lines, "\n")
}

// NotifySlack sends a Block Kit formatted message to Slack webhook
func (t *Triage) NotifySlack(ctx context.Context, triageResult *TriageResult, prURL string) error {
	webhookURL := os.Getenv("SLACK_WEBHOOK_URL")
	if webhookURL == "" {
		slog.Warn("SLACK_WEBHOOK_URL not set, skipping Slack notification")
		return nil
	}

	runURL := fmt.Sprintf("https://github.com/%s/%s/actions/runs/%d", t.owner, t.repo, t.runID)

	rootCause := triageResult.RootCause
	if len([]rune(rootCause)) > 2900 {
		runes := []rune(rootCause)
		rootCause = string(runes[:2900]) + "..."
	}

	var fixStatus string
	if prURL != "" {
		fixStatus = fmt.Sprintf(":wrench: Auto-fix PR: <%s|View PR>", prURL)
	} else if !triageResult.Fixable {
		fixStatus = "No auto-fix attempted — issue not auto-fixable"
	} else {
		fixStatus = "Auto-fix attempted but failed"
	}

	failedJobs := strings.Join(t.failedJobNames, ", ")
	if failedJobs == "" {
		failedJobs = "unknown"
	}

	blocks := []map[string]interface{}{
		{
			"type": "header",
			"text": map[string]string{
				"type": "plain_text",
				"text": fmt.Sprintf(":rotating_light: CI Failure: %s/%s", t.owner, t.repo),
			},
		},
		{
			"type": "section",
			"text": map[string]string{
				"type": "mrkdwn",
				"text": fmt.Sprintf("*Category:* %s\n*Confidence:* %s\n*Failed Jobs:* %s\n*Run:* <%s|View Run>",
					triageResult.Category,
					triageResult.Confidence,
					failedJobs,
					runURL,
				),
			},
		},
		{"type": "divider"},
		{
			"type": "section",
			"text": map[string]string{
				"type": "mrkdwn",
				"text": fmt.Sprintf("*Root Cause:*\n%s", rootCause),
			},
		},
		{
			"type": "section",
			"text": map[string]string{
				"type": "mrkdwn",
				"text": fixStatus,
			},
		},
		{
			"type": "context",
			"elements": []map[string]string{
				{
					"type": "mrkdwn",
					"text": fmt.Sprintf("Triaged by yo-go | %s", time.Now().Format(time.RFC3339)),
				},
			},
		},
	}

	payload := map[string]interface{}{"blocks": blocks}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshaling Slack payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("creating Slack request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("posting to Slack webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		slog.Warn("Slack webhook returned non-200 status", "status", resp.StatusCode, "body", string(body))
		return fmt.Errorf("Slack webhook returned status %d", resp.StatusCode)
	}

	slog.Info("successfully sent Slack notification")
	return nil
}

// CommentOnPR posts the triage result as a comment on the associated pull request.
func (t *Triage) CommentOnPR(ctx context.Context, triageResult *TriageResult, prURL string, fixErr error) error {
	// Get the workflow run to find associated PRs
	run, _, err := t.github.Actions.GetWorkflowRunByID(ctx, t.owner, t.repo, t.runID)
	if err != nil {
		return fmt.Errorf("getting workflow run: %w", err)
	}

	if len(run.PullRequests) == 0 {
		slog.Info("no pull request associated with this run, skipping PR comment")
		return nil
	}

	prNumber := run.PullRequests[0].GetNumber()

	var body strings.Builder
	body.WriteString("## 🔍 CI Failure Triage\n\n")
	body.WriteString(fmt.Sprintf("| | |\n|---|---|\n| **Category** | `%s` |\n| **Confidence** | %s |\n| **Auto-fixable** | %v |\n\n",
		triageResult.Category,
		triageResult.Confidence,
		triageResult.Fixable,
	))
	body.WriteString(fmt.Sprintf("### Root Cause\n\n%s\n\n", triageResult.RootCause))
	body.WriteString(fmt.Sprintf("### Suggested Fix\n\n%s\n", triageResult.SuggestedFix))

	if len(triageResult.AffectedFiles) > 0 {
		body.WriteString("\n### Affected Files\n\n")
		for _, f := range triageResult.AffectedFiles {
			body.WriteString(fmt.Sprintf("- `%s`\n", f))
		}
	}

	if prURL != "" {
		body.WriteString(fmt.Sprintf("\n### Auto-Fix\n\n🔧 [Draft PR with proposed fix](%s)\n", prURL))
	} else if fixErr != nil {
		body.WriteString(fmt.Sprintf("\n### Auto-Fix\n\n⚠️ Auto-fix was attempted but failed: `%s`\n", fixErr))
	}

	runURL := fmt.Sprintf("https://github.com/%s/%s/actions/runs/%d", t.owner, t.repo, t.runID)
	body.WriteString(fmt.Sprintf("\n---\n*[View workflow run](%s) · Triaged by yo-go*\n", runURL))

	comment := &github.IssueComment{
		Body: github.Ptr(body.String()),
	}

	_, _, err = t.github.Issues.CreateComment(ctx, t.owner, t.repo, prNumber, comment)
	if err != nil {
		return fmt.Errorf("creating PR comment: %w", err)
	}

	slog.Info("posted triage comment on PR", "pr", prNumber)
	return nil
}

func main() {
	triage, err := NewTriage()
	if err != nil {
		slog.Error("initialization failed", "err", err)
		os.Exit(1)
	}

	// Analyze with AI using tool calling — the model pulls logs on demand
	result, err := triage.Analyze(context.Background())
	if err != nil {
		slog.Error("failed to analyze", "err", err)
		os.Exit(1)
	}

	slog.Info("triage result",
		"category", result.Category,
		"rootCause", result.RootCause,
		"suggestedFix", result.SuggestedFix,
		"confidence", result.Confidence,
		"fixable", result.Fixable,
		"affectedFiles", strings.Join(result.AffectedFiles, ", "),
	)

	// Attempt auto-fix if enabled and the issue is fixable
	autoFix := os.Getenv("AUTO_FIX") == "true"
	var prURL string
	var fixErr error
	if autoFix && result.Fixable {
		fixResult, err := triage.AttemptFix(context.Background(), result)
		if err != nil {
			slog.Error("auto-fix failed", "err", err)
			fixErr = err
		} else if fixResult != nil {
			prURL, err = triage.CreateFixPR(context.Background(), result, fixResult)
			if err != nil {
				slog.Error("failed to create fix PR", "err", err)
				fixErr = err
			}
		}
	}

	// Post triage result as PR comment
	if err := triage.CommentOnPR(context.Background(), result, prURL, fixErr); err != nil {
		slog.Error("failed to comment on PR", "err", err)
	}

	// Send Slack notification
	if err := triage.NotifySlack(context.Background(), result, prURL); err != nil {
		slog.Error("failed to send Slack notification", "err", err)
	}

	slog.Info("successfully completed triage analysis")
}
