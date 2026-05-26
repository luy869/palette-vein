package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"palettevein/internal/models"
)

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	return strings.Split(s, ",")
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func (s *Server) handleGetImages(w http.ResponseWriter, r *http.Request) {
	page := 1
	if p := r.URL.Query().Get("page"); p != "" {
		if n, err := strconv.Atoi(p); err == nil && n > 0 {
			page = n
		}
	}

	sorting := r.URL.Query().Get("sorting")
	if sorting == "" {
		sorting = "toplist"
	}
	query := r.URL.Query().Get("q")

	results, err := s.wh.Search(r.Context(), sorting, query, page)
	if err != nil {
		http.Error(w, "failed to fetch from wallhaven", http.StatusBadGateway)
		return
	}

	images := make([]models.Image, 0, len(results))
	for _, res := range results {
		if res.DimensionX <= res.DimensionY {
			continue
		}
		ratio := float64(res.DimensionX) / float64(res.DimensionY)
		img := models.Image{
			WallhavenID: res.ID,
			URL:         res.Path,
			ThumbURL:    res.Thumbs.Large,
			Width:       res.DimensionX,
			Height:      res.DimensionY,
			Ratio:       ratio,
			Views:       res.Views,
			Favorites:   res.Favorites,
			Colors:      res.Colors,
		}

		err := s.db.QueryRow(r.Context(), `
			INSERT INTO images (wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, colors)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (wallhaven_id) DO UPDATE
				SET views      = EXCLUDED.views,
				    favorites  = EXCLUDED.favorites,
				    thumb_url  = EXCLUDED.thumb_url,
				    colors     = EXCLUDED.colors,
				    fetched_at = NOW()
			RETURNING id, fetched_at
		`, img.WallhavenID, img.URL, img.ThumbURL, img.Width, img.Height, img.Ratio, img.Views, img.Favorites, img.Colors,
		).Scan(&img.ID, &img.FetchedAt)
		if err != nil {
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		s.embedder.Enqueue(img.ID)
		images = append(images, img)
	}

	writeJSON(w, http.StatusOK, map[string]any{"images": images})
}

func (s *Server) handleDiscover(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(ctxUserID).(int64)

	excludeIDs := []int64{}
	if ex := r.URL.Query().Get("exclude"); ex != "" {
		for _, p := range splitCSV(ex) {
			if n, err := strconv.ParseInt(p, 10, 64); err == nil {
				excludeIDs = append(excludeIDs, n)
			}
		}
	}

	rows, err := s.db.Query(r.Context(), `
		SELECT id, wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, fetched_at, colors
		FROM images
		WHERE width > height
		  AND id NOT IN (SELECT image_id FROM feedback_events WHERE user_id = $1)
		  AND (cardinality($2::bigint[]) = 0 OR id != ALL($2::bigint[]))
		ORDER BY RANDOM()
		LIMIT 24
	`, userID, excludeIDs)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	images := make([]models.Image, 0)
	for rows.Next() {
		var img models.Image
		if err := rows.Scan(
			&img.ID, &img.WallhavenID, &img.URL, &img.ThumbURL,
			&img.Width, &img.Height, &img.Ratio, &img.Views, &img.Favorites, &img.FetchedAt, &img.Colors,
		); err != nil {
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		images = append(images, img)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"images": images})
}

func (s *Server) handleGetLikes(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(ctxUserID).(int64)

	const limit = 24
	var cursor *int64
	if c := r.URL.Query().Get("cursor"); c != "" {
		if n, err := strconv.ParseInt(c, 10, 64); err == nil {
			cursor = &n
		}
	}

	rows, err := s.db.Query(r.Context(), `
		SELECT im.id, im.wallhaven_id, im.url, im.thumb_url,
		       im.width, im.height, im.ratio, im.views, im.favorites, im.fetched_at, im.colors,
		       fe.id AS fe_id
		FROM images im
		JOIN feedback_events fe ON fe.image_id = im.id
		WHERE fe.user_id = $1 AND fe.kind = 'like'
		  AND ($2::bigint IS NULL OR fe.id < $2)
		ORDER BY fe.id DESC
		LIMIT $3
	`, userID, cursor, limit)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	images := make([]models.Image, 0)
	var lastFeID int64
	for rows.Next() {
		var img models.Image
		if err := rows.Scan(
			&img.ID, &img.WallhavenID, &img.URL, &img.ThumbURL,
			&img.Width, &img.Height, &img.Ratio, &img.Views, &img.Favorites, &img.FetchedAt, &img.Colors,
			&lastFeID,
		); err != nil {
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		images = append(images, img)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	var nextCursor *int64
	if len(images) == limit {
		nextCursor = &lastFeID
	}
	writeJSON(w, http.StatusOK, map[string]any{"images": images, "next_cursor": nextCursor})
}

func (s *Server) handleDeleteFeedback(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ImageID int64 `json:"image_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	userID := r.Context().Value(ctxUserID).(int64)
	_, err := s.db.Exec(r.Context(), `
		DELETE FROM feedback_events
		WHERE user_id = $1 AND image_id = $2 AND kind = 'like'
	`, userID, req.ImageID)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type feedbackRequest struct {
	ImageID int64  `json:"image_id"`
	Kind    string `json:"kind"`
}

func (s *Server) handlePostFeedback(w http.ResponseWriter, r *http.Request) {
	var req feedbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Kind != "like" && req.Kind != "skip" {
		http.Error(w, "kind must be 'like' or 'skip'", http.StatusBadRequest)
		return
	}
	if req.ImageID <= 0 {
		http.Error(w, "invalid image_id", http.StatusBadRequest)
		return
	}

	userID := r.Context().Value(ctxUserID).(int64)
	_, err := s.db.Exec(r.Context(), `
		INSERT INTO feedback_events (user_id, image_id, kind)
		VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING
	`, userID, req.ImageID, req.Kind)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
