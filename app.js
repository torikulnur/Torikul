document.addEventListener('DOMContentLoaded', () => {
    
    const STATE = {
        allChannels: [],
        filteredChannels: [],
        favorites: JSON.parse(localStorage.getItem('iptv_favs')) || [],
        recentWatched: JSON.parse(localStorage.getItem('iptv_recents')) || [],
        activeCategory: 'all',
        activeCountry: 'all',
        searchQuery: '',
        currentStreamUrl: null
    };

    const CHANNELS_FEED_PRIMARY = "https://raw.githubusercontent.com/foridul422/IPTV-/main/channels.json";
    const IPTV_ORG_FALLBACK_API = "https://iptv-org.github.io/api/streams.json";

    const screenLoader = document.getElementById('screen-loader');
    const skeletonGrid = document.getElementById('skeleton-grid');
    const channelsGrid = document.getElementById('channels-grid');
    const emptyState = document.getElementById('empty-state');
    const liveCounter = document.getElementById('live-counter');
    const searchInput = document.getElementById('search-input');
    const countryFilter = document.getElementById('country-filter');
    const sectionTitle = document.getElementById('section-title');
    
    const playerContainer = document.getElementById('player-container');
    const videoElement = document.getElementById('video-element');
    const playerLoader = document.getElementById('player-loader');
    const nowPlayingTitle = document.getElementById('now-playing-title');
    const nowPlayingMeta = document.getElementById('now-playing-meta');
    const playerFavBtn = document.getElementById('player-fav-btn');
    const recentChannelsList = document.getElementById('recent-channels-list');
    
    let hlsInstance = null;

    function initClock() {
        setInterval(() => {
            const now = new Date();
            document.getElementById('realtime-clock').textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        }, 1000);
    }

    function initSkeletons() {
        let skeletonHTML = '';
        for(let i=0; i < 12; i++) {
            skeletonHTML += `
            <div class="bg-slate-950/40 border border-slate-800/50 rounded-xl p-4 space-y-3 animate-pulse">
                <div class="w-14 h-14 bg-slate-800 rounded-lg mx-auto"></div>
                <div class="h-3.5 bg-slate-800 rounded w-3/4 mx-auto"></div>
                <div class="h-2.5 bg-slate-800 rounded w-1/2 mx-auto"></div>
            </div>`;
        }
        skeletonGrid.innerHTML = skeletonHTML;
    }

    function playChannel(channel) {
        if (!channel.url) return;
        
        STATE.currentStreamUrl = channel.url;
        playerContainer.classList.remove('hidden');
        playerLoader.classList.remove('hidden');
        playerContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

        nowPlayingTitle.textContent = channel.name;
        nowPlayingMeta.textContent = `${channel.category.toUpperCase()} • ${channel.country || 'Global'}`;
        
        updatePlayerFavButton(channel.url);
        addToRecents(channel);

        if (Hls.isSupported()) {
            if (hlsInstance) hlsInstance.destroy();
            
            hlsInstance = new Hls({ maxBufferSize: 10 * 1000 * 1000 });
            hlsInstance.loadSource(channel.url);
            hlsInstance.attachMedia(videoElement);
            
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                videoElement.play();
                playerLoader.classList.add('hidden');
            });
            hlsInstance.on(Hls.Events.ERROR, function (event, data) {
                if (data.fatal) playerLoader.classList.add('hidden');
            });
        } 
        else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            videoElement.src = channel.url;
            videoElement.addEventListener('loadedmetadata', () => {
                videoElement.play();
                playerLoader.classList.add('hidden');
            });
        }
    }

    async function fetchChannelsData() {
        try {
            initSkeletons();
            let response = await fetch(CHANNELS_FEED_PRIMARY);
            let data = await response.json();
            
            let processed = (data.channels || data).map((ch, idx) => ({
                id: ch.id || `ch-${idx}`,
                name: ch.name || "Unknown Channel",
                url: ch.url || ch.stream_url,
                logo: ch.logo || "https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=120&auto=format&fit=crop",
                category: ch.category || "all",
                country: ch.country || "Global"
            }));

            if(processed.length < 200) {
                try {
                    const extRes = await fetch(IPTV_ORG_FALLBACK_API);
                    const extData = await extRes.json();
                    const mappedExt = extData.slice(0, 300).map((st, i) => ({
                        id: `torikul-ext-${i}`,
                        name: st.channel ? st.channel.replace(/-/g, ' ').toUpperCase() : "Global Stream",
                        url: st.url,
                        logo: "https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=120&auto=format&fit=crop",
                        category: i % 3 == 0 ? "sports" : (i % 3 == 1 ? "movies" : "news"),
                        country: "Global"
                    }));
                    processed = [...processed, ...mappedExt];
                } catch(e) { console.log("External fallback bypass active."); }
            }

            STATE.allChannels = processed;
            buildCountryDropdown();
            renderChannelSystem();
            updateCountBadges();
            
        } catch (error) {
            console.error("Data processing error:", error);
            channelsGrid.innerHTML = `<p class='text-red-400 text-center col-span-full py-10'>Failed to load stream servers. Check connections.</p>`;
        } finally {
            screenLoader.classList.add('opacity-0');
            setTimeout(() => screenLoader.remove(), 500);
            skeletonGrid.classList.add('hidden');
            channelsGrid.classList.remove('hidden');
        }
    }

    function buildCountryDropdown() {
        const countries = [...new Set(STATE.allChannels.map(c => c.country))].filter(Boolean);
        countries.forEach(country => {
            const opt = document.createElement('option');
            opt.value = country.toLowerCase();
            opt.textContent = country;
            countryFilter.appendChild(opt);
        });
    }

    function renderChannelSystem() {
        STATE.filteredChannels = STATE.allChannels.filter(ch => {
            const matchSearch = ch.name.toLowerCase().includes(STATE.searchQuery) || 
                                ch.category.toLowerCase().includes(STATE.searchQuery) ||
                                ch.country.toLowerCase().includes(STATE.searchQuery);
            
            const matchCategory = (STATE.activeCategory === 'all') || 
                                  (STATE.activeCategory === 'favorites' && STATE.favorites.includes(ch.url)) ||
                                  (ch.category.toLowerCase() === STATE.activeCategory);
                                  
            const matchCountry = (STATE.activeCountry === 'all') || (ch.country.toLowerCase() === STATE.activeCountry);

            return matchSearch && matchCategory && matchCountry;
        });

        channelsGrid.innerHTML = '';
        if(STATE.filteredChannels.length === 0) {
            emptyState.classList.remove('hidden');
            liveCounter.textContent = "0 Channels Active";
            return;
        }
        
        emptyState.classList.add('hidden');
        liveCounter.textContent = `${STATE.filteredChannels.length} Channels Active`;

        STATE.filteredChannels.forEach(channel => {
            const isFav = STATE.favorites.includes(channel.url);
            const card = document.createElement('div');
            card.className = "glass-card border border-slate-800/60 rounded-2xl p-4 flex flex-col items-center text-center cursor-pointer relative group animate-fade-in";
            
            card.innerHTML = `
                <button class="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 text-sm p-1.5 rounded-lg bg-slate-900/80 border border-slate-700/40 transition-all ${isFav ? 'text-red-500 opacity-100' : 'text-slate-400 hover:text-red-500'}" data-action="fav">
                    <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </button>
                <div class="w-16 h-16 rounded-xl bg-slate-950 flex items-center justify-center p-2 mb-3 border border-slate-800/40 shadow-inner group-hover:border-blue-500/30 transition-colors">
                    <img src="${channel.logo}" alt="${channel.name}" class="max-w-full max-h-full object-contain rounded" onerror="this.src='https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=120&auto=format&fit=crop'">
                </div>
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-900 text-blue-400 border border-slate-800 uppercase tracking-wider text-[10px] mb-2">${channel.category}</span>
                <h3 class="font-bold text-sm text-slate-200 line-clamp-1 w-full group-hover:text-blue-400 transition-colors">${channel.name}</h3>
                <p class="text-slate-500 text-[11px] mt-0.5 flex items-center gap-1"><i class="fa-solid fa-earth-americas text-[10px]"></i> ${channel.country}</p>
            `;

            card.addEventListener('click', (e) => {
                if(e.target.closest('[data-action="fav"]')) {
                    e.stopPropagation();
                    toggleFavorite(channel.url);
                    renderChannelSystem();
                    return;
                }
                playChannel(channel);
            });

            channelsGrid.appendChild(card);
        });
    }

    function updateCountBadges() {
        document.getElementById('count-all').textContent = STATE.allChannels.length;
        document.getElementById('count-sports').textContent = STATE.allChannels.filter(c => c.category.toLowerCase() === 'sports').length;
        document.getElementById('count-movies').textContent = STATE.allChannels.filter(c => c.category.toLowerCase() === 'movies').length;
        document.getElementById('count-news').textContent = STATE.allChannels.filter(c => c.category.toLowerCase() === 'news').length;
        document.getElementById('count-kids').textContent = STATE.allChannels.filter(c => c.category.toLowerCase() === 'kids').length;
        document.getElementById('count-music').textContent = STATE.allChannels.filter(c => c.category.toLowerCase() === 'music').length;
        document.getElementById('count-favorites').textContent = STATE.favorites.length;
    }

    function toggleFavorite(url) {
        if(STATE.favorites.includes(url)) {
            STATE.favorites = STATE.favorites.filter(f => f !== url);
        } else {
            STATE.favorites.push(url);
        }
        localStorage.setItem('iptv_favs', JSON.stringify(STATE.favorites));
        updateCountBadges();
        updatePlayerFavButton(url);
    }

    function updatePlayerFavButton(url) {
        if(STATE.favorites.includes(url)) {
            playerFavBtn.innerHTML = `<i class="fa-solid fa-heart text-lg text-red-500"></i>`;
        } else {
            playerFavBtn.innerHTML = `<i class="fa-regular fa-heart text-lg"></i>`;
        }
    }

    function addToRecents(channel) {
        STATE.recentWatched = STATE.recentWatched.filter(r => r.url !== channel.url);
        STATE.recentWatched.unshift(channel);
        if(STATE.recentWatched.length > 5) STATE.recentWatched.pop();
        localStorage.setItem('iptv_recents', JSON.stringify(STATE.recentWatched));
        renderRecentList();
    }

    function renderRecentList() {
        recentChannelsList.innerHTML = '';
        if(STATE.recentWatched.length === 0) {
            recentChannelsList.innerHTML = `<p class="text-xs text-slate-600 text-center py-8">No channels watched recently</p>`;
            return;
        }
        STATE.recentWatched.forEach(ch => {
            const div = document.createElement('div');
            div.className = "flex items-center gap-3 bg-slate-900/60 hover:bg-slate-800/40 p-2 border border-slate-800/40 rounded-xl cursor-pointer transition-colors";
            div.innerHTML = `
                <img src="${ch.logo}" class="w-8 h-8 rounded bg-black object-contain p-1 border border-slate-800">
                <div class="flex-1 min-w-0">
                    <h4 class="text-xs font-bold text-slate-300 truncate">${ch.name}</h4>
                    <p class="text-[10px] text-slate-500 truncate capitalize">${ch.category}</p>
                </div>
                <i class="fa-solid fa-play text-[10px] text-blue-500 mr-2"></i>
            `;
            div.addEventListener('click', () => playChannel(ch));
            recentChannelsList.appendChild(div);
        });
    }

    searchInput.addEventListener('input', (e) => {
        STATE.searchQuery = e.target.value.toLowerCase().trim();
        renderChannelSystem();
    });

    countryFilter.addEventListener('change', (e) => {
        STATE.activeCountry = e.target.value;
        renderChannelSystem();
    });

    const handleMenuNavigation = (btn) => {
        const targetCategory = btn.getAttribute('data-category');
        STATE.activeCategory = targetCategory;
        
        document.querySelectorAll('#sidebar-menu button, .mobile-nav-btn').forEach(b => {
            if(b.getAttribute('data-category') === targetCategory) {
                b.className = b.className.replace('text-slate-400 hover:bg-slate-800/50', 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium shadow-md');
                b.className = b.className.replace('text-slate-500', 'text-blue-500 font-medium');
            } else {
                b.className = b.className.replace('bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium shadow-md', 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200');
                b.className = b.className.replace('text-blue-500 font-medium', 'text-slate-500');
            }
        });

        sectionTitle.innerHTML = `<i class="fa-solid fa-play text-blue-500 text-sm"></i> Showing ${targetCategory.toUpperCase()} Pack`;
        renderChannelSystem();
    };

    document.querySelectorAll('#sidebar-menu button, .mobile-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => handleMenuNavigation(btn));
    });

    playerFavBtn.addEventListener('click', () => {
        if(STATE.currentStreamUrl) {
            toggleFavorite(STATE.currentStreamUrl);
            renderChannelSystem();
        }
    });

    document.getElementById('hero-action-btn').addEventListener('click', () => {
        document.getElementById('section-title').scrollIntoView({ behavior: 'smooth' });
    });

    initClock();
    fetchChannelsData();
    renderRecentList();
});