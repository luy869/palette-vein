package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"palettevein/internal/auth"
	"palettevein/internal/models"
)

type authRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req authRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || len(req.Password) < 8 {
		http.Error(w, "email required and password must be 8+ chars", http.StatusBadRequest)
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	var user models.User
	err = s.db.QueryRow(r.Context(), `
		INSERT INTO users (email, password_hash)
		VALUES ($1, $2)
		RETURNING id, email, created_at
	`, req.Email, hash).Scan(&user.ID, &user.Email, &user.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "unique") {
			http.Error(w, "email already registered", http.StatusConflict)
			return
		}
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	s.setAuthCookie(w, user.ID)
	writeJSON(w, http.StatusCreated, user)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req authRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	var user models.User
	var hash string
	err := s.db.QueryRow(r.Context(), `
		SELECT id, email, created_at, password_hash
		FROM users
		WHERE email = $1
	`, req.Email).Scan(&user.ID, &user.Email, &user.CreatedAt, &hash)
	if err != nil {
		http.Error(w, "invalid email or password", http.StatusUnauthorized)
		return
	}

	if !auth.CheckPassword(hash, req.Password) {
		http.Error(w, "invalid email or password", http.StatusUnauthorized)
		return
	}

	s.setAuthCookie(w, user.ID)
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    "",
		HttpOnly: true,
		Path:     "/",
		MaxAge:   -1,
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(ctxUserID).(int64)
	var user models.User
	err := s.db.QueryRow(r.Context(), `
		SELECT id, email, created_at FROM users WHERE id = $1
	`, userID).Scan(&user.ID, &user.Email, &user.CreatedAt)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) setAuthCookie(w http.ResponseWriter, userID int64) {
	token, err := auth.GenerateToken(userID, s.jwtSecret)
	if err != nil {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    token,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
		MaxAge:   60 * 60 * 24 * 30,
	})
}
