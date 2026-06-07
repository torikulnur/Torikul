// State Config
let allChannels = [];
let favoriteChannels = JSON.parse(localStorage.getItem('tTechFavs')) || [];
let currentCategory = 'all';

// Direct API Mapping with CORS Proxies
const apiRoutes = {
    all: "https://api.allorigins.win/raw?url=https://iptv-org.github.io/api/streams.json",
    sports: "https://api.allorigins.win/raw?url=https://iptv-org.github.io/api/categories/sports.json",
    movies: "https://api.allorigins.win/raw?url=https://iptv-org.github.io/api/categories/movies.json",
    news: "https://api.allorigins.win/raw?url=https://iptv-org.github.io/api/categories/news.json",
    music: "https://api.allorigins.win/raw?url=https://iptv-org.github.io/api/categories/music.json"
};

// Hardcoded Fallback to Foridul's Local DB
const fallbackUrl = "https://raw.githubusercontent.com/foridul422/IPTV-/main/channels.json";

// Dom Elements
const channelGrid = document.getElementById('channel-grid');
const skeletonLoader = document.getElementById('skeleton-loader');
const videoPlayer = document.getElementById('video-player');
const nowPlaying = document.getElementById('now-playing');
const searchInput = document.getElementById('search-input');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initCategories();
    initSearch();
    loadChannels('all'); // On load, fetch 'all'
});

// 1. Dual-Source Dynamic Fetching
async function loadChannels(category) {
    showLoader(true);
    currentCategory = category;
    
    try {
        // Step 1: Try Primary Category API
        const response = await fetch(apiRoutes[category]);
        if (!response.ok) throw new Error("Primary API Failed");
        
        let data = await response.json();
        
        // Handle AllOrigins Wrapper format if detected
        if(data.contents) data = JSON.parse(data.contents);

        allChannels = data.slice(0, 150); // Optimization for smooth mobile scrolling
        renderGrid(allChannels, channelGrid);
        
    } catch (error) {
        console.warn("Primary API Blocked. Switching to Foridul Fallback Database...");
        loadFallbackData(category);
    }
}

// 2. Fallback Logic (Foridul JSON Parser + Local Filtering)
async function loadFallbackData(category) {
    try {
        const response = await fetch(fallbackUrl);
        const data = await response.json();
        
        // If 'all', show everything. If specific, match text filters locally
        if (category === 'all') {
            allChannels = data;
        } else {
            allChannels = data.filter(ch => {
                const name = ch.name ? ch.name.toLowerCase() : '';
                const group = ch.group ? ch.group.toLowerCase() : '';
                return name.includes(category) || group.includes(category);
            });
        }
        
        renderGrid(allChannels, channelGrid);
    } catch (err) {
        channelGrid.innerHTML = `<p class="error-msg">Error loading channels. Please try again later.</p>`;
        showLoader(false);
    }
}

// 3. UI Renderer
function renderGrid(channels, container) {
    container.innerHTML = '';
    showLoader(false);
    
    if(channels.length === 0) {
        container.innerHTML = `<p class="error-msg">No channels found in this category.</p>`;
        return;
    }

    channels.forEach(channel => {
        // Dynamic key mapper handling both APIs
        const name = channel.name || channel.channel;
        const url = channel.url;
        const logo = channel.logo || `https://via.placeholder.com/50/1e293b/fff?text=TV`;
        const isFav = favoriteChannels.some(f => f.url === url);

        const card = document.createElement('div');
        card.className = 'channel-card';
        card.innerHTML = `
            <button class="fav-btn ${isFav ? 'active' : ''}"><i class="fas fa-heart"></i></button>
            <img class="channel-logo" src="${logo}" onerror="this.src='https://via.placeholder.com/50/1e293b/fff?text=TV'">
            <div class="channel-name">${name}</div>
        `;

        // Play Channel click
        card.addEventListener('click', (e) => {
            if(e.target.closest('.fav-btn')) return; // Ignore if clicked fav
            playStream(url, name);
        });

        // Add to Favorites action
        const favBtn = card.querySelector('.fav-btn');
        favBtn.addEventListener('click', () => toggleFavorite(channel, favBtn));

        container.appendChild(card);
    });
}

// Play .m3u8 Fluid Logic
function playStream(url, name) {
    nowPlaying.innerText = `Streaming: ${name}`;
    if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(videoPlayer);
    } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        videoPlayer.src = url;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 4. Category Tab Switch Action
function initCategories() {
    document.querySelectorAll('.category-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            loadChannels(btn.dataset.category);
        });
    });
}

// 5. Search Filtering
function initSearch() {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allChannels.filter(ch => {
            const name = (ch.name || ch.channel || '').toLowerCase();
            return name.includes(query);
        });
        renderGrid(filtered, channelGrid);
    });
}

// 6. Navigation Tabs
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            
            item.classList.add('active');
            const target = item.dataset.target;
            document.getElementById(target).classList.add('active');
            
            if(target === 'screen-favorites') {
                renderGrid(favoriteChannels, document.getElementById('favorites-grid'));
            }
        });
    });
}

// Favorites Controller
function toggleFavorite(channel, btn) {
    const url = channel.url;
    const index = favoriteChannels.findIndex(f => f.url === url);
    
    if(index > -1) {
        favoriteChannels.splice(index, 1);
        btn.classList.remove('active');
    } else {
        favoriteChannels.push(channel);
        btn.classList.add('active');
    }
    localStorage.setItem('tTechFavs', JSON.stringify(favoriteChannels));
}

function showLoader(visible) {
    if(visible) {
        skeletonLoader.style.display = 'grid';
        channelGrid.style.display = 'none';
    } else {
        skeletonLoader.style.display = 'none';
        channelGrid.style.display = 'grid';
    }
}
