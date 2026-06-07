package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"jsonvault/internal/auth"
)

func (s *Server) handleCollections(c *gin.Context) {
	database := c.Param("database")
	switch c.Request.Method {
	case http.MethodGet:
		if !s.hasCapabilityFor(c, auth.CapabilityMetadataRead, database, allowedCollectionConstraint(c)) &&
			!s.hasCapabilityFor(c, auth.CapabilityDocumentsRead, database, allowedCollectionConstraint(c)) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		collections, err := s.store.ListCollections(database)
		if err != nil {
			s.handleStoreError(c, err)
			return
		}
		if collConstraint := allowedCollectionConstraint(c); collConstraint != "*" {
			filtered := []string{}
			for _, collection := range collections {
				if collection == collConstraint {
					filtered = append(filtered, collection)
					break
				}
			}
			c.JSON(http.StatusOK, filtered)
			return
		}
		c.JSON(http.StatusOK, collections)
	case http.MethodPost:
		var req createNameRequest
		if !s.bindJSON(c, &req) {
			return
		}
		if !s.hasCapabilityFor(c, auth.CapabilityCollectionsManage, database, req.Name) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "collections:manage capability required"})
			return
		}
		created, err := s.store.CreateCollection(database, req.Name)
		if err != nil {
			s.handleStoreError(c, err)
			return
		}
		status := http.StatusOK
		if created {
			status = http.StatusCreated
		}
		c.JSON(status, gin.H{
			"name":    req.Name,
			"created": created,
		})
		s.audit.append(auditRecord{Actor: tokenID(c), Action: "collection.create", Database: database, Collection: req.Name, Status: "ready"})
	default:
		c.AbortWithStatus(http.StatusMethodNotAllowed)
	}
}

func allowedCollectionConstraint(c *gin.Context) string {
	raw, _ := c.Get("jwt_coll")
	collection, _ := raw.(string)
	if collection == "" {
		return "*"
	}
	return collection
}
