package mcpserver

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/costaxanthos/vigil/proxy/internal/identity"

	_ "modernc.org/sqlite" // SQLite driver registered globally; opening the DB is enough.
)

// activityQueryArgs matches the input schema declared in tools.go.
type activityQueryArgs struct {
	Since   string `json:"since"`    // RFC3339; "" = no lower bound
	Limit   int    `json:"limit"`    // default 50, max 1000
	MsgType string `json:"msg_type"` // exact match; "" = no filter
}

// auditRowOut is the per-row shape returned in the tool's response.
// Includes signature presence (bool) but not the signature itself —
// the agent doesn't need it to make decisions, and including it bloats
// the JSON-RPC payload significantly.
type auditRowOut struct {
	Timestamp string `json:"ts"`
	MsgType   string `json:"msg_type"`
	QueryText string `json:"query_text"`
	Decision  string `json:"decision"`
	Bytes     int    `json:"bytes"`
}

type activitySummary struct {
	Total       int            `json:"total"`
	ByDecision  map[string]int `json:"by_decision"`
}

// runActivityQuery reads the audit table scoped to the calling agent's
// agent_id. Anonymous callers see an empty result — never any other
// agent's rows.
//
// The query is read-only and runs against the audit table that the
// Postgres-proxy path writes. Using a fresh *sql.DB per call rather
// than threading a long-lived handle through the server: SQLite reads
// are cheap to set up (~1ms), the connection lifecycle stays simple,
// and the MCP path is low-volume by design (one-shot agent calls, not
// a tight loop).
func runActivityQuery(
	dbPath string,
	id identity.Identity,
	authed bool,
	rawArgs json.RawMessage,
) (any, error) {
	if !authed {
		// Anonymous → empty result, NOT an error. The tool is
		// callable in the discovery flow even before auth.
		return map[string]any{
			"rows":    []auditRowOut{},
			"summary": activitySummary{ByDecision: map[string]int{}},
		}, nil
	}

	var args activityQueryArgs
	if len(rawArgs) > 0 {
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return nil, fmt.Errorf("parse args: %w", err)
		}
	}
	if args.Limit <= 0 {
		args.Limit = 50
	}
	if args.Limit > 1000 {
		args.Limit = 1000
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open audit db: %w", err)
	}
	defer db.Close()

	q := "SELECT ts, msg_type, COALESCE(query_text, ''), decision, bytes FROM audit WHERE agent_id = ?"
	dbArgs := []any{id.ID}
	if args.Since != "" {
		q += " AND ts >= ?"
		dbArgs = append(dbArgs, args.Since)
	}
	if args.MsgType != "" {
		q += " AND msg_type = ?"
		dbArgs = append(dbArgs, args.MsgType)
	}
	q += " ORDER BY ts DESC LIMIT ?"
	dbArgs = append(dbArgs, args.Limit)

	rows, err := db.Query(q, dbArgs...)
	if err != nil {
		return nil, fmt.Errorf("query audit: %w", err)
	}
	defer rows.Close()

	out := []auditRowOut{}
	byDecision := map[string]int{}
	for rows.Next() {
		var r auditRowOut
		if err := rows.Scan(&r.Timestamp, &r.MsgType, &r.QueryText, &r.Decision, &r.Bytes); err != nil {
			return nil, fmt.Errorf("scan audit row: %w", err)
		}
		out = append(out, r)
		byDecision[r.Decision]++
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate audit rows: %w", err)
	}

	return map[string]any{
		"content": []map[string]any{
			{"type": "json", "json": map[string]any{
				"rows": out,
				"summary": activitySummary{
					Total:      len(out),
					ByDecision: byDecision,
				},
			}},
		},
		"rows": out,
		"summary": activitySummary{
			Total:      len(out),
			ByDecision: byDecision,
		},
	}, nil
}

// hint to keep `strings` import in case future filters need it.
var _ = strings.TrimSpace
