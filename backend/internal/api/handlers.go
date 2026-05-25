package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"palettevein/internal/models"
)

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
		ratio, _ := strconv.ParseFloat(res.Ratio, 64)
		img := models.Image{
			WallhavenID: res.ID,
			URL:         res.Path,
			ThumbURL:    res.Thumbs.Small,
			Width:       res.DimensionX,
			Height:      res.DimensionY,
			Ratio:       ratio,
			Views:       res.Views,
			Favorites:   res.Favorites,
		}

		err := s.db.QueryRow(r.Context(), `
			INSERT INTO images (wallhaven_id, url, thumb_url, width, height, ratio, views, favorites)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (wallhaven_id) DO UPDATE
				SET views     = EXCLUDED.views,
				    favorites = EXCLUDED.favorites,
				    fetched_at = NOW()
			RETURNING id, fetched_at
		`, img.WallhavenID, img.URL, img.ThumbURL, img.Width, img.Height, img.Ratio, img.Views, img.Favorites,
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

func (s *Server) handleGetLikes(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(ctxUserID).(int64)
	rows, err := s.db.Query(r.Context(), `
		SELECT im.id, im.wallhaven_id, im.url, im.thumb_url,
		       im.width, im.height, im.ratio, im.views, im.favorites, im.fetched_at
		FROM images im
		JOIN feedback_events fe ON fe.image_id = im.id
		WHERE fe.user_id = $1 AND fe.kind = 'like'
		ORDER BY fe.created_at DESC
	`, userID)
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
			&img.Width, &img.Height, &img.Ratio, &img.Views, &img.Favorites, &img.FetchedAt,
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
