package httpapi

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/xeipuuv/gojsonschema"
	"jsonvault/internal/auth"
)

func (s *Server) handleGetSchema(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	if !s.hasCapabilityFor(c, auth.CapabilityMetadataRead, database, collection) &&
		!s.hasCapabilityFor(c, auth.CapabilityDocumentsRead, database, collection) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}

	schema, err := s.store.GetSchema(database, collection)
	if err != nil {
		s.handleStoreError(c, err)
		return
	}

	if len(schema) == 0 {
		c.JSON(http.StatusOK, gin.H{"schema": nil})
		return
	}

	c.Data(http.StatusOK, "application/json", schema)
}

func (s *Server) handleValidateSchema(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	if !s.hasCapabilityFor(c, auth.CapabilitySchemasManage, database, collection) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "schemas:manage capability required"})
		return
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "failed to read body"})
		return
	}
	if _, err := gojsonschema.NewSchema(gojsonschema.NewBytesLoader(body)); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"valid": false, "error": "invalid json schema format", "details": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"valid": true})
}

func (s *Server) handleSetSchema(c *gin.Context) {
	database := c.Param("database")
	collection := c.Param("collection")
	if !s.hasCapabilityFor(c, auth.CapabilitySchemasManage, database, collection) {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "schemas:manage capability required"})
		return
	}

	if c.Request.Method == http.MethodDelete {
		if err := s.store.SetSchema(database, collection, nil); err != nil {
			s.handleStoreError(c, err)
			return
		}
		s.audit.append(auditRecord{Actor: tokenID(c), Action: "schema.delete", Database: database, Collection: collection, Status: "ready"})
		c.JSON(http.StatusOK, gin.H{"deleted": true})
		return
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "failed to read body"})
		return
	}

	// Validate that the uploaded schema is actually a valid JSON Schema
	schemaLoader := gojsonschema.NewBytesLoader(body)
	if _, err := gojsonschema.NewSchema(schemaLoader); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid json schema format", "details": err.Error()})
		return
	}

	// Compress the schema via json.Unmarshal/Marshal to remove whitespace
	var parsed map[string]interface{}
	if err := json.Unmarshal(body, &parsed); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid json format"})
		return
	}
	compressedBody, _ := json.Marshal(parsed)

	if err := s.store.SetSchema(database, collection, compressedBody); err != nil {
		s.handleStoreError(c, err)
		return
	}
	s.audit.append(auditRecord{Actor: tokenID(c), Action: "schema.set", Database: database, Collection: collection, Status: "ready"})

	c.JSON(http.StatusOK, gin.H{"updated": true})
}
