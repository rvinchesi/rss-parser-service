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

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'RSS Parser for Watch Collector App',
    version: '1.0.0'
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
