package models

import "time"

type Image struct {
	ID          int64     `json:"id"`
	WallhavenID string    `json:"wallhaven_id"`
	URL         string    `json:"url"`
	ThumbURL    string    `json:"thumb_url"`
	Width       int       `json:"width"`
	Height      int       `json:"height"`
	Ratio       float64   `json:"ratio"`
	Views       int       `json:"views"`
	Favorites   int       `json:"favorites"`
	FetchedAt   time.Time `json:"fetched_at"`
}

type User struct {
	ID        int64     `json:"id"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

type FeedbackEvent struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	ImageID   int64     `json:"image_id"`
	Kind      string    `json:"kind"`
	CreatedAt time.Time `json:"created_at"`
}
