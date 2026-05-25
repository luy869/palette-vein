package wallhaven

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
)

const baseURL = "https://wallhaven.cc/api/v1"

type Client struct {
	http *http.Client
}

func NewClient() *Client {
	return &Client{http: &http.Client{}}
}

type Thumbs struct {
	Small    string `json:"small"`
	Original string `json:"original"`
}

type SearchResult struct {
	ID         string `json:"id"`
	URL        string `json:"url"`
	Path       string `json:"path"`
	DimensionX int    `json:"dimension_x"`
	DimensionY int    `json:"dimension_y"`
	Ratio      string `json:"ratio"`
	Views      int    `json:"views"`
	Favorites  int    `json:"favorites"`
	Thumbs     Thumbs `json:"thumbs"`
}

type searchResponse struct {
	Data []SearchResult `json:"data"`
}

func (c *Client) Search(ctx context.Context, sorting string, page int) ([]SearchResult, error) {
	params := url.Values{}
	params.Set("sorting", sorting)
	params.Set("page", strconv.Itoa(page))

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
