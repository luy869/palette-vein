package api

import (
	"context"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"
	"github.com/jackc/pgx/v5/pgxpool"

	"palettevein/internal/auth"
	"palettevein/internal/clip"
	"palettevein/internal/crawler"
	"palettevein/internal/embedder"
	"palettevein/internal/wallhaven"
)

type contextKey string

const ctxUserID contextKey = "userID"
const ctxIsAdmin contextKey = "isAdmin"

type Server struct {
	db        *pgxpool.Pool
	wh        *wallhaven.Client
	embedder  *embedder.Queue
	crawler   *crawler.Crawler
	clip      *clip.Client
	jwtSecret []byte
	router    *chi.Mux
}

func NewServer(db *pgxpool.Pool, wh *wallhaven.Client, eq *embedder.Queue, cr *crawler.Crawler, clipClient *clip.Client, jwtSecret []byte) *Server {
	s := &Server{
		db:        db,
		wh:        wh,
		embedder:  eq,
		crawler:   cr,
		clip:      clipClient,
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
		AllowedMethods:   []string{"GET", "POST", "DELETE"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}))
	s.router.Use(httprate.LimitByIP(60, time.Minute))

	s.router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// 公開ルート（認証エンドポイントは厳しく制限）
	authLimiter := httprate.LimitByIP(10, time.Minute)
	s.router.With(authLimiter).Post("/api/auth/register", s.handleRegister)
	s.router.With(authLimiter).Post("/api/auth/login", s.handleLogin)
	s.router.Post("/api/auth/logout", s.handleLogout)

	// 認証必須ルート
	s.router.Group(func(r chi.Router) {
		r.Use(s.authMiddleware)
		r.Get("/api/auth/me", s.handleMe)
		r.Get("/api/images", s.handleGetImages)
		r.Get("/api/discover", s.handleDiscover)
		r.Post("/api/feedback", s.handlePostFeedback)
		r.Get("/api/recommend", s.handleGetRecommend)
		r.Get("/api/likes", s.handleGetLikes)
		r.Get("/api/search", s.handleSearch)
		r.Post("/api/search/image", s.handleSearchImage)
		r.Get("/api/search/color", s.handleSearchColor)
		r.Get("/api/profile/palette", s.handleProfilePalette)
		r.Delete("/api/feedback", s.handleDeleteFeedback)
	})

	// 管理者専用ルート
	s.router.Group(func(r chi.Router) {
		r.Use(s.authMiddleware)
		r.Use(s.adminMiddleware)
		r.Get("/api/admin/stats", s.handleAdminStats)
		r.Get("/api/admin/users", s.handleAdminUsers)
		r.Post("/api/admin/crawl", s.handleAdminCrawl)
	})
}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("token")
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		userID, isAdmin, err := auth.ValidateToken(cookie.Value, s.jwtSecret)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), ctxUserID, userID)
		ctx = context.WithValue(ctx, ctxIsAdmin, isAdmin)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) adminMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		isAdmin, _ := r.Context().Value(ctxIsAdmin).(bool)
		if !isAdmin {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
