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
	"strconv"
	"strings"
	"sync"
	"time"

	_ "embed"

	"github.com/google/go-github/v79/github"
)

//go:embed prd.md
var prdPrompt string

//go:embed jsonify.md
var jsonPrompt string

type PRD struct {
	github   *github.Client
	issue    *github.Issue
	load     sync.Once
	issueNum int
}

func NewPRD(issueNum int) *PRD {
	return &PRD{
		github:   github.NewClient(nil).WithAuthToken(os.Getenv("GITHUB_TOKEN")),
		issueNum: issueNum,
	}
}

func (pd *PRD) getIssue(ctx context.Context) *github.Issue {
	var err error
	pd.load.Do(func() {
		owner, repo, ok := strings.Cut(os.Getenv("GITHUB_REPOSITORY"), "/")
		if !ok {
			slog.Error("invalid GITHUB_REPOSITORY env var")
			panic("invalid GITHUB_REPOSITORY envvar")
		}

		var issue *github.Issue
		issue, _, err = pd.github.Issues.Get(ctx, owner, repo, pd.issueNum)
		if err != nil {
			panic(fmt.Sprintf("could not fetch issue %d: %v", pd.issueNum, err))
		}
		pd.issue = issue
	})

	return pd.issue
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

func (pd *PRD) generatePRD(ctx context.Context, issue *github.Issue) (string, error) {
	slog.Info("creating PRD", "issue#", issue.GetNumber(), "title", issue.GetTitle())
	prompt := fmt.Sprintf(`Please create a PRD for this issue:
	
Issue: %d - %s

Summary: %s

`,
		issue.GetNumber(),
		issue.GetTitle(),
		issue.GetBody(),
	)

	prd, err := pd.fire(ctx, prdPrompt, prompt)
	switch {
	case err != nil:
		return "", fmt.Errorf("generating PRD: %w", err)
	case prd == "":
		return "", fmt.Errorf("no reply came back from model")
	}

	return prd, nil
}

func (pd *PRD) prdToJSON(ctx context.Context, prd string) (string, error) {
	slog.Info("converting PRD to JSON", "prd", prd)
	prompt := fmt.Sprintf(`Please convert the following PRD to a PRD JSON:
	
---

%s

`,
		prd,
	)

	prd, err := pd.fire(ctx, jsonPrompt, prompt)
	switch {
	case err != nil:
		return "", fmt.Errorf("generating PRD JSON: %w", err)
	case prd == "":
		slog.Warn("empty summary from AI, falling back to title")
		return "", fmt.Errorf("no reply came back from model")
	}

	prd = strings.TrimLeftFunc(prd, func(r rune) bool {
		return r != '{'
	})
	prd = strings.TrimRightFunc(prd, func(r rune) bool {
		return r != '}'
	})

	var parsed map[string]any
	if err := json.Unmarshal([]byte(prd), &parsed); err != nil {
		slog.Warn("error parsing JSON", "err", err)
		return prd, nil
	}

	parsed["branchName"] = pd.branchName()
	slog.Info("new branch name", "branchName", parsed["branchName"])

	prdBytes, err := json.MarshalIndent(parsed, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshaling final PRD JSON: %w", err)
	}
	return "PRD JSON:\n\n```json\n" + string(prdBytes) + "\n```", nil
}

func (pd *PRD) branchName() string {
	issue := pd.getIssue(context.Background())
	title := strings.TrimSpace(issue.GetTitle())
	title = strings.ToLower(title)
	title = strings.ReplaceAll(title, " ", "-")
	title = strings.ReplaceAll(title, "/", "-")
	return title
}

func (pd *PRD) fire(ctx context.Context, systemPrompt string, userPrompt string) (string, error) {
	client := &http.Client{Timeout: 5 * time.Minute}
	attempts := 0
	backoff := 5 * time.Second

	reqBody := GitHubModelsRequest{
		Model: os.Getenv("MODEL"),
		Messages: []GitHubModelsMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		slog.Warn("error marshaling request", "err", err)
		return "", fmt.Errorf("marshaling json body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, modelsURL, bytes.NewBuffer(jsonData))
	if err != nil {
		slog.Warn("error creating request", "err", err)
		return "", fmt.Errorf("creating request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+os.Getenv("GITHUB_TOKEN"))

	for attempts < 10 {
		attempts++
		resp, err := client.Do(req)
		switch {
		case err != nil:
			slog.Warn("error calling GitHub Models API", "err", err)
			return "", fmt.Errorf("calling GitHub Models API: %w", err)
		case resp.StatusCode == http.StatusTooManyRequests:
			defer resp.Body.Close()
			slog.Warn("rate limited by GitHub Models API, backing off", "attempt", attempts+1, "backoff", backoff)
			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return "", ctx.Err()
			}
			backoff *= 2
			continue
		case resp.StatusCode != http.StatusOK:
			defer resp.Body.Close()
			body, _ := io.ReadAll(resp.Body)
			slog.Warn("GitHub Models API error", "status", resp.StatusCode, "body", string(body))
			return "", fmt.Errorf("bad status code from models API: %d", resp.StatusCode)
		}
		defer resp.Body.Close()

		var aiResp GitHubModelsResponse
		if err := json.NewDecoder(resp.Body).Decode(&aiResp); err != nil {
			slog.Warn("error decoding response", "err", err)
			return "", fmt.Errorf("decoding models API response: %w", err)
		}

		if len(aiResp.Choices) > 0 {
			return strings.TrimSpace(aiResp.Choices[0].Message.Content), nil
		}
	}

	slog.Warn("ran out of retries")
	return "", fmt.Errorf("ran out of retries calling models API")
}

func (pd *PRD) addPlannedLabel(ctx context.Context) error {
	owner, repo, ok := strings.Cut(os.Getenv("GITHUB_REPOSITORY"), "/")
	if !ok {
		slog.Error("invalid GITHUB_REPOSITORY env var")
		panic("invalid GITHUB_REPOSITORY envvar")
	}

	_, _, err := pd.github.Issues.AddLabelsToIssue(ctx, owner, repo, pd.issueNum, []string{"planned"})
	if err != nil {
		slog.Error("error adding planned label", "err", err)
	}
	return err
}

func (pd *PRD) generate(ctx context.Context) error {
	slog.Info("generating PRD")

	issue := pd.getIssue(ctx)

	prd, err := pd.generatePRD(ctx, issue)
	if err != nil {
		return fmt.Errorf("generating PRD: %w", err)
	}

	var commentBody string
	if strings.Contains(prd, "# Clarifying Questions") {
		commentBody = prd
	} else {
		var err error
		commentBody, err = pd.prdToJSON(ctx, prd)
		if err != nil {
			return fmt.Errorf("converting PRD to JSON: %w", err)
		}
	}

	owner, repo, ok := strings.Cut(os.Getenv("GITHUB_REPOSITORY"), "/")
	if !ok {
		return fmt.Errorf("invalid GITHUB_REPOSITORY env var")
	}

	slog.Info("posting PRD comment", "issue#", pd.issueNum)
	_, res, err := pd.github.Issues.CreateComment(ctx, owner, repo, pd.issueNum, &github.IssueComment{
		Body: github.Ptr(commentBody),
	})

	switch {
	case err != nil:
		return fmt.Errorf("posting PRD comment: %w", err)
	case res.StatusCode < 200 || res.StatusCode >= 300:
		return fmt.Errorf("bad status code posting PRD comment: %d", res.StatusCode)
	}

	return pd.addPlannedLabel(ctx)
}

func main() {
	num, err := strconv.Atoi(os.Getenv("ISSUE_NUMBER"))
	if err != nil {
		slog.Error("invalid ISSUE_NUMBER env var", "err", err)
		os.Exit(1)
	}
	rn := NewPRD(num)

	if err := rn.generate(context.Background()); err != nil {
		slog.Error("error generating PRD", "err", err)
		os.Exit(1)
	}

	slog.Info("successfully generated PRD")
}
