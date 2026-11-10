// RSS Parser Microservice for Watch Collector App
// Deploy on Railway.app, Render.com, or Glitch.com

const express = require('express');
const Parser = require('rss-parser');
const cors = require('cors');

const app = express();
const parser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'content'],
      ['media:content', 'media']
    ]
  }
});

// Enable CORS for Xano requests
app.use(cors());
app.use(express.json());

const ARTICLE_FETCH_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function isRejectedArticleImageUrl(url) {
  const u = (url || '').toLowerCase();
  if (!u.startsWith('http')) return true;
  if (/\/wp-content\/themes\//.test(u)) return true;
  if (/clinks-\d+\.png/.test(u)) return true;
  if (/s\.w\.org\/images\/core\/emoji/.test(u)) return true;
  return false;
}

function parseOgOrTwitterImageFromHtml(html) {
  const patterns = [
    /<meta\s+property=["']og:image["']\s+content=["']([^"']*)["']/i,
    /<meta\s+content=["']([^"']*)["']\s+property=["']og:image["']/i,
    /<meta\s+name=["']twitter:image["']\s+content=["']([^"']*)["']/i,
    /<meta\s+content=["']([^"']*)["']\s+name=["']twitter:image["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const raw = m && m[1] ? m[1].trim() : '';
    if (raw) {
      const decoded = decodeHtmlEntities(raw).trim();
      if (decoded && !isRejectedArticleImageUrl(decoded)) return decoded;
    }
  }
  return null;
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'RSS Parser for Watch Collector App',
    version: '1.1.0'
  });
});

// Parse RSS feed endpoint
app.get('/parse', async (req, res) => {
  try {
    const feedUrl = req.query.url;
    
    if (!feedUrl) {
      return res.status(400).json({ 
        error: 'Missing url parameter',
        usage: '/parse?url=YOUR_RSS_FEED_URL'
      });
    }

    // Parse the RSS feed
    const feed = await parser.parseURL(feedUrl);
    
    // Transform to clean article objects
    const articles = feed.items.map(item => ({
      title: item.title || '',
      url: item.link || '',
      guid: item.guid || item.link || '',
      author: item.creator || item['dc:creator'] || '',
      published_at: item.pubDate || item.isoDate || '',
      summary: item.contentSnippet || item.description || '',
      content: item.content || item['content:encoded'] || item.description || '',
      image_url: extractImageUrl(item)
    }));

    res.json({
      success: true,
      feed_title: feed.title,
      article_count: articles.length,
      articles: articles
    });

  } catch (error) {
    console.error('RSS parsing error:', error);
    res.status(500).json({ 
      error: 'Failed to parse RSS feed',
      message: error.message
    });
  }
});

/** Article page metadata — `og:image` for blogs that block Supabase edge fetch (e.g. Wine Enthusiast). */
app.get('/article-meta', async (req, res) => {
  try {
    const pageUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid url parameter',
        usage: '/article-meta?url=ARTICLE_PAGE_URL',
      });
    }

    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': ARTICLE_FETCH_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return res.json({
        success: true,
        image_url: null,
        http_status: response.status,
      });
    }

    const html = await response.text();
    let imageUrl = parseOgOrTwitterImageFromHtml(html);
    if (!imageUrl && html.length > 200) {
      const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
      let match;
      while ((match = imgRe.exec(html)) !== null) {
        const src = match[1];
        if (!isRejectedArticleImageUrl(src) && /\/wp-content\/uploads\//i.test(src)) {
          imageUrl = src;
          break;
        }
      }
    }

    return res.json({
      success: true,
      image_url: imageUrl,
    });
  } catch (error) {
    console.error('Article meta error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch article metadata',
      message: error.message,
    });
  }
});

// Helper function to extract image URL from various RSS formats
function extractImageUrl(item) {
  // Try media:content
  if (item.media && item.media.$ && item.media.$.url) {
    return item.media.$.url;
  }
  
  // Try enclosure
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }
  
  // Try itunes:image
  if (item.itunes && item.itunes.image) {
    return item.itunes.image;
  }
  
  // Try to extract from content
  if (item.content || item.description) {
    const content = item.content || item.description;
    const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
    if (imgMatch) {
      return imgMatch[1];
    }
  }
  
  return '';
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`RSS Parser running on port ${PORT}`);
});
