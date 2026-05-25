package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"palettevein/internal/embedder"
	"palettevein/internal/wallhaven"
)

type Server struct {
	db       *pgxpool.Pool
	wh       *wallhaven.Client
	embedder *embedder.Queue
	router   *chi.Mux
}

func NewServer(db *pgxpool.Pool, wh *wallhaven.Client, eq *embedder.Queue) *Server {
	s := &Server{
		db:       db,
		wh:       wh,
		embedder: eq,
		router:   chi.NewRouter(),
	}
	s.routes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Server) routes() {
	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)
	s.router.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"http://localhost:5173"},
		AllowedMethods: []string{"GET", "POST"},
		AllowedHeaders: []string{"Content-Type"},
	}))

	s.router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	s.router.Get("/api/images", s.handleGetImages)
	s.router.Post("/api/feedback", s.handlePostFeedback)
	s.router.Get("/api/recommend", s.handleGetRecommend)
	s.router.Get("/api/likes", s.handleGetLikes)
}
