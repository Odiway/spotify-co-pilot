#!/usr/bin/env node

// Spotify Co-Pilot Script
// This script detects application launches and automatically plays relevant playlists on Spotify

import dotenv from 'dotenv';
import express from 'express';
import open from 'open';
import fetch from 'node-fetch';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import activeWin from 'active-win';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current file directory with ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// Constants
const PORT = process.env.PORT || 8888;
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-read',
  'playlist-read-private',
  'playlist-modify-private',
  'playlist-modify-public'
].join(' ');

// Setup
const app = express();
let accessToken = null;
let refreshToken = null;
let userId = null;
let appWatcherInterval = null;
let lastActiveApp = '';
let isMonitoring = false;

// App-to-playlist mapping (can be customized by user)
let appPlaylists = {
  'csgo.exe': {
    name: 'Counter-Strike',
    playlistId: '37i9dQZF1DZ06evO45P0Eo', // Gaming playlist
    playlistName: 'Gaming Focus'
  },
  'chrome.exe': {
    name: 'Google Chrome',
    playlistId: '37i9dQZF1DX8NTLI2TtZa6', // Focus playlist
    playlistName: 'Deep Focus'
  },
  'firefox.exe': {
    name: 'Firefox',
    playlistId: '37i9dQZF1DX8NTLI2TtZa6', // Focus playlist
    playlistName: 'Deep Focus'
  },
  'code.exe': {
    name: 'Visual Studio Code',
    playlistId: '37i9dQZF1DX5trt9i14X7j', // Coding playlist
    playlistName: 'Coding Mode'
  },
  'zoom.exe': {
    name: 'Zoom',
    playlistId: '37i9dQZF1DWZeKCadgRdKQ', // Chill playlist
    playlistName: 'Chill Vibes'
  }
};

// Config file path
const configPath = path.join(process.env.HOME || process.env.USERPROFILE, '.spotify-copilot-config.json');

// CLI interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Generate a random string for state parameter
const generateRandomString = length => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

// Save configuration
function saveConfig() {
  const config = {
    refreshToken,
    appPlaylists
  };
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('Configuration saved.');
}

// Load configuration
function loadConfig() {
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      refreshToken = config.refreshToken || null;
      appPlaylists = config.appPlaylists || appPlaylists;
      return true;
    } catch (error) {
      console.error('Error loading config:', error);
      return false;
    }
  }
  return false;
}

// Authorization endpoints
app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', CLIENT_ID);
  authUrl.searchParams.append('scope', SCOPES);
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('state', state);
  
  res.redirect(authUrl.toString());
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  
  if (code) {
    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
        },
        body: new URLSearchParams({
          code: code,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        })
      });
      
      const data = await response.json();
      accessToken = data.access_token;
      refreshToken = data.refresh_token;
      
      // Get user info
      const userResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': 'Bearer ' + accessToken }
      });
      
      const userData = await userResponse.json();
      userId = userData.id;
      
      // Save config with the new tokens
      saveConfig();
      
      res.send('Authentication successful! You can close this window and return to the terminal.');
      console.log(`\nWelcome, ${userData.display_name}!`);
      startCLI();
    } catch (error) {
      console.error('Error during authentication:', error);
      res.send('Authentication failed. Please try again.');
    }
  } else {
    res.send('Authorization code not found. Please try again.');
  }
});

// API Helpers
async function refreshAccessToken() {
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });
    
    const data = await response.json();
    accessToken = data.access_token;
    if (data.refresh_token) {
      refreshToken = data.refresh_token;
    }
    
    // Save the refreshed token
    saveConfig();
    
    return accessToken;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

async function makeApiRequest(endpoint, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: { 'Authorization': 'Bearer ' + accessToken }
    };
    
    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
    }
    
    let response = await fetch(`https://api.spotify.com/v1${endpoint}`, options);
    
    // If token expired, refresh and retry
    if (response.status === 401) {
      await refreshAccessToken();
      options.headers['Authorization'] = 'Bearer ' + accessToken;
      response = await fetch(`https://api.spotify.com/v1${endpoint}`, options);
    }
    
    if (response.status === 204) {
      return true; // No content but successful
    }
    
    return await response.json();
  } catch (error) {
    console.error(`API request error (${endpoint}):`, error);
    return null;
  }
}

// Spotify control functions
async function getCurrentPlayback() {
  return await makeApiRequest('/me/player');
}

async function playPlaylist(playlistId) {
  return await makeApiRequest('/me/player/play', 'PUT', {
    context_uri: `spotify:playlist:${playlistId}`
  });
}

async function pausePlayback() {
  return await makeApiRequest('/me/player/pause', 'PUT');
}

async function resumePlayback() {
  return await makeApiRequest('/me/player/play', 'PUT');
}

async function getUserPlaylists() {
  const response = await makeApiRequest('/me/playlists?limit=50');
  return response?.items || [];
}

// Application monitoring
async function checkActiveApplication() {
  try {
    const activeWindow = await activeWin();
    if (!activeWindow) return;
    
    const appName = path.basename(activeWindow.owner.path);
    
    // Only react if application changed
    if (appName !== lastActiveApp) {
      lastActiveApp = appName;
      console.log(`App switched to: ${appName}`);
      
      // Check if we have a playlist for this app
      const appConfig = Object.entries(appPlaylists).find(([key]) => 
        appName.toLowerCase().includes(key.toLowerCase().replace('.exe', ''))
      );
      
      if (appConfig) {
        const [key, config] = appConfig;
        console.log(`Playing playlist "${config.playlistName}" for ${config.name}`);
        await playPlaylist(config.playlistId);
      }
    }
  } catch (error) {
    console.error('Error checking active application:', error);
  }
}

function startAppMonitoring() {
  if (isMonitoring) return;
  
  console.log('Starting application monitoring...');
  isMonitoring = true;
  
  // Check active window every 5 seconds
  appWatcherInterval = setInterval(checkActiveApplication, 5000);
}

function stopAppMonitoring() {
  if (!isMonitoring) return;
  
  console.log('Stopping application monitoring...');
  isMonitoring = false;
  
  if (appWatcherInterval) {
    clearInterval(appWatcherInterval);
    appWatcherInterval = null;
  }
}

// CLI commands
async function addAppPlaylist() {
  rl.question('Enter application name (e.g., chrome.exe): ', (appName) => {
    rl.question('Enter friendly name for this app: ', (friendlyName) => {
      rl.question('Enter playlist ID: ', (playlistId) => {
        rl.question('Enter playlist name: ', (playlistName) => {
          appPlaylists[appName] = {
            name: friendlyName,
            playlistId: playlistId,
            playlistName: playlistName
          };
          
          console.log(`Added "${friendlyName}" (${appName}) with playlist "${playlistName}"`);
          saveConfig();
          showMainMenu();
        });
      });
    });
  });
}

async function listAppPlaylists() {
  console.log('\nConfigured applications and playlists:');
  console.log('----------------------------------------');
  
  Object.entries(appPlaylists).forEach(([app, config]) => {
    console.log(`${config.name} (${app}) -> "${config.playlistName}" (${config.playlistId})`);
  });
  
  console.log('----------------------------------------\n');
  showMainMenu();
}

async function removeAppPlaylist() {
  rl.question('Enter application name to remove: ', (appName) => {
    if (appPlaylists[appName]) {
      const name = appPlaylists[appName].name;
      delete appPlaylists[appName];
      console.log(`Removed ${name} (${appName}) from the configuration`);
      saveConfig();
    } else {
      console.log(`Application ${appName} not found in configuration`);
    }
    showMainMenu();
  });
}

// Main CLI interface
function showMainMenu() {
  console.log('\n--- Spotify Co-Pilot Menu ---');
  console.log('1. Start app monitoring');
  console.log('2. Stop app monitoring');
  console.log('3. Add/Update app-playlist mapping');
  console.log('4. List app-playlist mappings');
  console.log('5. Remove app-playlist mapping');
  console.log('6. Manual playback control');
  console.log('7. Exit');
  
  rl.question('\nSelect an option: ', async (answer) => {
    switch (answer) {
      case '1':
        startAppMonitoring();
        showMainMenu();
        break;
      case '2':
        stopAppMonitoring();
        showMainMenu();
        break;
      case '3':
        await addAppPlaylist();
        break;
      case '4':
        await listAppPlaylists();
        break;
      case '5':
        await removeAppPlaylist();
        break;
      case '6':
        showPlaybackMenu();
        break;
      case '7':
        console.log('Exiting. Goodbye!');
        stopAppMonitoring();
        rl.close();
        process.exit(0);
        break;
      default:
        console.log('Invalid option. Please try again.');
        showMainMenu();
    }
  });
}

function showPlaybackMenu() {
  console.log('\n--- Playback Control ---');
  console.log('1. Play specific playlist');
  console.log('2. Pause playback');
  console.log('3. Resume playback');
  console.log('4. Back to main menu');
  
  rl.question('\nSelect an option: ', async (answer) => {
    switch (answer) {
      case '1':
        const playlists = await getUserPlaylists();
        if (playlists && playlists.length > 0) {
          console.log('\nYour playlists:');
          playlists.forEach((playlist, index) => {
            console.log(`${index + 1}. ${playlist.name} (${playlist.id})`);
          });
          
          rl.question('\nEnter playlist number to play: ', async (playlistIndex) => {
            const index = parseInt(playlistIndex) - 1;
            if (index >= 0 && index < playlists.length) {
              await playPlaylist(playlists[index].id);
              console.log(`Playing playlist: ${playlists[index].name}`);
            } else {
              console.log('Invalid playlist number');
            }
            showPlaybackMenu();
          });
        } else {
          console.log('No playlists found or error fetching playlists');
          showPlaybackMenu();
        }
        break;
      case '2':
        await pausePlayback();
        console.log('Playback paused');
        showPlaybackMenu();
        break;
      case '3':
        await resumePlayback();
        console.log('Playback resumed');
        showPlaybackMenu();
        break;
      case '4':
        showMainMenu();
        break;
      default:
        console.log('Invalid option. Please try again.');
        showPlaybackMenu();
    }
  });
}

// Startup function
async function startCLI() {
  showMainMenu();
}

// Main execution
console.log('💫 Spotify Co-Pilot Starting 💫');
console.log('------------------------------');

// Try to load existing configuration
if (loadConfig() && refreshToken) {
  console.log('Loaded saved configuration.');
  // Get a new access token from the refresh token
  await refreshAccessToken();
  
  // Get user info
  const userResponse = await makeApiRequest('/me');
  if (userResponse && userResponse.id) {
    userId = userResponse.id;
    console.log(`Welcome back, ${userResponse.display_name}!`);
    startCLI();
  } else {
    console.log('Failed to get user info. Please authenticate again.');
    // Start the auth flow
    app.listen(PORT, () => {
      console.log(`Please authenticate with Spotify. Opening browser...`);
      open(`http://localhost:${PORT}/login`);
    });
  }
} else {
  // Start the auth flow
  app.listen(PORT, () => {
    console.log(`Please authenticate with Spotify. Opening browser...`);
    open(`http://localhost:${PORT}/login`);
  });
}

process.on('SIGINT', () => {
  console.log('\nShutting down Spotify Co-Pilot...');
  stopAppMonitoring();
  process.exit(0);
});