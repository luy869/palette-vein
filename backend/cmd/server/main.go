package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"palettevein/internal/api"
	"palettevein/internal/clip"
	"palettevein/internal/db"
	"palettevein/internal/embedder"
	"palettevein/internal/wallhaven"
)

func main() {
	ctx := context.Background()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://palettevein:palettevein@localhost:5432/palettevein"
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
	if err := eq.Catchup(ctx); err != nil {
		log.Printf("embedder catchup: %v", err)
	}

	jwtSecret := []byte(os.Getenv("JWT_SECRET"))
	if len(jwtSecret) == 0 {
		log.Fatal("JWT_SECRET environment variable is required")
	}

	wh := wallhaven.NewClient()
	srv := api.NewServer(pool, wh, eq, jwtSecret)

	addr := ":8080"
	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, srv); err != nil {
		log.Fatalf("server: %v", err)
	}
}
