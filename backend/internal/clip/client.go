package clip

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"palettevein/internal/clippb"
)

type Client struct {
	conn *grpc.ClientConn
	rpc  clippb.ClipServiceClient
}

func Dial(addr string) (*Client, error) {
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("dial clip: %w", err)
	}
	return &Client{conn: conn, rpc: clippb.NewClipServiceClient(conn)}, nil
}

func (c *Client) Close() error { return c.conn.Close() }

func (c *Client) Health(ctx context.Context) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	res, err := c.rpc.Health(ctx, &clippb.HealthRequest{})
	if err != nil {
		return "", err
	}
	return res.Model, nil
}

// Embed は画像URLのCLIPベクトル(512次元)を返す。CPU推論は重いため60秒タイムアウト。
func (c *Client) Embed(ctx context.Context, url string) ([]float32, error) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	res, err := c.rpc.Embed(ctx, &clippb.EmbedRequest{Url: url})
	if err != nil {
		return nil, err
	}
	return res.Vector, nil
}

func (c *Client) EmbedBytes(ctx context.Context, data []byte) ([]float32, error) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	res, err := c.rpc.Embed(ctx, &clippb.EmbedRequest{RawBytes: data})
	if err != nil {
		return nil, err
	}
	return res.Vector, nil
}

// EmbedText はテキストのCLIPベクトルを返す。
func (c *Client) EmbedText(ctx context.Context, text string) ([]float32, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	res, err := c.rpc.EmbedText(ctx, &clippb.EmbedTextRequest{Text: text})
	if err != nil {
		return nil, err
	}
	return res.Vector, nil
}
