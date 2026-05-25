package api

import (
	"context"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"palettevein/internal/auth"
	"palettevein/internal/embedder"
	"palettevein/internal/wallhaven"
)

type contextKey string

const ctxUserID contextKey = "userID"

type Server struct {
	db        *pgxpool.Pool
	wh        *wallhaven.Client
	embedder  *embedder.Queue
	jwtSecret []byte
	router    *chi.Mux
}

func NewServer(db *pgxpool.Pool, wh *wallhaven.Client, eq *embedder.Queue, jwtSecret []byte) *Server {
	s := &Server{
		db:        db,
		wh:        wh,
		embedder:  eq,
		jwtSecret: jwtSecret,
		router:    chi.NewRouter(),
	}
	s.routes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Server) routes() {
	allowedOrigin := os.Getenv("ALLOWED_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "http://localhost:5173"
	}

	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)
	s.router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{allowedOrigin},
		AllowedMethods:   []string{"GET", "POST"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}))

	s.router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// 公開ルート
	s.router.Post("/api/auth/register", s.handleRegister)
	s.router.Post("/api/auth/login", s.handleLogin)
	s.router.Post("/api/auth/logout", s.handleLogout)

	// 認証必須ルート
	s.router.Group(func(r chi.Router) {
		r.Use(s.authMiddleware)
		r.Get("/api/auth/me", s.handleMe)
		r.Get("/api/images", s.handleGetImages)
		r.Post("/api/feedback", s.handlePostFeedback)
		r.Get("/api/recommend", s.handleGetRecommend)
		r.Get("/api/likes", s.handleGetLikes)
	})
}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("token")
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		userID, err := auth.ValidateToken(cookie.Value, s.jwtSecret)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), ctxUserID, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
