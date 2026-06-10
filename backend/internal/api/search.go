package api

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	pgvec "github.com/pgvector/pgvector-go"

	"palettevein/internal/models"
)

func hexToRGB(hex string) (r, g, b float64, err error) {
	if len(hex) != 6 {
		return 0, 0, 0, fmt.Errorf("invalid hex")
	}
	ri, e1 := strconv.ParseInt(hex[0:2], 16, 32)
	gi, e2 := strconv.ParseInt(hex[2:4], 16, 32)
	bi, e3 := strconv.ParseInt(hex[4:6], 16, 32)
	if e1 != nil || e2 != nil || e3 != nil {
		return 0, 0, 0, fmt.Errorf("invalid hex")
	}
	return float64(ri), float64(gi), float64(bi), nil
}

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
		SELECT id, wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, fetched_at, colors
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

	writeJSON(w, http.StatusOK, map[string]any{"images": images, "query": q})
}

func (s *Server) handleSearchImage(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "request too large", http.StatusRequestEntityTooLarge)
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "read error", http.StatusBadRequest)
		return
	}

	vec, err := s.clip.EmbedBytes(r.Context(), data)
	if err != nil {
		log.Printf("search/image: embed error: %v", err)
		http.Error(w, "clip error", http.StatusInternalServerError)
		return
	}

	userID := r.Context().Value(ctxUserID).(int64)
	rows, err := s.db.Query(r.Context(), `
		SELECT id, wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, fetched_at, colors
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

func (s *Server) handleSearchColor(w http.ResponseWriter, r *http.Request) {
	hex := strings.TrimPrefix(r.URL.Query().Get("hex"), "#")
	rf, gf, bf, err := hexToRGB(hex)
	if err != nil {
		http.Error(w, "hex must be 6 hex digits (with or without leading #)", http.StatusBadRequest)
		return
	}

	userID := r.Context().Value(ctxUserID).(int64)
	// colors の各 hex を int 化し、最小 RGB 二乗距離で DB 側ソート（全件転送を回避）
	rows, err := s.db.Query(r.Context(), `
		SELECT id, wallhaven_id, url, thumb_url, width, height, ratio, views, favorites, fetched_at, colors
		FROM images i
		WHERE colors IS NOT NULL AND width > height
		  AND id NOT IN (SELECT image_id FROM feedback_events WHERE user_id = $1)
		ORDER BY (
			SELECT MIN(
				power(((v.cv >> 16) & 255) - $2, 2) +
				power(((v.cv >> 8) & 255) - $3, 2) +
				power((v.cv & 255) - $4, 2)
			)
			FROM unnest(i.colors) AS c,
			     LATERAL (SELECT ('x' || ltrim(c, '#'))::bit(24)::int AS cv) v
		)
		LIMIT 24
	`, userID, int(rf), int(gf), int(bf))
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
