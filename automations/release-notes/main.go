package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/go-github/v79/github"
)

type ReleaseNotes struct {
	github *github.Client
}

func NewReleaseNotes() *ReleaseNotes {
	return &ReleaseNotes{
		github: github.NewClient(nil).WithAuthToken(os.Getenv("GITHUB_TOKEN")),
	}
}

func (rn *ReleaseNotes) getIssue(ctx context.Context, num int) (*github.Issue, error) {
	issue, _, err := rn.github.Issues.Get(ctx, "sendauth", "web", num)
	if err != nil {
		return nil, fmt.Errorf("fetching issue #%d: %w", num, err)
	}
	return issue, nil
}

func (rn *ReleaseNotes) getPR(ctx context.Context, num int) (*github.PullRequest, error) {
	pr, _, err := rn.github.PullRequests.Get(ctx, "sendauth", "web", num)
	if err != nil {
		return nil, fmt.Errorf("fetching PR #%d: %w", num, err)
	}
	return pr, nil
}

var prNum = regexp.MustCompile(`Merge pull request #(\d+)`)

func (rn *ReleaseNotes) getPRs(ctx context.Context) ([]PRInfo, error) {
	merges, err := os.ReadFile("commits.txt")
	if err != nil {
		return nil, fmt.Errorf("reading commits file: %w", err)
	}

	if len(merges) == 0 {
		slog.Info("no merges found in commit messages")
		return nil, nil
	}

	infos := make([]PRInfo, 0)

	// commit messages will be like:
	// <sha>|Merge pull request #123 from sendauth/blahblah
	for m := range strings.SplitSeq(string(merges), "\n") {
		matches := prNum.FindStringSubmatch(m)
		if len(matches) != 2 {
			slog.Warn("could not parse PR number from commit message", "message", m)
			continue
		}
		num, err := strconv.Atoi(matches[1])
		if err != nil {
			slog.Warn("invalid PR number", "pr", matches[1], "err", err)
			continue
		}

		issue, err := rn.getIssue(ctx, num)
		if err != nil {
			slog.Warn("error fetching issue for PR", "pr", num, "err", err)
			continue
		}

		pr, err := rn.getPR(ctx, num)
		if err != nil {
			slog.Warn("error fetching PR", "pr", num, "err", err)
			continue
		}

		infos = append(infos, PRInfo{
			PR:    pr,
			Issue: issue,
		})

		slog.Info("found PR for release notes", "pr", num, "title", pr.GetTitle(), "issue", issue.GetHTMLURL())
	}

	return infos, nil
}

type PRInfo struct {
	PR    *github.PullRequest
	Issue *github.Issue
}

type releaseNotesInput struct {
	other       []PRInfo
	bugfixes    []PRInfo
	newFeatures []PRInfo
}

type GitHubModelsRequest struct {
	Model    string                `json:"model"`
	Messages []GitHubModelsMessage `json:"messages"`
}

type GitHubModelsMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type GitHubModelsResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

const modelsURL = "https://models.github.ai/inference/chat/completions"

func (rn *ReleaseNotes) generatePRSummary(ctx context.Context, info PRInfo) string {
	// Get PR diff/patch
	patch := info.PR.GetBody()

	// Get PR files to understand changes
	files, _, err := rn.github.PullRequests.ListFiles(ctx, "sendauth", "web", info.PR.GetNumber(), &github.ListOptions{PerPage: 100})
	if err != nil {
		slog.Warn("error fetching PR files", "pr", info.PR.GetNumber(), "err", err)
	} else {
		patch += "\n\nFiles changed:\n"
		for _, file := range files {
			if file.Filename != nil {
				patch += fmt.Sprintf("- %s (+%d -%d)\n", file.GetFilename(), file.GetAdditions(), file.GetDeletions())
			}
		}
	}

	// Build the prompt for the AI
	systemPrompt := `You are a technical writer creating release notes. Provide a concise, user-focused summary (1-2 sentences) of what changed and why it matters. Focus on the impact to users, not implementation details.
	
	Do not mention the ops view or core config editor. Those are internal to SendAuth staff.

	SendAuth enables users to quickly authenticate each other using passkeys that are established out of normal authentication protocols. This means that if someone calls on the phone and says they're Bob, the person answering the phone can send them an authentication request and Bob must verify his identity with a passkey.

	The top-level directories represent Go modules, except the web directory which houses the frontend that's React/Typescript. More details:
	* api - contains serialization logic for API request->app and app->API reply
	* app - contains the main runloops for the SendAuth webapp
	* asynqmon - ignore; this is for SendAuth only
	* authn - authentication types
	* authz - authorization types
	* automation - ignore; this is for SendAuth only
	* bin - ignore; compiled output
	* clients - Clients of external services, like Dynamo or Postgres or Redis
	* cmd - app entrypoints
	* controllers - API request handlers
	* dao - persistence layer
	* data - main POGOs for SendAuth. Everything is converted to data when incoming, and then converted to some other form for outgoing (eg, API or DTO)
	* deploy - ignore; this is for SendAuth only
	* fake - ignore, this is for testing only
	* internal - ignore; this is for deployment environment config
	* log - ignore; this is logging config
	* middleware - HTTP middleware for the webapp
	* models - Application domain model logic
	* public - ignore; static assets
	* regressions - ignore; this is for testing only
	* server - contains the app entrypoints
	* service - external service integration layer (eg, sending emails or SMS)
	* slack - Slack integration logic
	* tasks - holds asynchronous event firing and handlers
	* templates - hold static HTML pages for errors
	* test - ignore; testing utilities
	* types - shared types that aren't data
	* web - the React/Typescript frontend
	* ws - websocket connection logic
	`

	userPrompt := fmt.Sprintf(`Please summarize this change for release notes.

Issue: #%d
Title: %s
Description: %s

PR Title: %s
PR Description:
%s

Provide a brief, clear summary suitable for customer-facing release notes.`,
		info.Issue.GetNumber(),
		info.Issue.GetTitle(),
		info.Issue.GetBody(),
		info.PR.GetTitle(),
		patch)

	// Call GitHub Models API
	reqBody := GitHubModelsRequest{
		Model: "openai/gpt-4o",
		Messages: []GitHubModelsMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		slog.Warn("error marshaling request", "err", err)
		return info.Issue.GetTitle()
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, modelsURL, bytes.NewBuffer(jsonData))
	if err != nil {
		slog.Warn("error creating request", "err", err)
		return info.Issue.GetTitle()
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+os.Getenv("GITHUB_TOKEN"))

	slog.Info("creating release notes for ticket", "issue", info.Issue.GetNumber(), "summary", info.Issue.GetTitle(), "pr", info.PR.GetNumber())

	summary := rn.fire(ctx, req)
	if summary == "" {
		slog.Warn("empty summary from AI, falling back to title")
		return info.Issue.GetTitle()
	}

	return summary
}

func (rn *ReleaseNotes) fire(ctx context.Context, req *http.Request) string {
	client := &http.Client{Timeout: 30 * time.Second}
	attempts := 0
	backoff := 5 * time.Second

	for attempts < 10 {
		attempts++
		resp, err := client.Do(req)
		switch {
		case err != nil:
			slog.Warn("error calling GitHub Models API", "err", err)
			return ""
		case resp.StatusCode == http.StatusTooManyRequests:
			defer resp.Body.Close()
			slog.Warn("rate limited by GitHub Models API, backing off", "attempt", attempts+1)
			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return ""
			}
			backoff *= 2
			continue
		case resp.StatusCode != http.StatusOK:
			defer resp.Body.Close()
			body, _ := io.ReadAll(resp.Body)
			slog.Warn("GitHub Models API error", "status", resp.StatusCode, "body", string(body))
			return ""
		}
		defer resp.Body.Close()

		var aiResp GitHubModelsResponse
		if err := json.NewDecoder(resp.Body).Decode(&aiResp); err != nil {
			slog.Warn("error decoding response", "err", err)
			return ""
		}

		if len(aiResp.Choices) > 0 {
			return strings.TrimSpace(aiResp.Choices[0].Message.Content)
		}
	}

	slog.Warn("ran out of retries, just sending back fallback")
	return ""
}

func (rn *ReleaseNotes) writeReleaseNotes(ctx context.Context, input releaseNotesInput) (string, error) {
	notes := ""

	if len(input.other) > 0 {
		notes += "## Security Updates\n\n"
		for _, item := range input.other {
			summary := rn.generatePRSummary(ctx, item)
			notes += fmt.Sprintf("- **#%d** - %s\n", item.Issue.GetNumber(), summary)
		}
		notes += "\n"
	}

	if len(input.bugfixes) > 0 {
		notes += "## Bugfixes\n\n"
		for _, item := range input.bugfixes {
			summary := rn.generatePRSummary(ctx, item)
			notes += fmt.Sprintf("- **#%d** - %s\n", item.Issue.GetNumber(), summary)
		}
		notes += "\n"
	}

	if len(input.newFeatures) > 0 {
		notes += "## New Features and Improvements\n\n"
		for _, item := range input.newFeatures {
			summary := rn.generatePRSummary(ctx, item)
			notes += fmt.Sprintf("- **#%d** - %s\n", item.Issue.GetNumber(), summary)
		}
		notes += "\n"
	}

	return notes, nil
}

func (rn *ReleaseNotes) generate(ctx context.Context) (string, error) {
	var other []PRInfo
	var bugfixes []PRInfo
	var features []PRInfo

	prs, err := rn.getPRs(ctx)
	if err != nil {
		slog.Error("error getting PRs for release notes", "err", err)
		return "", fmt.Errorf("getting PRs: %w", err)
	}

	for _, pr := range prs {
		switch {
		case pr.Issue.Title == nil:
			other = append(other, pr)
		case strings.Contains(strings.ToLower(*pr.Issue.Title), "[bug]"):
			bugfixes = append(bugfixes, pr)
		default:
			features = append(features, pr)
		}
	}

	if len(other) == 0 && len(bugfixes) == 0 && len(features) == 0 {
		slog.Info("no relevant tickets found for release notes")
		return "", nil
	}

	slog.Info("generating summaries", "other", len(other), "bugs", len(bugfixes), "features", len(features), "customer_requests", len(other))

	notes, err := rn.writeReleaseNotes(ctx, releaseNotesInput{
		other:       other,
		bugfixes:    bugfixes,
		newFeatures: features,
	})
	if err != nil {
		slog.Error("error writing release notes", "err", err)
		return "", fmt.Errorf("writing release notes: %w", err)
	}

	slog.Info("done generating release notes")

	return notes, nil
}

func (rn *ReleaseNotes) publish(ctx context.Context, notes string) error {
	prnum := os.Getenv("GITHUB_REF_NAME")
	split := strings.Split(prnum, "/")
	prNum, err := strconv.Atoi(split[0])
	if err != nil {
		slog.Error("invalid PR number from env", "err", err)
		return fmt.Errorf("invalid PR number: %w", err)
	}
	_, _, err = rn.github.Issues.CreateComment(ctx, "sendauth", "web", prNum, &github.IssueComment{
		Body: github.Ptr(notes),
	})
	if err != nil {
		slog.Error("error posting release notes", "err", err)
		return fmt.Errorf("posting release notes: %w", err)
	}

	return nil
}

func main() {
	rn := NewReleaseNotes()
	ctx := context.Background()
	notes, err := rn.generate(ctx)
	if err != nil {
		slog.Error("error generating release notes", "err", err)
		os.Exit(1)
	}
	if err := rn.publish(ctx, notes); err != nil {
		slog.Error("error publishing release notes", "err", err)
		os.Exit(1)
	}
}
