// Add this at the very top of your index.js file
console.log("Script started");
// Import required modules
const express = require('express');
const request = require('request');
const openBrowser = require('open');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');




// Create Express app
const app = express();
const PORT = 8888;

// Spotify configuration
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = 'user-read-playback-state user-modify-playback-state';
const TOKEN_PATH = path.join(__dirname, 'spotify_tokens.json');

// Replace these with your actual Spotify app credentials
const clientId = '797a432849884f95b73c669d4d74f326';
const clientSecret = '095129486f134ccdb12aed6293948cdf';

// Global variables
let accessToken = '';
let refreshToken = '';
let monitoringInterval;
let currentGame = null;

// Game configurations - replace with your actual games and playlist IDs
const gameConfigs = {
  'valorant.exe': '37i9dQZF1DX1L0MDB0oGJq',  // Example Valorant playlist
  'cs2.exe': '37i9dQZF1DX8CopunbDxgW', // Same playlist for CS2
  'LeagueOfLegends.exe': '37i9dQZF1DX0L75puRvaqV',  // Example LoL playlist,
  'FC25.exe':'315j5OaNjSO3C5AifquhBc'// some example fifa that i made
  // Add more games here
};

// Start the application
function startApp() {
  // Check if we have saved tokens
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
    // Validate token or refresh if needed
    validateToken();
  } catch (error) {
    // No tokens, start auth flow
    authorizeSpotify();
  }
}

// Start Spotify authorization flow
function authorizeSpotify() {
    const authUrl = 'https://accounts.spotify.com/authorize' +
    '?response_type=code' +
    '&client_id=' + clientId +
    '&scope=' + encodeURIComponent(SCOPES) +
    '&redirect_uri=' + encodeURIComponent(REDIRECT_URI);
    
    console.log('Please open this URL in your browser to authorize Spotify:');
    console.log(authUrl);
  }

// Validate token or refresh if expired
async function validateToken() {
  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (response.status === 401) {
      await refreshAccessToken();
    } else {
      startGameMonitoring();
    }
  } catch (error) {
    console.error('Token validation error:', error);
    await refreshAccessToken();
  }
}

// Refresh the access token
function refreshAccessToken() {
  return new Promise((resolve, reject) => {
    const options = {
      url: 'https://accounts.spotify.com/api/token',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      },
      form: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      },
      json: true
    };
    
    request.post(options, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        accessToken = body.access_token;
        
        // Save the new token
        const tokens = { access_token: accessToken, refresh_token: refreshToken };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        
        console.log('Token refreshed successfully');
        startGameMonitoring();
        resolve();
      } else {
        console.error('Error refreshing token:', error || body);
        reject(error || new Error('Failed to refresh token'));
      }
    });
  });
}

// Function to play a specific playlist
async function playPlaylist(playlistId) {
  console.log(`Playing playlist: ${playlistId}`);
  try {
    const response = await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        context_uri: `spotify:playlist:${playlistId}`
      })
    });
    
    if (response.status === 401) {
      await refreshAccessToken();
      await playPlaylist(playlistId);
    } else if (!response.ok) {
      console.error(`Failed to play: ${response.status} ${await response.text()}`);
    }
  } catch (error) {
    console.error('Play error:', error);
  }
}

// Function to check for running games
function checkRunningGames() {
  exec('tasklist /fo csv /nh', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return;
    }
    
    // Parse the CSV output to get process names
    const processes = stdout.split('\r\n').map(line => {
      const parts = line.split('","');
      return parts.length > 0 ? parts[0].replace('"', '') : '';
    }).filter(Boolean);
    
    // Check if any configured games are running
    let foundGame = false;
    
    for (const gameExe in gameConfigs) {
      if (processes.includes(gameExe)) {
        foundGame = true;
        
        // Only change music if this is a different game than what's currently playing
        if (currentGame !== gameExe) {
          console.log(`Game detected: ${gameExe}`);
          currentGame = gameExe;
          playPlaylist(gameConfigs[gameExe]);
        }
        break;
      }
    }
    
    // If no configured games are running and we were previously playing game music
    if (!foundGame && currentGame !== null) {
      console.log('No games running, returning to default state');
      currentGame = null;
      // Optional: Switch back to a default playlist
      // playPlaylist('YOUR_DEFAULT_PLAYLIST_ID');
    }
  });
}

function startGameMonitoring() {
  console.log('Starting game monitoring...');
  // Clear any existing interval
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }
  // Check for games every 15 seconds
  monitoringInterval = setInterval(checkRunningGames, 15000);
  // Do an initial check
  checkRunningGames();
}

// Handle the callback from Spotify
app.get('/callback', (req, res) => {
  const code = req.query.code || null;
  
  const authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    form: {
      code: code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    },
    headers: {
      'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
    },
    json: true
  };
  
  request.post(authOptions, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      accessToken = body.access_token;
      refreshToken = body.refresh_token;
      
      // Save tokens for reuse
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken
      }));
      
      res.send('Authorization successful! You can close this window.');
      startGameMonitoring();
    } else {
      res.send('Error during authorization. Please try again.');
    }
  });
});
// And before the final app.listen call
console.log("About to start server...");
// Start the server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  startApp();
});