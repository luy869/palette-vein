package main

import (
	"context"
	"log"
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
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://palettevein:palettevein@localhost:5433/palettevein"
	}

	pool, err := db.NewPool(ctx, dsn)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer pool.Close()

	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		migrationsDir = "migrations"
	}
	if err := db.RunMigrations(ctx, pool, migrationsDir); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	log.Println("migrations OK")

	clipAddr := os.Getenv("CLIP_ADDR")
	if clipAddr == "" {
		clipAddr = "localhost:50051"
	}
	clipClient, err := clip.Dial(clipAddr)
	if err != nil {
		log.Fatalf("dial clip: %v", err)
	}
	defer clipClient.Close()

	eq := embedder.New(pool, clipClient)
	go eq.Run(ctx)
	go eq.RunCatchup(ctx)

	jwtSecret := []byte(os.Getenv("JWT_SECRET"))
	if len(jwtSecret) == 0 {
		log.Fatal("JWT_SECRET environment variable is required")
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
		log.Printf("listening on :8080")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down...")
	cancel() // embedder / crawler に停止を通知

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("server shutdown: %v", err)
	}
	log.Println("bye")
}
