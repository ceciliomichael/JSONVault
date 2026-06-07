package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"jsonvault/internal/auth"
)

var (
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "jsonvault_http_requests_total",
			Help: "Total number of HTTP requests processed",
		},
		[]string{"method", "path", "status"},
	)

	httpRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "jsonvault_http_request_duration_seconds",
			Help:    "Duration of HTTP requests in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)

	storeOpenDatabases = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "jsonvault_store_open_databases",
		Help: "Number of currently open database handles",
	})

	storeDataBytes = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "jsonvault_store_data_bytes",
		Help: "Total bytes used by database files under the data directory",
	})

	storeSubscribers = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "jsonvault_sse_subscribers",
		Help: "Number of active SSE subscribers",
	})

	webhookQueueDepth = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "jsonvault_webhook_queue_depth",
		Help: "Current webhook queue depth",
	})
)

func MetricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		path := c.FullPath()
		if path == "" {
			path = "unknown" // handle 404s
		}

		c.Next()

		duration := time.Since(start).Seconds()
		status := strconv.Itoa(c.Writer.Status())

		httpRequestsTotal.WithLabelValues(c.Request.Method, path, status).Inc()
		httpRequestDuration.WithLabelValues(c.Request.Method, path).Observe(duration)
	}
}

func (s *Server) handleMetrics(c *gin.Context) {
	if !s.hasScope(c, auth.ScopeAdmin) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	stats := s.store.Stats()
	storeOpenDatabases.Set(float64(stats.OpenDatabases))
	storeDataBytes.Set(float64(stats.DataBytes))
	storeSubscribers.Set(float64(stats.Subscribers))
	webhookQueueDepth.Set(float64(stats.WebhookQueueDepth))

	promhttp.Handler().ServeHTTP(c.Writer, c.Request)
}
