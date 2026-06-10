package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"palettevein/internal/api"
	"palettevein/internal/clip"
	"palettevein/internal/crawler"
	"palettevein/internal/db"
	"palettevein/internal/embedder"
	"palettevein/internal/wallhaven"
)

func main() {
	var handler slog.Handler = slog.NewTextHandler(os.Stderr, nil)
	if os.Getenv("LOG_FORMAT") == "json" {
		handler = slog.NewJSONHandler(os.Stderr, nil)
	}
	slog.SetDefault(slog.New(handler))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://palettevein:palettevein@localhost:5433/palettevein"
	}

	pool, err := db.NewPool(ctx, dsn)
	if err != nil {
		slog.Error("connect db", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		migrationsDir = "migrations"
	}
	if err := db.RunMigrations(ctx, pool, migrationsDir); err != nil {
		slog.Error("migrate", "error", err)
		os.Exit(1)
	}
	slog.Info("migrations OK")

	clipAddr := os.Getenv("CLIP_ADDR")
	if clipAddr == "" {
		clipAddr = "localhost:50051"
	}
	clipClient, err := clip.Dial(clipAddr)
	if err != nil {
		slog.Error("dial clip", "error", err)
		os.Exit(1)
	}
	defer clipClient.Close()

	eq := embedder.New(pool, clipClient)
	go eq.Run(ctx)
	go eq.RunCatchup(ctx)

	jwtSecret := []byte(os.Getenv("JWT_SECRET"))
	if len(jwtSecret) == 0 {
		slog.Error("JWT_SECRET environment variable is required")
		os.Exit(1)
	}

	secureCookie := os.Getenv("SECURE_COOKIE") != "false"

	wh := wallhaven.NewClient()
	cr := crawler.New(pool, wh, eq)
	go cr.Run(ctx)

	apiServer := api.NewServer(ctx, pool, wh, eq, cr, clipClient, jwtSecret, secureCookie)

	srv := &http.Server{
		Addr:    ":8080",
		Handler: apiServer,
	}

	go func() {
		slog.Info("listening on :8080")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down...")
	cancel() // embedder / crawler に停止を通知

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("server shutdown", "error", err)
	}
	slog.Info("bye")
}
