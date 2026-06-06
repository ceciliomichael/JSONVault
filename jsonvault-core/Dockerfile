FROM golang:alpine AS builder

WORKDIR /app

# Install git and build-base for CGO if needed
RUN apk add --no-cache git build-base

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
COPY . .

# Build a static binary with optimizations (-w -s strips debug symbols for smaller size)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o jsonvault ./cmd/jsonvault

FROM alpine:latest

WORKDIR /app

# Install required packages:
# ca-certificates: for outgoing TLS/SSL calls
# tzdata: for timezone support
# su-exec: for secure privilege dropping (similar to gosu)
RUN apk add --no-cache ca-certificates tzdata su-exec

# Create a dedicated, unprivileged system user and group
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy the binary and entrypoint script from the builder
COPY --from=builder /app/jsonvault .
COPY entrypoint.sh .

# Ensure the entrypoint script is executable
RUN chmod +x entrypoint.sh

# The application runs on port 8080
EXPOSE 5766

# We start as root via ENTRYPOINT to fix host-volume permissions, 
# then immediately drop to 'appuser' via su-exec before running the CMD.
ENTRYPOINT ["/app/entrypoint.sh"]

# Default command executed by the entrypoint
CMD ["./jsonvault"]
