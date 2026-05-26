package api

import (
	"net/http"
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
	// sort descending
	for i := 0; i < len(entries); i++ {
		for j := i + 1; j < len(entries); j++ {
			if entries[j].Count > entries[i].Count {
				entries[i], entries[j] = entries[j], entries[i]
			}
		}
	}
	if len(entries) > 10 {
		entries = entries[:10]
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"palette":     entries,
		"total_likes": total,
	})
}
