package identity

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

// Service binds an Issuer and a Store to HTTP handlers.
type Service struct {
	Issuer *Issuer
	Store  Store
}

// NewService returns a configured Service.
func NewService(iss *Issuer, store Store) *Service {
	return &Service{Issuer: iss, Store: store}
}

// Routes wires the identity HTTP routes onto the given mux.
func (s *Service) Routes(mux *http.ServeMux) {
	mux.HandleFunc("POST /identities", s.handleIssue)
	mux.HandleFunc("GET /identities", s.handleList)
	mux.HandleFunc("GET /identities/{id}", s.handleGet)
}

type issueResponse struct {
	Identity Identity `json:"identity"`
	Token    Token    `json:"token"`
}

func (s *Service) handleIssue(w http.ResponseWriter, r *http.Request) {
	var req IssueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	id, tok, err := s.Issuer.Issue(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.Store.Save(id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to persist identity")
		return
	}
	writeJSON(w, http.StatusCreated, issueResponse{Identity: id, Token: tok})
}

func (s *Service) handleGet(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing id")
		return
	}
	v, err := s.Store.Get(id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(w, http.StatusNotFound, "identity not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "lookup failed")
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *Service) handleList(w http.ResponseWriter, r *http.Request) {
	xs, err := s.Store.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"identities": xs})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
