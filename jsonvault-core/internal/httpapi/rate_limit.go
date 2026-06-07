package httpapi

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateLimiter struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	requests map[string]rateWindow
}

type rateWindow struct {
	count int
	start time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	if limit < 1 {
		limit = 1
	}
	if window <= 0 {
		window = time.Minute
	}
	return &rateLimiter{
		limit:    limit,
		window:   window,
		requests: make(map[string]rateWindow),
	}
}

func (l *rateLimiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	current := l.requests[key]
	if current.start.IsZero() || now.Sub(current.start) >= l.window {
		l.requests[key] = rateWindow{count: 1, start: now}
		return true
	}
	if current.count >= l.limit {
		return false
	}
	current.count++
	l.requests[key] = current
	return true
}

func (s *Server) rateLimitOperational() gin.HandlerFunc {
	return func(c *gin.Context) {
		if s.rateLimiter == nil {
			c.Next()
			return
		}
		key := strings.TrimSpace(c.GetHeader("Authorization"))
		if key == "" {
			key = c.ClientIP()
		}
		if !s.rateLimiter.allow(key, time.Now()) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": gin.H{"code": "rate_limited", "message": "too many operational requests"}})
			return
		}
		c.Next()
	}
}
