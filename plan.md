# **Technical Specification: Custom NoSQL JSON Database**

## **Project Name Suggestions**

Choosing a strong name gives the project a professional identity. Good options include JSONVault, DiskNode DB, SwiftStore API, or simply FileBase. For this documentation, we will refer to the project as JSONVault. This will be based on GO LANG

## **Project Overview**

JSONVault is a custom built NoSQL database that stores information entirely as standard JSON text files on the host computer's hard drive. It is designed to be accessed remotely through a standard REST API. The core purpose of this project is to provide a production ready, lightweight storage solution that does not require massive database engines. By utilizing the file system directly, it makes backups and data inspection incredibly easy. It proves that intelligent software design can make simple file storage fast and reliable enough for real world applications.

## **Technical Architecture**

The system relies on a hybrid approach combining disk storage and temporary memory. The database treats the file system as its source of truth. Every collection is a folder, and every document is a JSON file within that folder. This ensures that data is permanently saved. Collections can be created programmatically via explicit API calls, or they can be created automatically when the very first document is inserted into them.

To achieve high speeds, the system uses a Least Recently Used memory cache. When a file is requested, the application reads it from the hard drive and keeps a copy in the server's RAM. Future requests for that same file are served instantly from memory. To prevent the server from crashing due to memory limits, the cache has a strict maximum capacity. When the limit is reached, the system automatically ejects the oldest, least accessed data from memory.

Concurrency control is managed through strict application level locking. If multiple users attempt to edit the same collection or file at the exact same moment, the database issues read and write locks to process them one at a time. To prevent data corruption during unexpected power losses, the system uses atomic writes. It saves new data to a temporary file first and then instantly renames it to replace the original file, guaranteeing that a document is never left half written.

## **Security Architecture**

A database must be protected from unauthorized access. JSONVault implements a mandatory API Key security layer. The server will run on a configurable base URL and port. For production deployments, this server must be placed behind a reverse proxy configured with SSL certificates to encrypt the network traffic and protect the API keys from being intercepted.

Every incoming request must include an Authorization header containing a valid API key formatted as a Bearer token. The server will intercept all requests, verify the API key against a secure environment file, and immediately reject any invalid requests with a 401 Unauthorized status. This ensures that only authenticated application servers can read or modify the JSON files.

## **API Endpoint Specifications**

The application communicates entirely through standard REST HTTP methods. All requests and responses must be formatted as JSON. The endpoints are divided into collection management and document management.

For collection management, developers can create a new empty collection folder programmatically by sending a POST request to /api/v1/collections with the desired name in the body. If the collection already exists, the server will safely ignore the creation attempt and return a success response without altering the existing folder. A GET request to /api/v1/collections will return an array of all currently existing collections. A DELETE request to /api/v1/collections/:collection will permanently delete the collection folder and all of its contained JSON documents.

For document management, sending a POST request to /api/v1/:collection creates a new document. If the collection folder does not exist, the server will automatically create it first, generate a unique ID, create the file, and return the new document ID. A GET request to /api/v1/:collection returns a list of all documents inside that collection. A GET request to /api/v1/:collection/:id retrieves a specific document. A PUT request to /api/v1/:collection/:id updates an existing document by overwriting the file on disk and updating the memory cache. A DELETE request to /api/v1/:collection/:id removes a document completely from both the hard drive and the memory cache.

## **Core System Pseudocode**

To clarify the internal mechanics of the database, the following pseudocode outlines the two most critical operations. The first is the atomic write process which guarantees data safety during unexpected crashes. The second is the LRU cache mechanism which keeps memory usage strictly controlled while serving documents quickly.

// Atomic Document Save  
function saveDocument(collectionName, documentId, jsonData) {  
  lockWrite(collectionName);  
    
  let tempPath \= "/data/temp\_" \+ documentId \+ ".json";  
  let finalPath \= "/data/" \+ collectionName \+ "/" \+ documentId \+ ".json";  
    
  writeFile(tempPath, jsonData);  
  renameFile(tempPath, finalPath); // Operating system level atomic swap  
    
  updateMemoryCache(documentId, jsonData);  
  unlockWrite(collectionName);  
}

// LRU Cache Document Fetch  
function getDocument(collectionName, documentId) {  
  let documentKey \= collectionName \+ "/" \+ documentId;  
    
  if (memoryCache.contains(documentKey)) {  
    memoryCache.moveToFront(documentKey);  
    return memoryCache.get(documentKey);  
  }  
    
  let diskData \= readFile("/data/" \+ documentKey \+ ".json");  
    
  if (memoryCache.size() \>= MAX\_CACHE\_LIMIT) {  
    let oldestKey \= memoryCache.getLeastRecentlyUsedKey();  
    memoryCache.remove(oldestKey);  
  }  
    
  memoryCache.insert(documentKey, diskData);  
  return diskData;  
}

## **Client Integration**

Developers consuming this database need a stable way to connect regardless of the programming language they use. Because JSONVault uses a standard REST API, any language that can send HTTP requests can serve as a client.

A robust client implementation must handle constructing the target URL, attaching the Authorization header, parsing the returned JSON, and catching network errors. Below is a universal standard cURL example, followed by a lightweight Javascript wrapper that demonstrates how a developer would actually integrate this into a real application codebase.

\# Standard network request test using cURL  
curl \-X POST \[https://db.yourdomain.com/api/v1/users\](https://db.yourdomain.com/api/v1/users) \\  
  \-H "Authorization: Bearer your\_secret\_api\_key" \\  
  \-H "Content-Type: application/json" \\  
  \-d '{"name": "Alice", "age": 30}'

// Minimal application client integration  
class DatabaseClient {  
  constructor(baseUrl, apiKey) {  
    this.baseUrl \= baseUrl;  
    this.headers \= {  
      'Content-Type': 'application/json',  
      'Authorization': \`Bearer ${apiKey}\`  
    };  
  }

  async request(endpoint, method \= 'GET', body \= null) {  
    const options \= { method, headers: this.headers };  
    if (body) options.body \= JSON.stringify(body);  
      
    const response \= await fetch(\`${this.baseUrl}${endpoint}\`, options);  
    if (\!response.ok) {  
      throw new Error(\`Database error: ${response.statusText}\`);  
    }  
    return response.json();  
  }

  // Helper methods for clean application code  
  getDoc(collection, id) {  
    return this.request(\`/api/v1/${collection}/${id}\`);  
  }

  saveDoc(collection, data) {  
    return this.request(\`/api/v1/${collection}\`, 'POST', data);  
  }  
}

// Usage in an application  
const db \= new DatabaseClient('\[https://db.yourdomain.com\](https://db.yourdomain.com)', 'your\_secret\_api\_key');  
const newUser \= await db.saveDoc('users', { name: "Alice", active: true });  