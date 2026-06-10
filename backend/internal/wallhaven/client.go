package wallhaven

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"
)

const baseURL = "https://wallhaven.cc/api/v1"

const minRequestInterval = 1500 * time.Millisecond

type Client struct {
	http    *http.Client
	mu      sync.Mutex
	lastReq time.Time
}

func NewClient() *Client {
	return &Client{http: &http.Client{Timeout: 30 * time.Second}}
}

func (c *Client) waitRateLimit(ctx context.Context) error {
	c.mu.Lock()
	now := time.Now()
	next := c.lastReq.Add(minRequestInterval)
	if next.Before(now) {
		next = now
	}
	c.lastReq = next // 自分の送信予定時刻を予約（並行呼び出しは interval ずつ後ろに並ぶ）
	c.mu.Unlock()
	wait := next.Sub(now)
	if wait <= 0 {
		return nil
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(wait):
		return nil
	}
}

type Thumbs struct {
	Large    string `json:"large"`
	Small    string `json:"small"`
	Original string `json:"original"`
}

type SearchResult struct {
	ID         string   `json:"id"`
	URL        string   `json:"url"`
	Path       string   `json:"path"`
	DimensionX int      `json:"dimension_x"`
	DimensionY int      `json:"dimension_y"`
	Ratio      string   `json:"ratio"`
	Views      int      `json:"views"`
	Favorites  int      `json:"favorites"`
	Colors     []string `json:"colors"`
	Thumbs     Thumbs   `json:"thumbs"`
}

type searchResponse struct {
	Data []SearchResult `json:"data"`
}

func (c *Client) Search(ctx context.Context, sorting, query string, page int) ([]SearchResult, error) {
	if err := c.waitRateLimit(ctx); err != nil {
		return nil, err
	}

	params := url.Values{}
	params.Set("sorting", sorting)
	params.Set("page", strconv.Itoa(page))
	if query != "" {
		params.Set("q", query)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/search?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("wallhaven api returned status %d", resp.StatusCode)
	}

	var sr searchResponse
	if err := json.NewDecoder(resp.Body).Decode(&sr); err != nil {
		return nil, err
	}

	return sr.Data, nil
}
