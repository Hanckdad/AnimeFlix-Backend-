const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// List of proxies (akan dirotate)
const PROXIES = [
  { name: 'Direct', url: '' },
  { name: 'CorsAnywhere', url: 'https://cors-anywhere.herokuapp.com/' },
  { name: 'AllOrigins', url: 'https://api.allorigins.win/raw?url=' },
  { name: 'CorsProxy', url: 'https://corsproxy.io/?' },
  { name: 'CodeTabs', url: 'https://api.codetabs.com/v1/proxy?quest=' },
  { name: 'ThingsProxy', url: 'https://thingproxy.freeboard.io/fetch/' }
];

const API_BASE = 'https://www.sankavollerei.com/anime';

// Cache system
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function to rotate proxies
let currentProxyIndex = 0;
function getNextProxy() {
  const proxy = PROXIES[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % PROXIES.length;
  return proxy;
}

// Main proxy function dengan retry mechanism
async function fetchWithProxy(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const proxy = getNextProxy();
    const targetUrl = proxy.url ? proxy.url + encodeURIComponent(url) : url;
    
    console.log(`Attempt ${attempt + 1} with proxy: ${proxy.name}`);
    
    try {
      const response = await axios.get(targetUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.sankavollerei.com/'
        }
      });

      if (response.status === 200) {
        console.log(`✅ Success with proxy: ${proxy.name}`);
        return response.data;
      }
    } catch (error) {
      console.log(`❌ Proxy ${proxy.name} failed:`, error.message);
      
      // Jika ini attempt terakhir, throw error
      if (attempt === retries - 1) {
        throw new Error(`All proxies failed: ${error.message}`);
      }
      
      // Tunggu sebelum retry
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

// Cache helper functions
function getFromCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

function setToCache(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

// API Routes

// Home endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'AnimeFlix Backend API',
    version: '1.0.0',
    endpoints: [
      '/api/latest',
      '/api/ongoing',
      '/api/completed/:page?',
      '/api/search/:query',
      '/api/anime/:slug',
      '/api/episode/:slug',
      '/api/schedule',
      '/api/genres',
      '/api/genre/:slug'
    ]
  });
});

// Latest anime
app.get('/api/latest', async (req, res) => {
  try {
    const cacheKey = 'latest';
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    // Coba berbagai endpoint untuk latest anime
    const endpoints = [
      '/neko/latest',
      '/anime/home',
      '/anime/ongoing-anime'
    ];

    let data = null;
    for (const endpoint of endpoints) {
      try {
        data = await fetchWithProxy(API_BASE + endpoint);
        if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
          console.log(`✅ Success with endpoint: ${endpoint}`);
          break;
        }
      } catch (error) {
        console.log(`❌ Endpoint ${endpoint} failed:`, error.message);
        continue;
      }
    }

    if (!data) {
      return res.status(500).json({ error: 'Failed to fetch latest anime' });
    }

    setToCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/latest:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ongoing anime
app.get('/api/ongoing', async (req, res) => {
  try {
    const cacheKey = 'ongoing';
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const data = await fetchWithProxy(API_BASE + '/anime/ongoing-anime');
    setToCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/ongoing:', error);
    res.status(500).json({ error: error.message });
  }
});

// Completed anime
app.get('/api/completed/:page?', async (req, res) => {
  try {
    const page = req.params.page || '1';
    const cacheKey = `completed-${page}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const data = await fetchWithProxy(API_BASE + `/anime/complete-anime/${page}`);
    setToCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/completed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search anime
app.get('/api/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const cacheKey = `search-${query}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const data = await fetchWithProxy(API_BASE + `/anime/search/${encodeURIComponent(query)}`);
    setToCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/search:', error);
    res.status(500).json({ error: error.message });
  }
});

// Anime detail
app.get('/api/anime/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const cacheKey = `anime-${slug}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const data = await fetchWithProxy(API_BASE + `/anime/anime/${slug}`);
    setToCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/anime:', error);
    res.status(500).json({ error: error.message });
  }
});

// Episode detail
app.get('/api/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const cacheKey = `episode-${slug}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const data = await fetchWithProxy(API_BASE + `/anime/episode/${slug}`);
    setToCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/episode:', error);
    res.status(500).json({ error: error.message });
  }
});

// Schedule
app.get('/api/schedule', async (req, res) => {
  try {
    const cacheKey = 'schedule';
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const data = await fetchWithProxy(API_BASE + '/anime/schedule');
    setToCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// Genres list
app.get('/api/genres', async (req, res) => {
  try {
    const cacheKey = 'genres';
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const data = await fetchWithProxy(API_BASE + '/anime/genre');
    setToCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/genres:', error);
    res.status(500).json({ error: error.message });
  }
});

// Genre anime list
app.get('/api/genre/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const cacheKey = `genre-${slug}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const data = await fetchWithProxy(API_BASE + `/anime/genre/${slug}`);
    setToCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/genre:', error);
    res.status(500).json({ error: error.message });
  }
});

// Samehadaku endpoints
app.get('/api/samehadaku/:endpoint', async (req, res) => {
  try {
    const { endpoint } = req.params;
    const cacheKey = `samehadaku-${endpoint}`;
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const data = await fetchWithProxy(API_BASE + `/anime/samehadaku/${endpoint}`);
    setToCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/samehadaku:', error);
    res.status(500).json({ error: error.message });
  }
});

// Server streaming
app.get('/api/server/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    
    // Untuk server, kita tidak cache karena sering berubah
    const data = await fetchWithProxy(API_BASE + `/anime/server/${serverId}`);
    res.json(data);
  } catch (error) {
    console.error('Error in /api/server:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    cacheSize: cache.size,
    activeProxies: PROXIES.length
  });
});

// Clear cache endpoint (untuk development)
app.delete('/cache', (req, res) => {
  const previousSize = cache.size;
  cache.clear();
  res.json({ 
    message: 'Cache cleared', 
    previousSize, 
    currentSize: cache.size 
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 AnimeFlix Backend running on port ${PORT}`);
  console.log(`📡 Proxies available: ${PROXIES.length}`);
  console.log(`💾 Cache enabled: ${CACHE_DURATION / 1000} seconds`);
  console.log(`🔗 API Base: ${API_BASE}`);
});