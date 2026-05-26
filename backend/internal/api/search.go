package api

import (
	"log"
	"net/http"

	pgvec "github.com/pgvector/pgvector-go"

	"palettevein/internal/models"
)

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		http.Error(w, "q is required", http.StatusBadRequest)
		return
	}

	vec, err := s.clip.EmbedText(r.Context(), q)
	if err != nil {
		log.Printf("search: embed text error: %v", err)
		http.Error(w, "clip error", http.StatusInternalServerError)
		return
	}

	userID := r.Context().Value(ctxUserID).(int64)
	rows, err := s.db.Query(r.Context(), `
		SELECT id, wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, fetched_at
		FROM images
		WHERE embedding IS NOT NULL
		  AND width > height
		  AND id NOT IN (SELECT image_id FROM feedback_events WHERE user_id = $2)
		ORDER BY embedding <=> $1
		LIMIT 24
	`, pgvec.NewVector(vec), userID)
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

	writeJSON(w, http.StatusOK, map[string]any{"images": images, "query": q})
}
