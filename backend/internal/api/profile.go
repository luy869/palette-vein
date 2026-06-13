package api

import (
	"log/slog"
	"net/http"
	"sort"
)

func (s *Server) handleProfilePalette(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(ctxUserID).(int64)

	rows, err := s.db.Query(r.Context(), `
		SELECT im.colors
		FROM images im
		JOIN feedback_events fe ON fe.image_id = im.id
		WHERE fe.user_id = $1 AND fe.kind = 'like' AND im.colors IS NOT NULL
		ORDER BY fe.id DESC
		LIMIT 100
	`, userID)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	freq := map[string]int{}
	total := 0
	for rows.Next() {
		var colors []string
		if err := rows.Scan(&colors); err != nil {
			slog.Warn("profile palette: row scan failed, skipping", "error", err)
			continue
		}
		total++
		for _, c := range colors {
			freq[c]++
		}
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	type colorEntry struct {
		Hex   string `json:"hex"`
		Count int    `json:"count"`
	}
	// top 10 by count
	entries := make([]colorEntry, 0, len(freq))
	for hex, count := range freq {
		entries = append(entries, colorEntry{Hex: hex, Count: count})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Count > entries[j].Count })
	if len(entries) > 10 {
		entries = entries[:10]
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"palette":     entries,
		"total_likes": total,
	})
}
