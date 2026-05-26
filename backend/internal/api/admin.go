package api

import (
	"net/http"
	"time"
)

type adminStats struct {
	TotalUsers          int `json:"total_users"`
	TotalImages         int `json:"total_images"`
	ImagesWithEmbedding int `json:"images_with_embedding"`
	TotalLikes          int `json:"total_likes"`
	TotalSkips          int `json:"total_skips"`
}

type adminUser struct {
	ID        int64     `json:"id"`
	Email     string    `json:"email"`
	IsAdmin   bool      `json:"is_admin"`
	CreatedAt time.Time `json:"created_at"`
	Likes     int       `json:"likes"`
	Skips     int       `json:"skips"`
}

func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	var stats adminStats

	err := s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM users`).Scan(&stats.TotalUsers)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	err = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM images`).Scan(&stats.TotalImages)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	err = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM images WHERE embedding IS NOT NULL`).Scan(&stats.ImagesWithEmbedding)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	err = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM feedback_events WHERE kind = 'like'`).Scan(&stats.TotalLikes)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	err = s.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM feedback_events WHERE kind = 'skip'`).Scan(&stats.TotalSkips)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `
		SELECT
			u.id, u.email, u.is_admin, u.created_at,
			COUNT(CASE WHEN f.kind = 'like' THEN 1 END) AS likes,
			COUNT(CASE WHEN f.kind = 'skip' THEN 1 END) AS skips
		FROM users u
		LEFT JOIN feedback_events f ON f.user_id = u.id
		GROUP BY u.id, u.email, u.is_admin, u.created_at
		ORDER BY u.created_at DESC
	`)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	users := []adminUser{}
	for rows.Next() {
		var u adminUser
		if err := rows.Scan(&u.ID, &u.Email, &u.IsAdmin, &u.CreatedAt, &u.Likes, &u.Skips); err != nil {
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		users = append(users, u)
	}

	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}
