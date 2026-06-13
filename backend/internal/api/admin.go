package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

type adminStats struct {
	TotalUsers          int   `json:"total_users"`
	TotalImages         int   `json:"total_images"`
	ImagesWithEmbedding int   `json:"images_with_embedding"`
	TotalLikes          int   `json:"total_likes"`
	TotalSkips          int   `json:"total_skips"`
	EmbedderQueue       int   `json:"embedder_queue"`
	DBSizeBytes         int64 `json:"db_size_bytes"`
	ImagesTableBytes    int64 `json:"images_table_bytes"`
	ImagesIndexBytes    int64 `json:"images_index_bytes"`
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

	err := s.db.QueryRow(r.Context(), `
		SELECT
			(SELECT COUNT(*) FROM users WHERE email IS NOT NULL),
			(SELECT COUNT(*) FROM images),
			(SELECT COUNT(*) FROM images WHERE embedding IS NOT NULL),
			(SELECT COUNT(*) FROM feedback_events WHERE kind = 'like'),
			(SELECT COUNT(*) FROM feedback_events WHERE kind = 'skip'),
			(SELECT COUNT(*) FROM images WHERE embedding IS NULL),
			pg_database_size(current_database()),
			pg_relation_size('images'),
			pg_indexes_size('images')
	`).Scan(
		&stats.TotalUsers, &stats.TotalImages, &stats.ImagesWithEmbedding,
		&stats.TotalLikes, &stats.TotalSkips, &stats.EmbedderQueue,
		&stats.DBSizeBytes, &stats.ImagesTableBytes, &stats.ImagesIndexBytes,
	)
	if err != nil {
		slog.Error("admin stats query failed", "error", err)
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
		WHERE u.email IS NOT NULL
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

func (s *Server) handleAdminCrawl(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Query string `json:"query"`
		Pages int    `json:"pages"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Query == "" || req.Pages < 1 {
		http.Error(w, "query and pages (>=1) required", http.StatusBadRequest)
		return
	}
	if req.Pages > 20 {
		req.Pages = 20
	}
	go func() {
		n, err := s.crawler.FetchQuery(s.baseCtx, req.Query, req.Pages)
		if err != nil {
			slog.Error("admin crawl", "error", err)
		} else {
			slog.Info("admin crawl: upserted images", "count", n, "query", req.Query, "pages", req.Pages)
		}
	}()
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "started", "query": req.Query, "pages": req.Pages})
}
